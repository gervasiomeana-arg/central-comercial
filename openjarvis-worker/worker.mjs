import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { inspectJarvis, generateStrategy, answerQuestion, localJarvisURL } from './client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cached = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'CentralComercial', 'WhatsApp', 'correo-path.txt') : '';
const config = process.argv[2] || process.env.CENTRAL_CONFIG_FILE ||
  (fs.existsSync(path.join(here, '.env')) ? path.join(here, '.env') :
    cached && fs.existsSync(cached) ? fs.readFileSync(cached, 'utf8').trim() : '');
if (!config || !fs.existsSync(config)) throw new Error('No se encontró la conexión de Central Comercial. Indique la ruta de su .env de correo como argumento; no comparta su contenido.');
const shared = parseEnv(fs.readFileSync(config, 'utf8'));
const central = new URL(process.env.CENTRAL_URL || shared.CENTRAL_URL || 'https://central-comercial.ai.studio');
if (central.username || central.password || central.search || central.hash || central.pathname !== '/' ||
    (central.protocol !== 'https:' && !(central.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(central.hostname)))) throw new Error('La conexión de Central Comercial requiere HTTPS o servidor local.');
const key = shared.CHANNEL_TEST_WORKER_KEY;
if (!key || key.length < 32) throw new Error('Falta la conexión privada existente de Central Comercial.');
// Deliberately do not load SMTP/IMAP passwords into process.env or pass them to OpenJarvis.
const base = localJarvisURL(process.env.OPENJARVIS_URL);
const model = process.env.OPENJARVIS_MODEL || 'qwen3.5:2b';
const jarvisKey = process.env.OPENJARVIS_API_KEY || '';
const stateFile = path.join(here, 'private-state', 'bridge.json');
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { workerId: randomUUID(), pending: null };
function save() { fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state), { mode: 0o600 }); fs.renameSync(stateFile + '.tmp', stateFile); }
save();
async function api(action, payload = {}, area = 'openjarvis') {
  const response = await fetch(new URL('/api/' + area + '/worker/' + action, central), {
    method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ workerId: state.workerId, ...payload }), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const error = new Error(`Central Comercial rechazó la operación ${action} (HTTP ${response.status}).`);
    error.status = response.status; throw error;
  }
  return response.json();
}
let ready = false, processing = false, checking = false;
async function pulse() {
  if (checking) return;
  checking = true;
  try {
    try { await inspectJarvis(base, model, jarvisKey); ready = true; } catch { ready = false; }
    await api('heartbeat', { ready, model: ready ? model : '', assistant: true });
    if(ready)process.send?.({type:'healthy'});
  } catch (e) { console.error(e.message); }
  finally { checking = false; }
}
async function flush() {
  if (!state.pending) return;
  try { await api('complete', state.pending, state.pending.area || 'openjarvis'); }
  catch (error) {
    if (error.status !== 409) throw error;
    // A lease may have expired while the PC was offline. Retain a local receipt,
    // release the outbox and never execute the old inference again.
    state.lastRejected = { id: state.pending.id, area: state.pending.area || 'openjarvis', at: Date.now() };
    console.error('El servidor no aceptó un resultado anterior. Revisar la tarea en Central; no se regenera.');
  }
  state.pending = null; save();
}
async function tick() {
  if (processing) return;
  processing = true;
  try {
    await flush();
    if (!ready) return;
    const assistantClaim = await api('claim', {}, 'assistant');
    const area = assistantClaim.job ? 'assistant' : 'openjarvis';
    const { job } = assistantClaim.job ? assistantClaim : await api('claim');
    if (!job) return;
    // An interrupted local inference is reported as failed, not automatically regenerated.
    state.pending = { id: job.id, lease: job.lease, area, failed: true }; save();
    try {
      if (area === 'assistant') {
        const answer = await answerQuestion(base, job.model, job, jarvisKey);
        state.pending = { id: job.id, lease: job.lease, area, answer };
      } else {
        const strategy = await generateStrategy(base, job.model, job.context, jarvisKey);
        state.pending = { id: job.id, lease: job.lease, area, strategy };
      }
      save();
    } catch (error) {
      const failureCode = ['MODEL_TRUNCATED','MODEL_TOOLS','MODEL_EMPTY','MODEL_JSON','MODEL_SCHEMA'].includes(error.failureCode) ? error.failureCode : 'MODEL_REQUEST';
      state.pending = { id: job.id, lease: job.lease, area, failed: true, failureCode }; save();
      console.error(`Estrategia no aplicada [${failureCode}]: ${failureCode==='MODEL_REQUEST'?'Falló la solicitud al motor local.':error.message} No se enviaron mensajes.`);
    }
    await flush();
    console.log('Resultado de planificación registrado en Central Comercial; este puente no envía mensajes.');
  } catch (e) { console.error(e.message); }
  finally { processing = false; }
}
console.log('CENTRAL COMERCIAL — Puente OpenJarvis');
if(process.send)process.on('disconnect',()=>process.exit(75));
console.log(`Equipo: ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM; ${os.cpus()[0]?.model || 'procesador sin identificar'}.`);
console.log('Planificación y consultas locales. No envía promociones ni registra pagos.');
await pulse();
console.log(ready ? 'OpenJarvis y modelo disponibles. Prepará una estrategia en Conexiones.' : 'Pendiente: iniciar OpenJarvis con el modelo elegido. Consulte README.md.');
setInterval(() => void pulse(), 20000);
await tick(); setInterval(() => void tick(), 15000);
