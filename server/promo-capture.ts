import type { Express } from 'express';
import type { Browser } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { passwordlessTestingEnabled, requireAdminAuth } from './auth.js';
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
    const product = commercialCatalog().find(product => product.id === req.body?.appId ||
      product.website === req.body?.url);
    const { headline, cta, duration } = req.body ?? {};
    if (!product || ![15, 20, 30].includes(duration) ||
        typeof headline !== 'string' || !headline.trim() || headline.length > 95 ||
        typeof cta !== 'string' || !cta.trim() || cta.length > 100) {
      return res.status(400).json({ error: 'Elegí una aplicación y completá el título y el cierre del video.' });
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
        recordVideo: { dir: directory, size: { width: 1280, height: 720 } },
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
      const recording = page.video();
      const recordingStartedAt = performance.now();
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
      if (!sections.length) {
        return res.status(422).json({ error: 'La página pública no ofrece distintas secciones para mostrar. Hace falta una grabación autorizada de la aplicación.' });
      }
      const startOffset = (performance.now() - recordingStartedAt) / 1000;
      const sceneLength = (duration + 1) * 1000 / (sections.length + 1);
      await page.waitForTimeout(sceneLength);
      for (const section of sections) {
        await page.evaluate(top => window.scrollTo({ top, behavior: 'smooth' }), section);
        await page.waitForTimeout(sceneLength);
      }
      await context.close();
      if (!recording) throw new Error('Chromium no devolvió una grabación.');
      const output = await renderPromoMp4(directory, await recording.path(), {
        appName: product.name, headline, cta, duration, startOffset
      });
      const cleanupDirectory = directory;
      res.set({ 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store', 'X-Promo-Scenes': String(sections.length + 1) });
      transferring = true;
      res.sendFile(output, error => {
        void rm(cleanupDirectory, { recursive: true, force: true }).catch(console.error);
        if (error && !res.headersSent) res.status(503).end();
      });
    } catch (error) {
      console.error('[promo-capture]', error instanceof Error ? error.message : error);
      if (!res.headersSent) res.status(503).json({ error: 'No se pudo generar el MP4. Revisá que Chromium y FFmpeg estén disponibles y que la página pública cargue.' });
    } finally {
      await browser?.close().catch(console.error);
      if (directory && !transferring) await rm(directory, { recursive: true, force: true }).catch(console.error);
      busy = false;
    }
  });
}
