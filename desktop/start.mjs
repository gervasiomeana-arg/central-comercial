import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { findConfig, findJarvis, executable, jarvisEnvironment, selectedModel } from './config.mjs';
import { retryDelay, upgradeWorker } from './recovery.mjs';
import { saveCheckpoint } from './checkpoint.mjs';
import { prepareLocalRecords } from './local-app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'CentralComercial', 'runtime');
fs.mkdirSync(runtimeDir, { recursive: true });
const config = findConfig(root);
if (!config) { console.error('No se encontró la conexión ya guardada del correo. Inicie desde la computadora vinculada. No ingrese claves en el chat.'); process.exit(78); }
const lock = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
await new Promise((resolve, reject) => { lock.once('error', () => reject(new Error('Ya hay un iniciador de Central Comercial abierto o el puerto local está ocupado. No se inició otro.'))); lock.listen(37379, '127.0.0.1', resolve); });
const idFile = path.join(runtimeDir, 'id');
const workerId = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : randomUUID();
fs.writeFileSync(idFile, workerId, { mode: 0o600 });
const startedAt = Date.now(), ramGB = Math.round(os.totalmem() / 1024 ** 3);
let model = selectedModel(ramGB, process.env.OPENJARVIS_MODEL);
const components = { email: 'missing', whatsapp: 'missing', intelligence: 'missing' };
const issues = new Set(), children = new Set();
let stopping = false, timer, backupTimer, reporting = false, backingUp = false, backupAt;
const retryTimers = new Set(), restartCounts = new Map();
const log = (name, line) => console.log(`[${name}] ${line}`);
function launch(name, command, args, options = {}) {
  if(stopping)return null;
  const at = Date.now();
  const effectiveArgs=command===process.execPath?args:[path.join(root,'desktop','managed-native.mjs'),command,...args];
  const child = spawn(process.execPath, effectiveArgs, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], ...options });
  children.add(child);
  if (['email', 'whatsapp', 'intelligence'].includes(name)) components[name] = 'running';
  // Keep output only in this window. In particular, QR codes are never sent to the app.
  child.stdout?.on('data', data => process.stdout.write(data));
  child.stderr?.on('data', data => process.stderr.write(data));
  child.on('message', message => {
    if (message?.type === 'healthy') {restartCounts.set(name, 0);if(!Object.values(components).includes('stopped'))issues.delete('component_stopped');}
    if (message?.type === 'attention' && ['email_auth', 'whatsapp_auth'].includes(message.code)) issues.add(message.code);
  });
  let ended = false;
  const onExit = code => {
    if (ended) return; ended = true; children.delete(child);
    if (name in components) components[name] = 'stopped';
    if (stopping) return;
    issues.add('component_stopped');
    if (code === 78) { log(name, 'Se necesita revisar la autorización. No se reintenta hasta corregirla.'); return; }
    const count = Date.now() - at > 600000 ? 1 : (restartCounts.get(name) || 0) + 1; restartCounts.set(name, count);
    const wait = retryDelay(count); log(name, `Recuperación automática en ${Math.round(wait / 1000)} segundos. Se conserva el registro de trabajos.`);
    const timer = setTimeout(() => { retryTimers.delete(timer); if (!stopping) launch(name, command, args, options); }, wait); retryTimers.add(timer);
  };
  child.on('error', () => onExit(1)); child.on('exit', onExit);
  return child;
}
console.log('CENTRAL COMERCIAL — Inicio único');
console.log('Correo, WhatsApp y motor local se coordinan desde esta ventana.');
console.log('Este inicio no crea campañas, no confirma pagos y no repite tareas anteriores.');
console.log('Las campañas ya autorizadas conservan sus reglas y límites.');
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
const records=await prepareLocalRecords(root,runtimeDir,config);
config.url=new URL('http://127.0.0.1:39300');
launch('backend',process.execPath,['--import','tsx',path.join(root,'server.ts')],{cwd:root,env:{...jarvisEnvironment(profileDirectory()),NODE_ENV:'production',CENTRAL_LOCAL_MODE:'true',CENTRAL_DATA_DIR:records,CHANNEL_TEST_WORKER_KEY:config.key,PORT:'39300'}});
let backendReady=false;
for(let attempt=0;attempt<30;attempt++){try{const status=await fetch(new URL('/api/status',config.url),{signal:AbortSignal.timeout(1000)}).then(r=>r.json());if(status.appName==='Central Comercial'&&status.localMode){backendReady=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
if(!backendReady)throw new Error('El servidor local no inició. Se conservan los registros para el próximo intento.');
function profileDirectory(){return path.join(runtimeDir,'intelligence');}
const emailWorker = path.join(config.directory, 'worker.mjs');
if (fs.existsSync(emailWorker) && fs.existsSync(path.join(config.directory, 'node_modules'))) { upgradeWorker(path.join(root, 'email-worker', 'journal.mjs'), path.join(config.directory,'journal.mjs')); upgradeWorker(path.join(root, 'email-worker', 'worker.mjs'), emailWorker); launch('email', process.execPath, [emailWorker], { cwd: config.directory,env:{...process.env,CENTRAL_URL:config.url.href} }); }
else { issues.add('email_missing'); log('email', 'No se encontró el ejecutor configurado. No se cambió su configuración.'); }

const waDir = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'CentralComercial', 'WhatsApp');
const waFile = waDir && path.join(waDir, 'worker.mjs');
const browserFile = waDir && path.join(waDir, 'browser-path.txt');
const browser = browserFile && fs.existsSync(browserFile) ? fs.readFileSync(browserFile, 'utf8').trim() : process.env.CHROME_PATH;
if (waFile && fs.existsSync(waFile) && fs.existsSync(path.join(waDir, 'node_modules'))) {
  if (browser && fs.existsSync(browser)) { upgradeWorker(path.join(root,'desktop','whatsapp-commercial.mjs'),path.join(waDir,'commercial.mjs'));upgradeWorker(path.join(root, 'desktop', 'workers', 'whatsapp.mjs'), waFile); launch('whatsapp', process.execPath, [waFile], { cwd: waDir, env: { ...process.env, CENTRAL_URL:config.url.href,CENTRAL_CONFIG_FILE: config.file, CHROME_PATH: browser, PUPPETEER_SKIP_DOWNLOAD: 'true' } }); }
  else { issues.add('browser_missing'); log('whatsapp', 'Falta la ruta del navegador ya vinculado. No se cambió la sesión.'); }
} else { issues.add('whatsapp_missing'); log('whatsapp', 'No se encontró el ejecutor de WhatsApp previamente vinculado.'); }

// Dedicated OpenJarvis profile: explicit local engine, no channels, no inherited API keys.
const profile = path.join(runtimeDir, 'intelligence'); fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, 'config.toml'), '[engine]\ndefault = "ollama"\n[server]\nhost = "127.0.0.1"\nport = 8765\nagent = ""\n');
const jarvis = findJarvis();
if (ramGB < 6) { issues.add('low_memory'); log('intelligence', 'Memoria insuficiente para iniciar automáticamente el modelo local recomendado.'); }
else if (!jarvis) { issues.add('jarvis_missing'); log('intelligence', 'OpenJarvis aún no está instalado. El correo y los informes escritos siguen disponibles.'); }
else {
  try {
    try { await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000), redirect: 'error' }); }
    catch {
      const ollamaCandidates = [executable('ollama'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')].filter(Boolean);
      const ollama = ollamaCandidates.find(p => fs.existsSync(p));
      if (ollama) {
        launch('ollama', ollama, ['serve'], { cwd: runtimeDir, env: { ...jarvisEnvironment(profile), OLLAMA_HOST: '127.0.0.1:11434' } });
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          try { const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1000), redirect: 'error' }); if (response.ok) break; } catch {}
        }
      }
    }
    const tags = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000), redirect: 'error' }).then(r => { if (!r.ok) throw new Error(); return r.json(); });
    if (!process.env.OPENJARVIS_MODEL && !tags.models?.some(m => m.name === model || m.model === model) && tags.models?.some(m => m.name === 'qwen3.5:2b' || m.model === 'qwen3.5:2b')) model = 'qwen3.5:2b';
    if (!tags.models?.some(m => m.name === model || m.model === model)) { issues.add('model_missing'); log('intelligence', `Falta el modelo local ${model}. No se descargó otro ni se usó un proveedor de pago.`); }
    else {
      // Do not attach to an unrelated service already occupying the private port.
      const probe = http.createServer();
      await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(8765, '127.0.0.1', () => probe.close(resolve)); });
      launch('intelligence', jarvis, ['serve', '--host', '127.0.0.1', '--port', '8765', '--engine', 'ollama', '--model', model], { cwd: runtimeDir, env: jarvisEnvironment(profile) });
      launch('bridge', process.execPath, [path.join(root, 'openjarvis-worker', 'worker.mjs'), config.file], { env: { ...jarvisEnvironment(profile), CENTRAL_URL:config.url.href,CENTRAL_CONFIG_FILE: config.file, OPENJARVIS_MODEL: model, OPENJARVIS_URL: 'http://127.0.0.1:8765' } });
    }
  } catch (error) { issues.add(error.code === 'EADDRINUSE' ? 'jarvis_port_busy' : 'model_missing'); log('intelligence', 'El motor local no pudo prepararse. Revisá Ollama y el modelo instalado.'); }
}
async function backup(){if(backingUp||stopping)return;backingUp=true;try{backupAt=await saveCheckpoint(config,runtimeDir);issues.delete('backup_failed');}catch{issues.add('backup_failed');console.log('Copia local pendiente de actualizar. Se conserva la última copia válida.');}finally{backingUp=false;}}
await backup();backupTimer=setInterval(()=>void backup(),60000);
async function heartbeat() {
  if (reporting) return; reporting = true;
  try {
    const response = await fetch(new URL('/api/local-runtime/heartbeat', config.url), { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({ workerId, startedAt, ramGB, model, components, issues: [...issues], backupAt }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) log('central', `Estado de la computadora pendiente de registrar (HTTP ${response.status}).`);
  } catch { log('central', 'Conexión pendiente; no se puede confirmar el estado desde la app.'); }
  finally { reporting = false; }
}
await heartbeat(); timer = setInterval(() => void heartbeat(), 20000);
if (process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', config.url.href], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
async function stop() {
  if (stopping) return; stopping = true; clearInterval(timer);clearInterval(backupTimer);
  fs.writeFileSync(path.join(runtimeDir, 'manual-stop'), String(Date.now()));
  for (const retry of retryTimers) clearTimeout(retry);
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      // Target only descendants launched by this supervisor, including its browser.
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
    } else child.kill('SIGTERM');
  }
  await new Promise(resolve => setTimeout(resolve, 1500));
  for (const key of Object.keys(components)) components[key] = 'stopped';
  await heartbeat(); lock.close(); process.exit(0);
}
