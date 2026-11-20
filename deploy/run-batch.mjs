import { spawn } from 'node:child_process';

const phase = process.env.CENTRAL_BATCH_PHASE;
if (!['buscar', 'enviar', 'revisar'].includes(phase)) throw new Error('Indicá buscar, enviar o revisar.');
const base = new URL(process.env.CENTRAL_URL || '');
if (base.pathname !== '/' || base.username || base.password || base.search || base.hash ||
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === '127.0.0.1'))) {
  throw new Error('La URL de Central Comercial debe ser una raíz HTTPS o de loopback.');
}
if (phase !== 'buscar' && !process.env.CENTRAL_EMAIL_STATE_DIR) {
  throw new Error('Las tandas de correo requieren el directorio persistente del diario IMAP y SMTP.');
}
const key = process.env.CENTRAL_BATCH_KEY || '';
if (key.length < 32) throw new Error('Falta la clave privada de las tandas.');
async function batchRequest(action, payload = {}, signal) {
  const result = await fetch(new URL('/api/batches/' + phase + '/' + action, base), {
    method: 'POST', redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(300000), ...(signal ? [signal] : [])]),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!result.ok) throw new Error('Central Comercial rechazó ' + action + ' con HTTP ' + result.status + '.');
  return result.json();
}
async function runEmail() {
  const env = { ...process.env, CENTRAL_EMAIL_BATCH: phase };
  delete env.CENTRAL_BATCH_KEY;
  const child = spawn(process.execPath, ['worker.mjs'], { env, stdio: 'inherit' });
  let interrupted = false;
  const forward = () => { interrupted = true; child.kill('SIGTERM'); };
  process.once('SIGTERM', forward);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => code === 0 && !interrupted ? resolve() : reject(new Error('El ejecutor de correo dejó trabajo pendiente.')));
    });
  } finally {
    process.removeListener('SIGTERM', forward);
  }
}
async function prepare() {
  if (phase !== 'buscar' || process.env.CENTRAL_BATCH_BOOT_JARVIS !== 'true') return batchRequest('prepare');
  const check = await batchRequest('check');
  if (check.state !== 'disponible') return check;
  const { withOpenJarvis } = await import('./research-runtime.mjs');
  return withOpenJarvis(signal => batchRequest('prepare', {}, signal));
}
const prepared = await prepare();
if (prepared.state === 'preparada') {
  try {
    await runEmail();
  } catch (error) {
    await batchRequest('release', { runToken: prepared.runToken }).catch(() => {});
    throw error;
  }
  const result = await batchRequest('complete', { runToken: prepared.runToken });
  if (result.state !== 'completada') throw new Error('La tanda quedó sin confirmación de cierre: ' + result.state);
  console.log('Tanda finalizada:', phase);
} else {
  console.log('Estado de la tanda:', prepared.state);
}
