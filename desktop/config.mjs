import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export function findConfig(root, env = process.env) {
  const candidates = [env.CENTRAL_CONFIG_FILE, path.join(root, '.env'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'CentralComercial', 'WhatsApp', 'correo-path.txt')];
  for (let candidate of candidates.filter(Boolean)) {
    if (!fs.existsSync(candidate)) continue;
    if (candidate.endsWith('correo-path.txt')) candidate = fs.readFileSync(candidate, 'utf8').trim();
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    const values = parseEnv(fs.readFileSync(candidate, 'utf8'));
    if ((values.CHANNEL_TEST_WORKER_KEY || '').length < 32) continue;
    const url = new URL(values.CENTRAL_URL || 'https://central-comercial.ai.studio');
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('La dirección de Central Comercial debe ser HTTPS o local.');
    return { file: path.resolve(candidate), directory: path.dirname(path.resolve(candidate)), key: values.CHANNEL_TEST_WORKER_KEY, url };
  }
  return null;
}
export function executable(name, env = process.env) {
  const paths = (env.PATH || env.Path || '').split(path.delimiter);
  const names = process.platform === 'win32' ? [name + '.exe'] : [name];
  for (const dir of paths.filter(Boolean)) for (const filename of names) {
    const candidate = path.join(dir.replace(/^"|"$/g, ''), filename);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
export function selectedModel(ramGB, requested) {
  if (requested && (!/^[a-zA-Z0-9_.:/-]{1,160}$/.test(requested) || requested.includes('://'))) throw new Error('Nombre de modelo inválido.');
  return requested || (ramGB >= 16 ? 'qwen3.5:4b' : 'qwen3.5:2b');
}
export function findJarvis(env = process.env) {
  const local = env.LOCALAPPDATA;
  const candidates = [env.CENTRAL_JARVIS_EXE,
    local && path.join(local, 'OpenJarvis', 'src', '.venv', 'Scripts', 'jarvis.exe'),
    local && path.join(local, 'OpenJarvis', '.venv', 'Scripts', 'jarvis.exe'), executable('jarvis', env)].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || null;
}
export function jarvisEnvironment(home, env = process.env) {
  // No mail secrets, cloud API keys or inherited OpenJarvis configuration.
  const allowed = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG', 'LC_ALL'];
  return { ...Object.fromEntries(allowed.filter(k => env[k]).map(k => [k, env[k]])), OPENJARVIS_HOME: home, PYTHONUTF8: '1' };
}
