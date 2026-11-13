import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { initializeJournal, reserveMessage, finishMessage } from '../email-worker/journal.mjs';
import { retryDelay, upgradeWorker } from '../desktop/recovery.mjs';
import { saveCheckpoint } from '../desktop/checkpoint.mjs';

const job = { messageId: 'm-1', recipient: 'owner@example.com', subject: 'Review', content: 'Text', inReplyTo: '', lease: 'first-lease' };
test('un corte antes de confirmar SMTP no provoca un segundo envío al recuperar el registro', () => {
  let state: any = { outcomes: {} };
  assert.equal(reserveMessage(state, job).shouldSend, true);
  state = JSON.parse(JSON.stringify(state));
  const resumed = reserveMessage(state, { ...job, lease: 'new-lease' });
  assert.equal(resumed.shouldSend, false); assert.equal(resumed.result.outcome, 'unknown'); assert.equal(resumed.result.lease, 'new-lease');
  const other: any = { outcomes: {} }; reserveMessage(other, job);
  finishMessage(other, job, { ...job, outcome: 'accepted', response: '250 accepted' });
  delete other.outcomes[job.messageId];
  assert.equal(reserveMessage(JSON.parse(JSON.stringify(other)), { ...job, lease: 'after-restore' }).shouldSend, false);
  const changed = reserveMessage(other, { ...job, recipient: 'other@example.com' });
  assert.equal(changed.shouldSend, false); assert.equal(changed.result.outcome, 'unknown');
  const legacy: any = { outcomes: { 'm-1': { ...job, outcome: 'unknown', response: 'interrupted' } } };
  initializeJournal(legacy); assert.equal(reserveMessage(legacy, job).shouldSend, false);
});

test('actualizar el ejecutor conserva claves, sesión y versión anterior; la espera es acotada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-recovery-'));
  try {
    const source = path.join(dir, 'new.mjs'), target = path.join(dir, 'worker.mjs');
    fs.writeFileSync(source, 'new version'); fs.writeFileSync(target, 'old version'); fs.writeFileSync(path.join(dir, '.env'), 'private-config');
    fs.mkdirSync(path.join(dir, 'private-state')); fs.writeFileSync(path.join(dir, 'private-state', 'session'), 'saved-session');
    assert.equal(upgradeWorker(source, target), true);
    assert.equal(fs.readFileSync(target, 'utf8'), 'new version');
    assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), 'private-config');
    assert.equal(fs.readFileSync(path.join(dir, 'private-state', 'session'), 'utf8'), 'saved-session');
    const backups = fs.readdirSync(path.join(dir, 'central-worker-backups'));
    assert.equal(fs.readFileSync(path.join(dir, 'central-worker-backups', backups[0]), 'utf8'), 'old version');
    upgradeWorker(source, target); assert.equal(fs.readdirSync(path.join(dir, 'central-worker-backups')).length, 1);
    assert.equal(retryDelay(1), 5000); assert.equal(retryDelay(100), 300000);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('la copia local verifica integridad y conserva la copia anterior ante un error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-checkpoint-'));
  let valid = true;
  const server = http.createServer((_req, res) => {
    const payload = { format: 1, createdAt: '2026-11-13T20:00:00Z', files: { 'central_comercial_db.json': { contacts: [] } } };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ payload, sha256: valid ? createHash('sha256').update(JSON.stringify(payload)).digest('hex') : 'wrong' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = { url: new URL(`http://127.0.0.1:${(server.address() as any).port}`), key: 'test-only' };
    await saveCheckpoint(config, dir); const file = path.join(dir, 'backups', 'latest.json'), saved = fs.readFileSync(file, 'utf8');
    valid = false; await assert.rejects(() => saveCheckpoint(config, dir), /no es válida/);
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('una base corrupta detiene el arranque y no reemplaza registros por ejemplos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-corrupt-db-'));
  try {
    const file = path.join(dir, 'central_comercial_db.json'); fs.writeFileSync(file, '{interrupted-write');
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "await import('./server/db.ts')"], { cwd: process.cwd(), env: { ...process.env, CENTRAL_DATA_DIR: dir }, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(child.status, 0); assert.match(child.stderr, /Se conservó el archivo/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{interrupted-write');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
