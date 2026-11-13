import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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
  assert.deepEqual(runtime.status(), { online: false, issues: [] });
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
