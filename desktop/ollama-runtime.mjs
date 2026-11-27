import fs from 'node:fs';
import path from 'node:path';
import { executable } from './config.mjs';
import { findWinget, PACKAGES, run, setupEnvironment } from './install-native.mjs';

const origin = 'http://127.0.0.1:11434';
const fileExists = file => {
  try { return Boolean(file && fs.statSync(file).isFile()); }
  catch { return false; }
};

export function findOllamaExecutable(env = process.env) {
  const standard = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe');
  const candidates = [standard, executable('ollama', env)].filter(fileExists);
  return candidates.find(file => fileExists(path.join(path.dirname(file), 'lib', 'ollama', 'llama-server.exe')))
    || candidates[0];
}

export async function ollamaModels() {
  const response = await fetch(origin + '/api/tags', { redirect: 'error', signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Ollama no confirmó sus modelos locales.');
  const { models } = await response.json();
  if (!Array.isArray(models)) throw new Error('Ollama devolvió un catálogo inválido.');
  return models;
}

export async function verifyLocalOllamaModel(model) {
  if (/(?:^|[:-])cloud(?:$|[:-])/i.test(model)) throw new Error('Central requiere un modelo de Ollama local.');
  const response = await fetch(origin + '/api/generate', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', stream: false }),
  });
  const result = await response.json();
  if (response.ok && result.done === true && result.done_reason !== 'unload') return;
  const detail = typeof result.error === 'string' ? result.error : '';
  const error = new Error(/memory|ram|memoria/i.test(detail)
    ? 'Ollama no tiene memoria libre suficiente para cargar el modelo local.'
    : 'Ollama no pudo cargar el modelo local.');
  if (/llama-server.{0,80}(?:binary not found|not found|no such file|cannot find)|unable to find.{0,80}llama-server/i.test(detail)) {
    error.code = 'OLLAMA_RUNNER_MISSING';
  }
  throw error;
}

export async function missingWindowsOllamaRunner(file) {
  if (process.platform !== 'win32' || !file || fileExists(path.join(path.dirname(file), 'lib', 'ollama', 'llama-server.exe'))) return false;
  try {
    const response = await fetch(origin + '/api/version', { redirect: 'error', signal: AbortSignal.timeout(2000) });
    const { version } = response.ok ? await response.json() : {};
    return version === '0.40.18';
  } catch { return false; }
}

export async function repairWindowsOllama(runtimeDir) {
  if (process.platform !== 'win32') throw new Error('La reparación automática de Ollama requiere Windows.');
  const marker = path.join(runtimeDir, 'ollama-repair-attempt');
  const lastAttempt = fileExists(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0;
  if (Date.now() - lastAttempt < 6 * 3600000) throw new Error('Ya se intentó reparar Ollama recientemente.');
  const env = setupEnvironment();
  const winget = await findWinget(env);
  if (!winget) throw new Error('Falta WinGet para reparar la instalación de Ollama.');
  fs.writeFileSync(marker, String(Date.now()), { mode: 0o600 });
  const args = ['--exact', '--id', PACKAGES.ollama, '--source', 'winget', '--disable-interactivity'];
  try {
    await run(winget, ['repair', ...args], { env });
    const file = findOllamaExecutable();
    if (file && fileExists(path.join(path.dirname(file), 'lib', 'ollama', 'llama-server.exe'))) return;
  } catch { /* The manifest may only support reinstalling over the current copy. */ }
  await run(winget, ['install', ...args, '--force', '--silent'], { env });
}
