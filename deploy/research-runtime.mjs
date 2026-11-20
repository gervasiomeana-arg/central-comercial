import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { inspectJarvis } from '../openjarvis-worker/client.mjs';

const ollamaUrl = 'http://127.0.0.1:11434';
const jarvisUrl = 'http://127.0.0.1:8000';

export async function withOpenJarvis(work, env = process.env) {
  const model = env.OPENJARVIS_MODEL || 'qwen3.5:2b';
  if (!/^[\w.-]+:[\w.-]+$/.test(model)) throw new Error('El nombre del modelo no es válido.');
  if (!path.isAbsolute(env.OPENJARVIS_STATE_DIR || '') || !path.isAbsolute(env.OLLAMA_MODELS || '')) {
    throw new Error('El modelo y el puente requieren directorios absolutos en almacenamiento persistente.');
  }
  if ((env.OPENJARVIS_WORKER_KEY?.length || 0) < 32) throw new Error('Falta la conexión privada de OpenJarvis.');

  const controller = new AbortController();
  const children = [];
  const stop = () => controller.abort(new Error('Tanda interrumpida.'));
  const start = (name, command, args, childEnv, ipc = false) => {
    const child = spawn(command, args, { env: childEnv, stdio: ipc ? ['ignore', 'inherit', 'inherit', 'ipc'] : 'inherit' });
    const status = { child, ended: false };
    status.done = new Promise(resolve => {
      const finish = result => { status.ended = true; resolve(result); };
      child.once('error', error => finish({ error }));
      child.once('exit', (code, signal) => finish({ code, signal }));
    });
    status.ensureAlive = () => {
      if (status.ended) throw new Error(name + ' se detuvo durante la tanda.');
      controller.signal.throwIfAborted();
    };
    children.push(status);
    return status;
  };
  const poll = async (check, service, timeoutMs) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      service.ensureAlive();
      if (await check()) return;
      await wait(1000, undefined, { signal: controller.signal });
    }
    throw new Error('Se agotó el tiempo de preparación de OpenJarvis.');
  };
  const request = (url, options) => fetch(url, { ...options,
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]),
  });
  const processEnv = { PATH: env.PATH, HOME: env.HOME, LANG: env.LANG };
  const ollamaEnv = { ...processEnv, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_MODELS: env.OLLAMA_MODELS,
    OLLAMA_CONTEXT_LENGTH: '4096', OLLAMA_NUM_PARALLEL: '1' };

  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    const engine = start('Ollama', 'ollama', ['serve'], ollamaEnv);
    await poll(async () => (await request(ollamaUrl + '/api/tags').catch(() => null))?.ok, engine, 30000);
    const modelInfo = await request(ollamaUrl + '/api/show', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }),
    });
    if (modelInfo.status === 404) {
      const pull = start('Descarga del modelo', 'ollama', ['pull', model], ollamaEnv);
      const pulled = await Promise.race([pull.done, wait(720000, { code: -1 }, { signal: controller.signal, ref: false })]);
      if (pulled.code !== 0) throw new Error('Ollama no pudo preparar el modelo.');
    } else if (!modelInfo.ok) throw new Error('No se pudo comprobar el modelo disponible.');

    const jarvis = start('OpenJarvis', 'jarvis', ['serve', '--host', '127.0.0.1', '--port', '8000',
      '--engine', 'ollama', '--model', model],
    { ...processEnv, OPENJARVIS_CONFIG: env.OPENJARVIS_CONFIG, OLLAMA_HOST: ollamaUrl });
    await poll(async () => {
      try { await inspectJarvis(new URL(jarvisUrl), model, ''); return true; } catch { return false; }
    }, jarvis, 90000);
    const bridge = start('El puente', process.execPath, [fileURLToPath(new URL('../openjarvis-worker/worker.mjs', import.meta.url))],
      { ...processEnv, CENTRAL_URL: env.CENTRAL_URL, OPENJARVIS_URL: jarvisUrl,
        OPENJARVIS_WORKER_KEY: env.OPENJARVIS_WORKER_KEY, OPENJARVIS_STATE_DIR: env.OPENJARVIS_STATE_DIR,
        OPENJARVIS_MODEL: model, OPENJARVIS_BATCH_PHASE: 'buscar' }, true);
    let connected = false;
    bridge.child.on('message', message => { if (message?.type === 'healthy') connected = true; });
    await poll(() => connected, bridge, 45000);

    return await Promise.race([
      work(controller.signal),
      ...[engine, jarvis, bridge].map(service => service.done.then(() => { service.ensureAlive(); })),
    ]);
  } finally {
    controller.abort();
    for (const service of [...children].reverse()) if (!service.ended) service.child.kill('SIGTERM');
    await Promise.race([Promise.all(children.map(service => service.done)), wait(3500, undefined, { ref: false })]);
    for (const service of children) if (!service.ended) service.child.kill('SIGKILL');
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}
