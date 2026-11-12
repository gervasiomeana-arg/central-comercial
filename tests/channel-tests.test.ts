import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChannelTestQueue, workerAuthorized, TEST_RECIPIENTS } from '../server/channelTests.js';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-queue-'));
  let now = 1000000;
  const queue = new ChannelTestQueue(path.join(dir, 'jobs.json'), () => now);
  return { dir, queue, advance: (ms: number) => { now += ms; }, clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
test('worker authorization requires the independent private key', () => {
  const key = 'k'.repeat(32);
  assert.equal(workerAuthorized(undefined, key), false);
  assert.equal(workerAuthorized('Bearer ' + key, ''), false);
  assert.equal(workerAuthorized('Bearer other', key), false);
  assert.equal(workerAuthorized('Bearer ' + key, key), true);
});
test('disconnected channels never create orders or successful results', () => {
  const f = fixture();
  try { assert.throws(() => f.queue.enqueue(['email']), /conectar/); assert.equal(f.queue.status().jobs.length, 0); }
  finally { f.clean(); }
});
test('both-channel creation is atomic and destinations cannot be overridden', () => {
  const f = fixture();
  try {
    f.queue.heartbeat('pc', true, false);
    assert.throws(() => f.queue.enqueue(['email', 'whatsapp']), /conectar/);
    assert.equal(f.queue.status().jobs.length, 0);
    f.queue.heartbeat('pc', true, true);
    const jobs = f.queue.enqueue(['email', 'whatsapp']);
    assert.equal(jobs.length, 2);
    for (const job of jobs) assert.equal(job.recipient, TEST_RECIPIENTS[job.channel]);
    assert.throws(() => f.queue.enqueue(['email']), /pendiente/);
  } finally { f.clean(); }
});
test('lease prevents duplicate claim, forged completion and replay', () => {
  const f = fixture();
  try {
    f.queue.heartbeat('pc', true, false); f.queue.enqueue(['email']);
    const job = f.queue.claim('pc')!;
    assert.equal(f.queue.claim('pc'), null);
    assert.throws(() => f.queue.complete(job.id, 'other', job.lease!, { state: 'aceptado_servicio' }), /asignada/);
    assert.throws(() => f.queue.complete(job.id, 'pc', job.lease!, { state: 'aceptado_servicio' }), /confirmación/);
    assert.ok(!JSON.stringify(f.queue.status()).includes(job.lease!));
    f.queue.complete(job.id, 'pc', job.lease!, { state: 'aceptado_servicio', providerId: 'server-id', evidence: 'SMTP 250' });
    assert.throws(() => f.queue.complete(job.id, 'pc', job.lease!, { state: 'fallido' }), /asignada/);
    assert.equal(f.queue.status().jobs[0].state, 'aceptado_servicio');
  } finally { f.clean(); }
});
test('expired or restarted job never gets sent again automatically', () => {
  const f = fixture();
  try {
    f.queue.heartbeat('pc', true, false); f.queue.enqueue(['email']); f.queue.claim('pc');
    f.advance(180001);
    assert.equal(f.queue.status().jobs[0].state, 'resultado_desconocido');
    f.queue.heartbeat('new-pc', true, false); assert.equal(f.queue.claim('new-pc'), null);
    const restarted = new ChannelTestQueue(path.join(f.dir, 'jobs.json'));
    assert.equal(restarted.status().jobs[0].state, 'resultado_desconocido');
  } finally { f.clean(); }
});
test('only one live worker and no more than five tests per day', () => {
  const f = fixture();
  try {
    f.queue.heartbeat('pc', true, false);
    assert.throws(() => f.queue.heartbeat('other', true, true), /otro ejecutor/);
    for (let i = 0; i < 5; i++) {
      f.queue.enqueue(['email']); const job = f.queue.claim('pc')!;
      f.queue.complete(job.id, 'pc', job.lease!, { state: 'fallido', evidence: 'Rechazo de prueba' });
    }
    assert.throws(() => f.queue.enqueue(['email']), /cinco/);
  } finally { f.clean(); }
});
