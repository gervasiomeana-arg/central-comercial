import { ownerReportSchedule, useWhatsAppSessionPolling } from '../desktop/whatsapp-commercial.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { dailyStatistics } from '../server/daily-statistics.js';
import { readOwnerReport, selectWhatsAppBrowser } from '../desktop/recovery.mjs';
import { LocalRuntime } from '../server/local-runtime.js';
import { findConfig, findJarvis, selectedModel, jarvisEnvironment } from '../desktop/config.mjs';

test('estado unificado vence, rechaza otro equipo y no expone el identificador privado', () => {
  let now = 1000;
  const runtime = new LocalRuntime(() => now);
  const heartbeat = { workerId: 'local-a', startedAt: 1000, ramGB: 8, model: 'qwen3.5:2b', components: { email: 'running', whatsapp: 'running', intelligence: 'missing' }, issues: ['jarvis_missing'] };
  runtime.heartbeat(heartbeat);
  assert.equal(runtime.status().online, true);
  assert.equal(runtime.status().components!.intelligence, 'missing');
  assert.ok(!JSON.stringify(runtime.status()).includes('local-a'));
  assert.throws(() => runtime.heartbeat({ ...heartbeat, workerId: 'local-b' }), /otra computadora/);
  assert.throws(() => runtime.heartbeat({ ...heartbeat, issues: ['secret-password'] }), /inválido/);
  now += 90000;
  assert.deepEqual(runtime.status(), { online: false, issues: [], lastSeenAt: 1000 });
});

