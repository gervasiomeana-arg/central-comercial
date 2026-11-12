import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import qrcode from 'qrcode-terminal';
import wwebjs from 'whatsapp-web.js';
import { sendEmailTest, sendWhatsAppTest } from './transports.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(directory, '.env'), quiet: true });
const origin = new URL(process.env.CENTRAL_URL || 'https://central-comercial.ai.studio');
if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('CENTRAL_URL requiere HTTPS.');
const key = process.env.CHANNEL_TEST_WORKER_KEY || '';
if (key.length < 32) throw new Error('Configure CHANNEL_TEST_WORKER_KEY (mínimo 32 caracteres) aquí y en los secretos de Central Comercial.');
const workerId = crypto.randomUUID();
const email = 'gervasiomeana@gmail.com';
const phone = '5492235802743';
const stateDir = path.join(directory, 'private-state');
fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const journalFile = path.join(stateDir, 'outbox.json');
const journal = fs.existsSync(journalFile) ? JSON.parse(fs.readFileSync(journalFile, 'utf8')) : {};
function saveJournal() {
  fs.writeFileSync(journalFile + '.tmp', JSON.stringify(journal), { mode: 0o600 });
  fs.renameSync(journalFile + '.tmp', journalFile);
}
async function api(action, body) {
  const response = await fetch(new URL('/api/channel-tests/worker/' + action, origin), {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, ...body }), signal: AbortSignal.timeout(15000), redirect: 'error'
  });
  if (!response.ok) { const error = new Error('Central Comercial respondió HTTP ' + response.status); error.httpStatus = response.status; throw error; }
  return response.json();
}
let emailReady = false;
let whatsappReady = false;
let smtp;
if (process.env.SMTP_APP_PASSWORD) {
  smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: email, pass: process.env.SMTP_APP_PASSWORD.replace(/\s/g, '') },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
    tls: { rejectUnauthorized: true } });
  try { await smtp.verify(); emailReady = true; console.log('Correo autorizado.'); }
  catch { console.log('Gmail no autorizó el correo. Revise la contraseña de aplicación; no use su contraseña habitual.'); }
}
let client;
if (process.env.ENABLE_WHATSAPP === 'true') {
  const { Client, LocalAuth } = wwebjs;
  client = new Client({ authStrategy: new LocalAuth({ dataPath: path.join(stateDir, 'whatsapp') }),
    puppeteer: { headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) } });
  client.on('qr', qr => { console.log('Vincule WhatsApp desde su teléfono. No comparta este QR.'); qrcode.generate(qr, { small: true }); });
  client.on('ready', () => { whatsappReady = true; console.log('WhatsApp vinculado.'); });
  client.on('auth_failure', () => { whatsappReady = false; console.log('WhatsApp requiere una nueva vinculación.'); });
  client.on('disconnected', () => { whatsappReady = false; console.log('WhatsApp desconectado.'); });
  client.initialize().catch(() => { whatsappReady = false; console.log('No pudo iniciarse WhatsApp. Revise Chrome y vuelva a iniciar el ejecutor.'); });
}
async function heartbeat() { await api('heartbeat', { email: emailReady, whatsapp: whatsappReady }); }
let reporting = false;
async function reportPending() {
  if (reporting) return;
  reporting = true;
  try {
    for (const entry of Object.values(journal)) {
      if (!entry.result || entry.reported) continue;
      try { await api('complete', { id: entry.id, lease: entry.lease, result: entry.result }); entry.reported = true; saveJournal(); }
      catch (error) { if (error.httpStatus === 409) { entry.reported = true; saveJournal(); } else throw error; }
    }
  } finally { reporting = false; }
}
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    await heartbeat(); await reportPending();
    const { job } = await api('claim', {});
    if (!job) return;
    if (!['email', 'whatsapp'].includes(job.channel) || job.recipient !== (job.channel === 'email' ? email : phone)) throw new Error('Destino no autorizado: este ejecutor solo realiza pruebas al propietario.');
    // Never repeat a send, including after an uncertain network failure.
    if (journal[job.id]) return;
    const entry = journal[job.id] = { id: job.id, lease: job.lease, attempting: true };
    saveJournal();
    try {
      entry.result = job.channel === 'email' ? await sendEmailTest(smtp, job, email) : await sendWhatsAppTest(client, job);
    } catch (error) {
      entry.result = { state: 'resultado_desconocido', evidence: 'El canal no confirmó el resultado. No se reenvía automáticamente. Revise su correo o WhatsApp.' };
    }
    saveJournal(); await reportPending();
  } catch (error) { console.log('Conexión pendiente: ' + (error.httpStatus ? 'HTTP ' + error.httpStatus : 'revise la configuración o internet.')); }
  finally { running = false; }
}
const pulse = setInterval(() => { heartbeat().catch(() => {}); }, 20000);
const timer = setInterval(tick, 5000);
console.log('Ejecutor iniciado. Las pruebas se ordenan desde Conectores y Sistema en Central Comercial.');
await tick();
async function stop() { clearInterval(timer); clearInterval(pulse); if (client) await client.destroy(); if (smtp) smtp.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
