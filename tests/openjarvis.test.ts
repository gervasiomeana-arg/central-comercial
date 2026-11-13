import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { JarvisQueue, validateStrategy, registerJarvisWorkerRoutes } from '../server/openjarvis.js';
import { generateStrategy, inspectJarvis, localJarvisURL } from '../openjarvis-worker/client.mjs';
import express from 'express';
import type { JarvisContext } from '../src/openjarvis-types.js';

const context: JarvisContext = { app: { id: 'app-open-voley', name: 'Open Voley', description: 'Scouting de voleibol', audience: 'Clubes', website: 'https://openvoley.com', features: ['Scouting'] }, country: 'Argentina', goal: { month: '2026-11', targetClients: 5, remainingClients: 5, dailyEmailLimit: 10, dailyResearchLimit: 12 } };
const strategy = { segments: [{ name: 'Clubes de voleibol', reason: 'Preparación de partidos' }], searchQueries: ['clubes voleibol Argentina sitio oficial'], campaignAngle: 'Presentar scouting', nextSteps: ['Verificar fuentes institucionales'], ownerQuestions: [] };
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-jarvis-'));
  let now = 1000000;
  const file = path.join(dir, 'plans.json');
  return { dir, file, queue: new JarvisQueue(file, () => now), advance: (n: number) => { now += n; } };
}

test('cola conserva resultados, deduplica y exige un lease válido', () => {
  const f = fixture();
  try {
    assert.throws(() => f.queue.enqueue(context), /conectá/);
    f.queue.heartbeat('worker-1', true, 'local-model');
    const id = f.queue.enqueue(context);
    assert.equal(f.queue.enqueue(context), id);
    assert.throws(() => f.queue.heartbeat('other-worker', true, 'local-model'), /Ya hay/);
    const job = f.queue.claim('worker-1')!;
    assert.equal(f.queue.claim('worker-1'), null);
    assert.throws(() => f.queue.complete(id, 'other-worker', job.lease, { strategy }), /no asignado/);
    assert.throws(() => f.queue.complete(id, 'worker-1', 'wrong', { strategy }), /no asignado/);
    f.queue.complete(id, 'worker-1', job.lease, { strategy });
    f.queue.complete(id, 'worker-1', job.lease, { strategy });
    const restored = new JarvisQueue(f.file);
    assert.equal(restored.status().plans[0].state, 'completed');
    assert.deepEqual(restored.status().plans[0].strategy, strategy);
    assert.ok(!JSON.stringify(restored.status()).includes('leaseHash'));
    assert.equal(f.queue.enqueue(context), id);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('tarea interrumpida vence sin regenerarse y una respuesta mal formada no se aplica', () => {
  const f = fixture();
  try {
    f.queue.heartbeat('worker-1', true, 'local-model');
    const id = f.queue.enqueue(context), job = f.queue.claim('worker-1')!;
    assert.throws(() => f.queue.complete(id, 'worker-1', job.lease, { strategy: {} }), /incompleta/);
    f.advance(600001);
    f.queue.heartbeat('worker-1', true, 'local-model');
    assert.equal(f.queue.status().plans[0].state, 'failed');
    assert.equal(f.queue.claim('worker-1'), null);
    assert.throws(() => f.queue.complete(id, 'worker-1', job.lease, { strategy }), /no asignado/);
    assert.deepEqual(validateStrategy({ ...strategy, shell: 'untrusted command' }), strategy);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('API OpenJarvis local: verifica modelo y procesa JSON sin herramientas ni proveedor externo', async () => {
  let submitted: any;
  const fake = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify({ status: 'ok' }));
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'local-model' }] }));
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/health' }); return res.end(); }
    let body = ''; for await (const chunk of req) body += chunk;
    submitted = JSON.parse(body);
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(strategy) } }] }));
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', r));
  try {
    const base = localJarvisURL(`http://127.0.0.1:${(fake.address() as any).port}`);
    assert.equal(await inspectJarvis(base, 'local-model', ''), 'local-model');
    await assert.rejects(() => inspectJarvis(base, 'absent-model', ''), /no está cargado/);
    assert.deepEqual(await generateStrategy(base, 'local-model', context, ''), strategy);
    assert.equal(submitted.tools, null);
    assert.equal(submitted.stream, false);
    assert.deepEqual(JSON.parse(submitted.messages[1].content), context);
    assert.throws(() => localJarvisURL('https://example.com'), /únicamente/);
    assert.throws(() => localJarvisURL('http://127.0.0.1:8000/?token=secret'), /únicamente/);
  } finally { await new Promise<void>(r => fake.close(() => r())); }
});

test('rutas del puente rechazan peticiones sin clave incluso si el panel usa acceso personal', async () => {
  const f = fixture(), app = express(); app.use(express.json()); registerJarvisWorkerRoutes(app, f.queue);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  try {
    const result = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/openjarvis/worker/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workerId: 'fake' }) });
    assert.equal(result.status, 401);
  } finally { await new Promise<void>(r => server.close(() => r())); fs.rmSync(f.dir, { recursive: true, force: true }); }
});