test('configuración se reutiliza por ruta, sin copiar archivos, y el motor no hereda claves', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-runtime-'));
  try {
    const config = path.join(dir, '.env');
    fs.writeFileSync(config, `CENTRAL_URL=https://central-comercial.ai.studio\nCHANNEL_TEST_WORKER_KEY=${'a'.repeat(32)}\nSMTP_PASSWORD=mail-private\nGEMINI_API_KEY=cloud-private\n`);
    assert.equal(findConfig(dir, {})?.file, config);
    assert.equal(fs.readdirSync(dir).length, 1);
    const env = jarvisEnvironment('/dedicated-profile', { PATH: '/bin', SMTP_PASSWORD: 'mail-private', GEMINI_API_KEY: 'cloud-private', OPENJARVIS_HOME: '/other' });
    assert.equal(env.OPENJARVIS_HOME, '/dedicated-profile');
    assert.ok(!JSON.stringify(env).includes('private'));
    fs.writeFileSync(config, `CENTRAL_URL=https://user:secret@example.com\nCHANNEL_TEST_WORKER_KEY=${'a'.repeat(32)}`);
    assert.throws(() => findConfig(dir, {}), /HTTPS o local/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('selección de modelo es explícita y no introduce direcciones de proveedores', () => {
  assert.equal(selectedModel(8, ''), 'qwen3.5:2b');
  assert.equal(selectedModel(16, ''), 'qwen3.5:4b');
  assert.equal(selectedModel(16, 'qwen3.5:2b'), 'qwen3.5:2b');
  assert.throws(() => selectedModel(16, 'https://paid.example/model'), /inválido/);
});

test('encuentra la carpeta src del instalador oficial de Windows sin depender del PATH', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-jarvis-location-'));
  try {
    const target = path.join(dir, 'OpenJarvis', 'src', '.venv', 'Scripts', 'jarvis.exe');
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, 'placeholder');
    assert.equal(findJarvis({ LOCALAPPDATA: dir, PATH: '' }), target);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('la publicación recibe totales de actividad y descarta campos privados del reporte', () => {
  let now = Date.parse('2026-11-18T15:00:00Z');
  const runtime = new LocalRuntime(() => now);
  const statistics = dailyStatistics([{ id: 'app-a', slug: 'app-a', name: 'App A' }], [], [], 90, new Date(now));
  const overview = [{
    appId: 'all', dailyMarketActivity: 'Argentina · Contactos nuevos: 2',
    contactsTotal: 57, contactsVerified: 56, messagesSent: 44, messagesPending: 2,
    responsesReceived: 1, interestedCount: 1, activeSubscriptionsCount: 0, trialClientsCount: 0, activeCampaigns: 4,
  }];
  const heartbeat = {
    workerId: 'pc-privada', startedAt: now, ramGB: 8, model: 'qwen3.5:2b',
    components: { email: 'running', whatsapp: 'running', intelligence: 'running' }, issues: [],
    activity: { paused: false, lastCycleAt: new Date(now).toISOString(), pendingPromotions: 2,
      completedPlans: 1, campaignsUsingOpenJarvis: 1, statistics: { ...statistics, messages: ['contenido privado'] },
      overview: [{ ...overview[0], contactNames: ['contenido privado'] }] },
  };
  const delivery = { emailBounces: 3, pendingRetries: 1, acceptedEmailRetries: 0, acceptedWhatsAppRetries: 1, failedRetries: 0 };
  const update = { status: 'ready_for_restart', at: new Date(now).toISOString(), targetCommit: 'a'.repeat(40) };
  runtime.heartbeat({
    ...heartbeat,
    update: { ...update, detail: 'contenido privado' },
    activity: { ...heartbeat.activity, delivery: { ...delivery, recipient: 'contenido privado' } },
  });
  assert.deepEqual(runtime.status().activity?.delivery, delivery);
  assert.equal(runtime.status().update?.targetCommit, update.targetCommit);
  assert.throws(() => runtime.heartbeat({ ...heartbeat, update: { ...update, targetCommit: 'invalid' } }), /actualización inválido/);
  assert.deepEqual(runtime.status().activity?.statistics, statistics);
  assert.deepEqual(runtime.status().activity?.overview, overview);
  assert.throws(() => runtime.heartbeat({ ...heartbeat, activity: { ...heartbeat.activity,
    overview: [{ ...overview[0], contactsTotal: -1 }],
  } }), /Resumen de la PC inválido/);
  assert.equal(runtime.status().activity?.pendingPromotions, 2);
  assert.doesNotMatch(JSON.stringify(runtime.status()), /contenido privado|pc-privada/);
  assert.throws(() => runtime.heartbeat({ ...heartbeat, activity: { ...heartbeat.activity, pendingPromotions: -1 } }), /inválido/);
  assert.equal(runtime.status().activity?.pendingPromotions, 2);
  now += 90000;
  assert.equal(runtime.status().activity, undefined);
});


test('el estado del informe conserva la fecha argentina y excluye datos del mensaje', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-owner-report-'));
  try {
    const file = path.join(dir, 'owner-reports.json');
    const now = new Date('2026-11-19T02:30:00Z');
    assert.deepEqual(readOwnerReport(file, now), { day: '2026-11-18', status: 'sin_intento' });
    const at = '2026-11-19T02:25:00.000Z';
    fs.writeFileSync(file, JSON.stringify({ 'daily-2026-11-18': {
      status: 'aceptado_proveedor', at, providerId: 'privado', content: 'contenido privado',
    } }));
    assert.deepEqual(readOwnerReport(file, new Date('2026-11-19T03:10:00Z')),
      { day: '2026-11-18', status: 'aceptado_proveedor', at });
    const runtime = new LocalRuntime();
    runtime.heartbeat({
      workerId: 'fixture', startedAt: 2000, ramGB: 8, model: 'fixture',
      components: { email: 'running', whatsapp: 'running', intelligence: 'running' }, issues: [],
      ownerReport: { ...readOwnerReport(file, now), providerId: 'privado' },
    });
    assert.deepEqual(runtime.status().ownerReport, { day: '2026-11-18', status: 'aceptado_proveedor', at });
    fs.writeFileSync(file, '{');
    assert.deepEqual(readOwnerReport(file, now), { day: '2026-11-18', status: 'registro_no_disponible' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('recupera el informe al reconectar después de medianoche y admite un reenvío explícito', () => {
  const now = new Date('2026-11-20T03:15:00Z');
  const day = '2026-11-19';
  const automatic = { day, key: 'daily-' + day, manual: false };
  assert.deepEqual(ownerReportSchedule({}, now), automatic);
  const reports = { [automatic.key]: { status: 'aceptado_proveedor' } };
  assert.equal(ownerReportSchedule(reports, now), null);
  const manual = { day, key: 'manual-' + day, manual: true };
  assert.deepEqual(ownerReportSchedule(reports, now, day), manual);
  assert.equal(ownerReportSchedule({ ...reports, [manual.key]: { status: 'resultado_desconocido' } }, now, day), null);
  assert.deepEqual(ownerReportSchedule({}, now, day), { ...automatic, manual: true });
  assert.equal(ownerReportSchedule({ [automatic.key]: { manual: true } }, now, day), null);
  assert.deepEqual(ownerReportSchedule({}, new Date('2026-11-20T23:00:00Z')),
    { day: '2026-11-20', key: 'daily-2026-11-20', manual: false });
});

test('una demora conserva el último reporte verificado y una desconexión confirmada lo reemplaza', () => {
  let now = 1000;
  const runtime = new LocalRuntime(() => now);
  const base = {workerId:'pc',startedAt:1,ramGB:8,model:'local',components:{email:'running',whatsapp:'running',intelligence:'running'},issues:[]};
  const connected = {email:true,whatsapp:true,intelligence:true};
  runtime.heartbeat({...base, connections:connected});
  now += 20000;
  runtime.heartbeat({...base, reportUnavailable:true});
  assert.equal(runtime.status().online,true);
  assert.equal(runtime.status().reportUnavailable,true);
  assert.equal(runtime.status().reportAt,1000);
  assert.deepEqual(runtime.status().connections,connected);
  now += 70000;
  runtime.heartbeat({...base,reportUnavailable:true});
  assert.equal(runtime.status().connections,undefined);
  runtime.heartbeat({...base,connections:{...connected,whatsapp:false}});
  assert.equal(runtime.status().reportUnavailable,false);
  assert.equal(runtime.status().connections?.whatsapp,false);
  assert.equal(runtime.status().reportAt,now);
  runtime.heartbeat({...base,startedAt:now,reportUnavailable:true});
  assert.equal(runtime.status().connections,undefined);
});

test('polling de WhatsApp reemplaza espera por animación y selección de navegador conserva perfil sin bloqueo', () => {
  const calls: any[] = [];
  const page = {
    waitForFunction(predicate: unknown, options?: Record<string, unknown>) {
      calls.push({ predicate, options });
      return Promise.resolve(true);
    },
  };
  useWhatsAppSessionPolling(page);
  useWhatsAppSessionPolling(page);
  void page.waitForFunction('() => window.AuthStore');
  void page.waitForFunction('() => true', { polling: 'raf', timeout: 5000 });
  void page.waitForFunction('() => true', { polling: 50, timeout: 5000 });
  assert.deepEqual(calls.map(c => c.options), [
    { polling: 200 },
    { polling: 200, timeout: 5000 },
    { polling: 50, timeout: 5000 },
  ]);

  const files = new Set(['C:\\Google\\Chrome\\chrome.exe', 'C:\\Microsoft\\Edge\\msedge.exe']);
  assert.equal(selectWhatsAppBrowser({
    savedBrowser: '',
    installedChrome: ['C:\\Google\\Chrome\\chrome.exe'],
    installedEdge: ['C:\\Microsoft\\Edge\\msedge.exe'],
    hasSavedProfile: true,
    exists: f => files.has(f),
  }), '');
  assert.equal(selectWhatsAppBrowser({
    savedBrowser: '',
    installedChrome: ['C:\\Google\\Chrome\\chrome.exe'],
    installedEdge: ['C:\\Microsoft\\Edge\\msedge.exe'],
    hasSavedProfile: true,
    profileHint: 'edge',
    exists: f => files.has(f),
  }), 'C:\\Microsoft\\Edge\\msedge.exe');
  assert.equal(selectWhatsAppBrowser({
    savedBrowser: 'C:\\Missing\\msedge.exe',
    installedChrome: ['C:\\Google\\Chrome\\chrome.exe'],
    installedEdge: ['C:\\Microsoft\\Edge\\msedge.exe'],
    hasSavedProfile: true,
    exists: f => files.has(f),
  }), 'C:\\Microsoft\\Edge\\msedge.exe');
});
