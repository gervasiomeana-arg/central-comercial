import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const run = promisify(execFile);

export async function renderPromoMp4(directory: string, footage: string, options: {
  appName: string; headline: string; cta: string; duration: number; startOffset?: number;
}) {
  const { appName, headline, cta, duration, startOffset = 0 } = options;
  const wrap = (text: string) => {
    const lines: string[] = [];
    for (const word of text.trim().split(/\s+/)) {
      const last = lines.at(-1);
      if (last && last.length + word.length < 35) lines[lines.length - 1] += ' ' + word;
      else lines.push(word);
    }
    return lines.join('\n');
  };
  await Promise.all([
    writeFile(path.join(directory, 'brand.txt'), appName),
    writeFile(path.join(directory, 'headline.txt'), wrap(headline)),
    writeFile(path.join(directory, 'cta.txt'), wrap(cta))
  ]);

  const text = (file: string, style: string) =>
    `drawtext=font=DejaVu Sans:textfile=${file}.txt:expansion=none:${style}`;
  const filter = [
    'fps=24',
    'scale=672:378:force_original_aspect_ratio=decrease',
    'pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x101d2c',
    'drawbox=x=24:y=410:w=672:h=4:color=0x8fd9c8:t=fill',
    text('brand', 'fontcolor=0x8fd9c8:fontsize=29:x=(w-tw)/2:y=135'),
    text('headline', 'fontcolor=white:fontsize=39:x=(w-tw)/2:y=234:line_spacing=10'),
    text('cta', `fontcolor=white:fontsize=32:x=(w-tw)/2:y=960:line_spacing=10:enable='gte(t,${duration - 5})'`),
    'fade=t=in:st=0:d=0.45',
    `fade=t=out:st=${duration - 0.5}:d=0.5`,
  ].join(',');
  const output = path.join(directory, 'promo.mp4');
  await run(process.env.FFMPEG_PATH || ffmpeg.path, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', String(startOffset), '-i', footage,
    '-t', String(duration), '-vf', filter, '-an', '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '22',
    '-movflags', '+faststart', '-threads', '2', '-y', output,
  ], { cwd: directory, timeout: 60000, windowsHide: true });
  return output;
}
