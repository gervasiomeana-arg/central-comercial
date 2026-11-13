import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJSON } from './recovery.mjs';
export async function saveCheckpoint(config, runtimeDir) {
  const response = await fetch(new URL('/api/local-runtime/checkpoint', config.url), { redirect: 'error',
    headers: { Authorization: `Bearer ${config.key}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('La copia de registros no pudo obtenerse.');
  const raw = await response.text(); if (raw.length > 25000000) throw new Error('La copia supera el tamaño previsto. Se conserva la anterior.');
  const snapshot = JSON.parse(raw);
  if (snapshot.payload?.format !== 1 || !snapshot.payload.files?.['central_comercial_db.json'] ||
    createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex') !== snapshot.sha256) throw new Error('La copia recibida no es válida.');
  const folder = path.join(runtimeDir, 'backups'); fs.mkdirSync(folder, { recursive: true });
  const latest = path.join(folder, 'latest.json');
  if (fs.existsSync(latest)) fs.copyFileSync(latest, path.join(folder, `checkpoint-${Date.now()}.json`));
  atomicJSON(latest, snapshot);
  const previous = fs.readdirSync(folder).filter(f => /^checkpoint-\d+\.json$/.test(f)).sort().reverse();
  for (const file of previous.slice(12)) fs.rmSync(path.join(folder, file));
  return Date.now();
}
