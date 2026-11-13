import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Express } from 'express';
import { db } from './db.js';
import { DATA_DIR } from './data-directory.js';
import { workerAuthorized } from './channelTests.js';
function withoutSecrets(value: any): any {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret|token|api.?key|lease/i.test(key)).map(([key, item]) => [key, withoutSecrets(item)]));
  return value;
}
export function registerCheckpointRoute(app: Express) {
  app.get('/api/local-runtime/checkpoint', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Computadora no autorizada.' });
    try {
      const files: Record<string, unknown> = { 'central_comercial_db.json': withoutSecrets(db.getRaw()) };
      for (const name of ['channel_test_jobs.json', 'openjarvis_plans.json', 'assistant_history.json']) {
        const file = path.join(DATA_DIR, name);
        if (fs.existsSync(file)) files[name] = withoutSecrets(JSON.parse(fs.readFileSync(file, 'utf8')));
      }
      const payload = { format: 1, createdAt: new Date().toISOString(), files };
      res.json({ payload, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') });
    } catch { res.status(503).json({ error: 'No se pudo crear una copia coherente. Se conservó el respaldo anterior.' }); }
  });
}
