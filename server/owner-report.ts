import fs from 'node:fs';
import path from 'node:path';
import type { Router } from 'express';
import { accountingDay } from '../src/ledger.js';
import { diagnosticMode } from './execution-role.js';
import { TEST_RECIPIENTS } from './channelTests.js';
import { whatsappStatus } from './commercial-whatsapp.js';

export function registerOwnerReportRoutes(router: Router) {
  router.post('/whatsapp/link-by-phone', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.CENTRAL_LOCAL_MODE !== 'true' || !process.env.LOCALAPPDATA || diagnosticMode()) {
      return res.status(403).json({ error: 'La vinculación se inicia desde Central Comercial en la PC dedicada.' });
    }
    if (whatsappStatus().ready) return res.json({ alreadyConnected: true });
    const root = path.join(process.env.LOCALAPPDATA, 'CentralComercial', 'WhatsApp', 'private-state');
    try {
      fs.writeFileSync(path.join(root, 'link-by-phone-request'), TEST_RECIPIENTS.whatsapp, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        return res.status(503).json({ error: 'El ejecutor local de WhatsApp no pudo recibir la solicitud.' });
      }
    }
    return res.status(202).json({ alreadyConnected: false });
  });
  router.all('/owner-report', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.CENTRAL_LOCAL_MODE !== 'true' || !process.env.LOCALAPPDATA) {
      return res.status(403).json({ error: 'El informe inmediato se solicita desde Central Comercial en tu PC.' });
    }
    if (req.method !== 'GET' && req.method !== 'POST') return res.sendStatus(405);
    const day = accountingDay(new Date());
    const root = path.join(process.env.LOCALAPPDATA, 'CentralComercial', 'WhatsApp', 'private-state');
    const request = path.join(root, 'owner-report-request-' + day);
    const journal = path.join(root, 'owner-reports.json');
    const ready = !diagnosticMode() && whatsappStatus().ready && fs.existsSync(root);
    try {
      if (req.method === 'POST') {
        if (!ready) return res.status(409).json({ error: 'WhatsApp debe estar vinculado y activo en tu PC.' });
        try {
          fs.closeSync(fs.openSync(request, 'wx', 0o600));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      const entries = fs.existsSync(journal) ? JSON.parse(fs.readFileSync(journal, 'utf8')) : {};
      const report = entries['instant-' + day];
      return res.json({ day, ready, status: report?.status ?? (fs.existsSync(request) ? 'pendiente' : 'sin_intento') });
    } catch {
      return res.status(503).json({ error: 'No se pudo consultar el registro local del informe.' });
    }
  });
}
