import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import type { Express, RequestHandler } from 'express';
import { accountingDay } from '../src/ledger.js';
import { batchWindow, type CommercialBatch } from './batch-window.js';
import { workerAuthorized } from './channelTests.js';
import { dailyCommercialDigest } from './commercial-email.js';
import { DATA_DIR } from './data-directory.js';
import { db } from './db.js';
import { cloudBatchesEnabled, diagnosticMode, outboundEnabled } from './execution-role.js';
import { scheduler } from './scheduler.js';
import { intelligenceCycle } from './intelligence-cycle.js';

type Receipt = { day: string; phase: CommercialBatch; startedAt: string; completedAt?: string; runToken?: string; report?: string };

export function registerCommercialBatches(app: Express, admin: RequestHandler, openJarvisReady: () => boolean, planningPending: () => boolean) {
  const directory = path.join(DATA_DIR, 'batch-history');
  const record = (day: string, phase: CommercialBatch) => path.join(directory, day + '-' + phase + '.json');
  const read = (file: string): Receipt | undefined =>
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  const save = (file: string, value: Receipt) => {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file + '.tmp', JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  };
  let active = false;

  app.post('/api/batches/:phase/:action', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!cloudBatchesEnabled() || diagnosticMode()) return res.sendStatus(404);
    if (!workerAuthorized(req.headers.authorization, process.env.CENTRAL_BATCH_KEY || '')) return res.sendStatus(401);
    const phase = batchWindow();
    if (!phase || req.params.phase !== phase) return res.json({ state: 'fuera_de_horario' });
    const action = req.params.action;
    if (action !== 'prepare' && action !== 'complete' && action !== 'release' && action !== 'check') return res.sendStatus(404);
    if (action !== 'release' && phase === 'enviar' && !outboundEnabled()) return res.json({ state: 'envios_desactivados' });
    if (action !== 'release' && db.getSchedulerState().automationsPaused) return res.json({ state: 'pausado' });
    if (active) return res.status(409).json({ error: 'Ya se está preparando una tanda.' });
    const day = accountingDay();
    const file = record(day, phase);
    active = true;
    try {
      let receipt = read(file);
      if (receipt?.completedAt) return res.json({ state: 'completada', day, phase });
      if (action === 'check') return res.json({ state: receipt?.runToken ? 'asignada' : 'disponible' });
      if (action === 'prepare') {
        if (receipt?.runToken) return res.status(409).json({ error: 'La tanda ya está asignada a un ejecutor.' });
        if (phase === 'buscar' && !openJarvisReady()) {
          return res.status(503).json({ error: 'OpenJarvis todavía no está disponible.' });
        }
        receipt ??= { day, phase, startedAt: new Date().toISOString() };
        save(file, receipt);
        const deadline = Date.now() + 240000;
        const cycles = phase === 'buscar' ? 8 : 1;
        for (let index = 0; index < cycles && batchWindow() === phase && !res.destroyed; index++) {
          if (!await scheduler.tick(phase)) return res.json({ state: 'pausado' });
          if (db.getResearchState().blocked || index + 1 === cycles) break;
          await wait(10000);
        }
        if (phase === 'buscar') {
          if (db.getResearchState().blocked) return res.status(503).json({ error: 'La fuente de investigación requiere revisión.' });
          const waitingForPlans = planningPending();
          while (planningPending() && Date.now() < deadline && batchWindow() === phase &&
              !db.getSchedulerState().automationsPaused && !res.destroyed && openJarvisReady()) {
            await wait(5000);
          }
          if (res.destroyed) return;
          if (planningPending() || batchWindow() !== phase || !openJarvisReady()) {
            return res.status(503).json({ error: 'Quedaron estrategias de OpenJarvis pendientes.' });
          }
          if (db.getSchedulerState().automationsPaused) return res.json({ state: 'pausado' });
          if (waitingForPlans) {
            // The bounded initial cycles may have run before the model produced usable queries.
            if (!await scheduler.tick(phase)) return res.json({ state: 'pausado' });
          } else await intelligenceCycle();
          if (planningPending() || db.getResearchState().blocked || res.destroyed) {
            return res.status(503).json({ error: 'La recuperación de la búsqueda quedó pendiente.' });
          }
          save(file, { ...receipt, completedAt: new Date().toISOString() });
          return res.json({ state: 'completada', day, phase });
        }
        const runToken = randomUUID();
        save(file, { ...receipt, runToken });
        return res.json({ state: 'preparada', day, phase, runToken });
      }
      if (!receipt?.runToken || req.body?.runToken !== receipt.runToken) return res.status(409).json({ error: 'La tanda no está asignada a esta ejecución.' });
      delete receipt.runToken;
      if (action === 'release') {
        save(file, receipt);
        return res.json({ state: 'pendiente' });
      }
      const report = phase === 'revisar' ? dailyCommercialDigest(day, '').content : undefined;
      save(file, { ...receipt, completedAt: new Date().toISOString(), report });
      return res.json({ state: 'completada', day, phase });
    } catch {
      return res.status(500).json({ error: 'La tanda quedó pendiente de revisión. Se conservó el registro existente.' });
    } finally {
      active = false;
    }
  });

  app.get('/api/batches/today', admin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!cloudBatchesEnabled()) return res.sendStatus(404);
    const day = accountingDay();
    const receipts = (['buscar', 'enviar', 'revisar'] as const).map(phase => {
      const receipt = read(record(day, phase));
      return { day, phase, startedAt: receipt?.startedAt, completedAt: receipt?.completedAt, report: receipt?.report };
    });
    return res.json({ day, receipts });
  });
}
