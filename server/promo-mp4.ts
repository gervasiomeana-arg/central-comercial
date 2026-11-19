import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const run = promisify(execFile);

export async function renderPromoMp4(directory: string, scenes: Buffer[], duration: number) {
  const filenames = scenes.map((_, index) => `scene-${index}.png`);
  await Promise.all(scenes.map((image, index) => writeFile(path.join(directory, filenames[index]), image)));
  const timeline = filenames.flatMap(filename => [`file '${filename}'`, `duration ${duration / scenes.length}`]);
  timeline.push(`file '${filenames.at(-1)}'`);
  await writeFile(path.join(directory, 'timeline.txt'), timeline.join('\n') + '\n');
  const output = path.join(directory, 'promo.mp4');
  await run(process.env.FFMPEG_PATH || ffmpeg.path, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '1', '-i', 'timeline.txt',
    '-t', String(duration), '-vf', 'fps=24', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast', '-crf', '22', '-movflags', '+faststart', '-threads', '2', '-y', output,
  ], { cwd: directory, timeout: 60000, windowsHide: true });
  return output;
}
