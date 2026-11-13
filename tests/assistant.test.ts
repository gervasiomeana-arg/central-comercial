import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AssistantQueue, buildAssistantReport } from '../server/assistant.js';
import { JarvisQueue } from '../server/openjarvis.js';
import type { DatabaseSchema } from '../server/db.js';

const now = new Date('2026-11-13T20:00:00Z');
const data = {
  applications: [{ id: 'a', name: 'Open Voley' }, { id: 'b', name: 'Visibility AI' }],
  contacts: [{ interestedAppIds: ['a'], email: 'private@example.com' }],
  campaigns: [{ appId: 'a', status: 'activa' }],
  conversations: [{ appId: 'a', requiresHumanIntervention: false, messages: [
    { direction: 'outbound', status: 'enviado' },
    { direction: 'outbound', status: 'aceptado_proveedor', providerEvidence: 'SMTP accepted' },
    { direction: 'inbound', providerMessageId: 'real-inbound', content: 'Private text' }
  ] }],
  payments: [{ appId: 'a', status: 'confirmado', currency: 'USD', amount: 20 }, { appId: 'a', status: 'pendiente_confirmacion_manual', currency: 'USD', amount: 999 }],
  subscriptions: [{ appId: 'a', status: 'activa', clientId: 'c' }],
  scheduler: { automationsPaused: false, isRunning: true },
  commercialEmailWorker: { at: now.getTime(), send: true }
} as unknown as DatabaseSchema;
const report = buildAssistantReport(data, { month: '2026-11', targetClients: 5, remaining: 4 }, 'a', now);

test('informe filtra por app, cuenta solo evidencia y no expone mensajes o identidades', () => {
  assert.match(report.text, /aceptación documentada del proveedor: 1/);
  assert.match(report.text, /USD 20/);
  assert.match(report.text, /meta es conjunta/);
  assert.match(report.text, /acumulado registrado/);
  assert.ok(!report.text.includes('999'));
  assert.ok(!report.text.includes('private@example.com'));
  assert.ok(!report.text.includes('Private text'));
  const other = buildAssistantReport(data, { month: '2026-11', targetClients: 5, remaining: 4 }, 'b', now);
  assert.match(other.text, /Contactos registrados: 0/);
  assert.throws(() => buildAssistantReport(data, { month: '2026-11', targetClients: 5, remaining: 4 }, 'missing'), /no encontrada/);
});

test('informes funcionan sin modelo y una orden no se presenta como ejecutada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-assistant-'));
  try {
    const jarvis = new JarvisQueue(path.join(dir, 'plans.json'));
    const queue = new AssistantQueue(path.join(dir, 'history.json'), jarvis);
    queue.ask('Informe actual', report, 'report');
    assert.equal(queue.status().entries[0].answer, report.text);
    queue.ask('Envia promociones', report);
    assert.match(queue.status().entries[1].answer!, /No ejecuté/);
    assert.throws(() => queue.ask('Recomendame otro segmento', report), /no está listo/);
    assert.equal(new AssistantQueue(path.join(dir, 'history.json'), jarvis).status().entries.length, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('conversación exige puente actualizado y asignación; una confirmación duplicada no regenera', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-assistant-'));
  try {
    const jarvis = new JarvisQueue(path.join(dir, 'plans.json'));
    const queue = new AssistantQueue(path.join(dir, 'history.json'), jarvis);
    jarvis.heartbeat('worker', true, 'local');
    assert.equal(queue.status().ready, false);
    jarvis.heartbeat('worker', true, 'local', true);
    const id = queue.ask('Recomendame otro segmento', report), job = queue.claim('worker')!;
    assert.equal(queue.claim('worker'), null);
    assert.throws(() => queue.complete(id, 'other', job.lease, { answer: 'Un consejo' }), /no asignada/);
    queue.complete(id, 'worker', job.lease, { answer: 'Un consejo' });
    queue.complete(id, 'worker', job.lease, { answer: 'Un consejo' });
    assert.equal(queue.status().entries[0].state, 'completed');
    assert.equal(queue.status().entries[0].answer, 'Un consejo');
    assert.ok(!JSON.stringify(queue.status()).includes('leaseHash'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
