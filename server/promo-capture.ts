import type { Express } from 'express';
import type { Browser } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { passwordlessTestingEnabled, requireAdminAuth } from './auth.js';
import { db } from './db.js';
import { commercialCatalog } from './commercial-catalog.js';
import { cloudMonitorMode } from './execution-role.js';
import { renderPromoMp4 } from './promo-mp4.js';

const publicHosts = new Set([
  'openvoley.com', 'www.openvoley.com', 'open-voley-2026.ai.studio',
  'visibility-ia.ai.studio', 'funeraria-control.ai.studio', 'neuroplaneta.ai.studio',
]);
const assetHosts = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com']);
let busy = false;

function configuredChromium() {
  const candidates = [process.env.CHROME_PATH, process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    ...(process.platform === 'win32'
      ? [path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')]
      : [])];
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

async function launchChromium() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
  const { chromium } = await import('playwright');
  const executablePath = configuredChromium();
  if (executablePath) return chromium.launch({ executablePath, headless: true });
  if (process.platform === 'linux' && process.arch === 'x64') {
    const { default: packaged } = await import('@sparticuz/chromium');
    return chromium.launch({
      executablePath: await packaged.executablePath(),
      args: packaged.args,
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}

export function registerPromoCaptureRoutes(app: Express) {
  app.post('/api/promo/capture', requireAdminAuth, async (req, res) => {
    if (cloudMonitorMode() && passwordlessTestingEnabled()) {
      return res.status(409).json({ error: 'Activá la autenticación de administración para generar videos en la publicación.' });
    }
    const saved = typeof req.body?.appId === 'string' ? db.getApplicationById(req.body.appId) : undefined;
    const hostname = (value: unknown) => {
      try { return typeof value === 'string' ? new URL(value).hostname.replace(/^www\./, '') : ''; }
      catch { return ''; }
    };
    const product = commercialCatalog().find(product => product.id === req.body?.appId ||
      product.slug === saved?.slug || hostname(product.website) === hostname(saved?.website ?? req.body?.url));
    const { headline, cta, duration } = req.body ?? {};
    if (!product) return res.status(400).json({ error: 'La aplicación elegida no tiene una página pública compatible.' });
    if (typeof headline !== 'string' || !headline.trim() || headline.trim().length > 95) {
      return res.status(400).json({ error: 'El título debe tener entre 1 y 95 caracteres.' });
    }
    if (typeof cta !== 'string' || !cta.trim() || cta.trim().length > 100) {
      return res.status(400).json({ error: 'El cierre debe tener entre 1 y 100 caracteres.' });
    }
    if (![15, 20, 30].includes(duration)) {
      return res.status(400).json({ error: 'Elegí un video de 15, 20 o 30 segundos.' });
    }
    if (busy) return res.status(429).json({ error: 'Ya hay un video en preparación. Volvé a intentar cuando termine.' });
    busy = true;
    let directory: string | undefined;
    let browser: Browser | undefined;
    let transferring = false;
    try {
      directory = await mkdtemp(path.join(os.tmpdir(), 'central-promo-'));
      browser = await launchChromium();
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        serviceWorkers: 'block',
      });
      // No signed-in browser state is used. Only public pages and approved assets may load.
      await context.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        const externalAsset = !request.isNavigationRequest() && assetHosts.has(url.hostname);
        const allowed = url.protocol === 'https:' && !url.port && !url.username && !url.password &&
          (publicHosts.has(url.hostname) || externalAsset) && ['GET', 'HEAD'].includes(request.method());
        return allowed ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      const response = await page.goto(product.website, { waitUntil: 'domcontentloaded', timeout: 18000 });
      if (!response?.ok() || !publicHosts.has(new URL(page.url()).hostname)) {
        return res.status(422).json({ error: 'La página pública de la aplicación no respondió correctamente.' });
      }
      await page.locator('body').waitFor({ state: 'visible', timeout: 6000 });
      await page.waitForFunction(() => (document.body.innerText || '').trim().length >= 60, { timeout: 6500 });
      const sections = await page.evaluate(() => {
        const scrollHeight = document.scrollingElement?.scrollHeight ?? innerHeight;
        return [...document.querySelectorAll('h2, h3')]
          .filter(element => element.getBoundingClientRect().height > 0)
          .map(element => Math.min(scrollHeight - innerHeight, element.getBoundingClientRect().top + scrollY - 90))
          .filter((offset, index, offsets) => offset >= 280 &&
            offsets.findIndex(previous => Math.abs(previous - offset) < 315) === index)
          .slice(0, 3);
      });
      const card = await context.newPage();
      await card.setViewportSize({ width: 720, height: 1280 });
      await card.setContent(`<!doctype html><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;width:720px;height:1280px;background:#101d2c;color:#fff;font:32px Arial,sans-serif;text-align:center;padding:120px 24px 0;overflow:hidden}
        #brand{color:#8fd9c8;font-weight:bold;letter-spacing:2px;margin:0 0 36px}
        #headline{font-size:44px;line-height:1.1;min-height:185px;margin:0 20px 24px;overflow-wrap:anywhere}
        #scene{width:672px;height:378px;border-top:4px solid #8fd9c8;object-fit:cover}
        #cta{font-size:34px;margin:64px 20px 0;overflow-wrap:anywhere}
        </style><p id="brand"></p><h1 id="headline"></h1><img id="scene" alt=""><p id="cta"></p>`);
      const scenes: Buffer[] = [];
      const offsets = [0, ...sections];
      for (const [index, offset] of offsets.entries()) {
        await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), offset);
        const image = await page.screenshot({ timeout: 8000 });
        await card.evaluate(async ({ name, title, ending, source }) => {
          document.getElementById('brand')!.textContent = name;
          document.getElementById('headline')!.textContent = title;
          document.getElementById('cta')!.textContent = ending;
          const image = document.getElementById('scene') as HTMLImageElement;
          image.src = source;
          await image.decode();
        }, { name: product.name, title: headline.trim(), ending: index === offsets.length - 1 ? cta.trim() : '',
          source: 'data:image/png;base64,' + image.toString('base64') });
        scenes.push(await card.screenshot({ timeout: 8000 }));
      }
      const output = await renderPromoMp4(directory, scenes, duration);
      const cleanupDirectory = directory;
      res.set({ 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store', 'X-Promo-Scenes': String(scenes.length) });
      transferring = true;
      res.sendFile(output, error => {
        void rm(cleanupDirectory, { recursive: true, force: true }).catch(console.error);
        if (error && !res.headersSent) res.status(503).end();
      });
    } catch (error) {
      console.error('[promo-capture]', error instanceof Error ? error.message : error);
      if (!res.headersSent) res.status(503).json({ error: 'No se pudo generar el MP4. Revisá que Chrome o Edge y FFmpeg estén disponibles y que la página pública cargue.' });
    } finally {
      await browser?.close().catch(console.error);
      if (directory && !transferring) await rm(directory, { recursive: true, force: true }).catch(console.error);
      busy = false;
    }
  });
}
