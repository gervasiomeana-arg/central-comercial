import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';
import { db } from './db.js';
import { workerAuthorized } from './channelTests.js';
import type { DatabaseSchema } from './db.js';
import type { AssistantEntry, AssistantReport } from '../src/assistant-types.js';
import type { JarvisQueue } from './openjarvis.js';

export function buildAssistantReport(data: DatabaseSchema, goal: { month: string; targetClients: number; remaining: number }, appId = 'all', now = new Date()): AssistantReport {
  const app = data.applications.find(a => a.id === appId);
  if (appId !== 'all' && !app) throw new Error('Aplicación no encontrada.');
  const belongs = (id: string) => appId === 'all' || id === appId;
  const messages = data.conversations.filter(c => belongs(c.appId)).flatMap(c => c.messages);
  const accepted = messages.filter(m => m.direction === 'outbound' && ['aceptado_proveedor', 'entrega_confirmada', 'enviado'].includes(m.status) && Boolean(m.serviceConfirmationId || m.providerEvidence)).length;
  const received = messages.filter(m => m.direction === 'inbound' && Boolean(m.providerMessageId || m.serviceConfirmationId)).length;
  const campaigns = data.campaigns.filter(c => belongs(c.appId));
  const contacts = data.contacts.filter(c => appId === 'all' || c.interestedAppIds.includes(appId));
  const payments: Record<string, number> = {};
  for (const p of data.payments.filter(p => belongs(p.appId) && p.status === 'confirmado')) payments[p.currency] = (payments[p.currency] || 0) + p.amount;
  const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(now);
  const money = Object.entries(payments).map(([currency, value]) => `${currency} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value)}`).join('; ') || 'sin pagos confirmados';
  const email = data.commercialEmailWorker;
  const emailOnline = Boolean(email && now.getTime() - email.at < 90000 && email.send);
  const pendingPayments = data.payments.filter(p => belongs(p.appId) && p.status === 'pendiente_confirmacion_manual').length;
  const human = data.conversations.filter(c => belongs(c.appId) && c.requiresHumanIntervention).length;
  const subscriptions = new Set(data.subscriptions.filter(s => belongs(s.appId) && s.status === 'activa').map(s => s.clientId)).size;
  const state = data.scheduler.automationsPaused ? 'pausadas' : data.scheduler.isRunning ? 'motor activo' : 'motor detenido';
  const details = [
    `Informe de Central Comercial — ${date}, hora de Argentina.`,
    `Alcance: ${app?.name || 'todas las aplicaciones'}. Actividad y pagos: acumulado registrado, sin incluir pruebas de canales.`,
    `Automatizaciones: ${state}. Campañas activas: ${campaigns.filter(c => c.status === 'activa').length}. Campañas bloqueadas por configuración: ${campaigns.filter(c => c.status === 'bloqueada_por_configuracion').length}.`,
    `Contactos registrados: ${contacts.length}. Mensajes con aceptación documentada del proveedor: ${accepted}. Respuestas con identificación del proveedor: ${received}. Clientes con suscripción activa: ${subscriptions}.`,
    `Pagos confirmados manualmente: ${money}. Pagos pendientes de revisión: ${pendingPayments}. Conversaciones que requieren tu atención: ${human}.`,
    `Objetivo conjunto de ${goal.month}: ${goal.targetClients} clientes nuevos con primer pago confirmado; faltan ${goal.remaining}. Esta meta es conjunta, aunque el informe esté filtrado por una aplicación.`,
    `Ejecutor comercial de correo: ${emailOnline ? 'conectado para enviar' : 'pendiente de conexión'}. La aceptación del proveedor no acredita lectura del destinatario.`,
    'Este informe consulta registros: no inicia envíos, no activa campañas y no confirma pagos.'
  ];
  const catalog = data.applications.filter(a => belongs(a.id)).map(a => ({ name: a.name, status: a.status,
    description: a.description || '', website: a.website || '', features: a.verifiedFeatures || [],
    plans: (a.plans || []).filter(p => p.verified && !p.archived).map(p => ({ name: p.name, price: p.price,
      currency: p.currency, interval: p.interval, market: p.market || 'Consultar mercado' })) }));
  return { createdAt: now.toISOString(), appId, appName: app?.name || 'Todas las aplicaciones', text: details.join('\n\n'), catalog };
}
export function currentAssistantReport(appId = 'all') {
  const g = db.getSalesGoalReport();
  return buildAssistantReport(db.getRaw(), { month: g.goal.month, targetClients: g.goal.targetClients, remaining: g.remaining }, appId);
}

type StoredEntry = AssistantEntry & { report: AssistantReport; workerId?: string; leaseHash?: string };
const hash = (s: string) => createHash('sha256').update(s).digest();
export class AssistantQueue {
  private entries: StoredEntry[];
  constructor(private file: string, private jarvis: JarvisQueue, private now = () => Date.now()) {
    this.entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    if (!Array.isArray(this.entries)) throw new Error('Historial del asistente inválido; conservar archivo para revisión.');
  }
  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const fd = fs.openSync(this.file + '.tmp', 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.entries, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(this.file + '.tmp', this.file);
  }
  private expire() {
    let changed = false;
    for (const entry of this.entries) if ((entry.state === 'running' && this.now() - entry.updatedAt > 600000) || (entry.state === 'queued' && this.now() - entry.updatedAt > 86400000)) {
      entry.state = 'failed'; entry.error = 'La consulta venció sin respuesta. No se repitió automáticamente.'; delete entry.leaseHash; changed = true;
    }
    if (changed) this.save();
  }
  status() {
    this.expire(); const jarvis = this.jarvis.status();
    return { ready: jarvis.assistantReady === true, model: jarvis.model,
      entries: this.entries.slice(-40).map(({ workerId, leaseHash, report, ...entry }) => entry) };
  }
  ask(question: unknown, report: AssistantReport, kind: unknown = 'question') {
    this.expire();
    if (typeof question !== 'string' || !question.trim() || question.length > 1200) throw new Error('Escribí una consulta de hasta 1200 caracteres.');
    const q = question.trim(), normalized = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const command = /\b(envia|enviar|manda|mandar|activa|activar|inicia|iniciar|cobra|cobrar|confirma|confirmar|borra|borrar|elimina|eliminar)\b/.test(normalized);
    const records = kind === 'report' || /\b(informe|resumen|estado|objetivo|cobramos|vendimos|cuantos|cuantas)\b|como (voy|vamos)|que (falta|logro|consiguio)/.test(normalized);
    const same = this.entries.find(e => e.question === q && e.report.appId === report.appId && e.report.text === report.text && e.state !== 'failed' && this.now() - e.createdAt < 30000);
    if (same) return same.id;
    const source = command || records ? 'records' : 'openjarvis';
    if (source === 'openjarvis' && !this.status().ready) throw new Error('OpenJarvis todavía no está listo para conversar. Podés pedir un informe de los registros con el botón Informe actual.');
    if (source === 'openjarvis' && this.entries.filter(e => e.source === 'openjarvis' && this.now() - e.createdAt < 86400000).length >= 20) throw new Error('Límite de veinte consultas diarias a OpenJarvis para cuidar los recursos.');
    const entry: StoredEntry = { id: randomUUID(), question: q, appId: report.appId, appName: report.appName, report, source,
      state: source === 'records' ? 'completed' : 'queued', createdAt: this.now(), updatedAt: this.now() };
    if (source === 'records') entry.answer = command ? 'No ejecuté esa acción. En esta etapa, el asistente conversa, recomienda y da informes. Para iniciar campañas, enviar o registrar pagos, usá los controles correspondientes de Central Comercial.' : report.text;
    this.entries.push(entry); this.save(); return entry.id;
  }
  claim(workerId: string) {
    this.expire();
    if (!this.jarvis.assistantWorkerReady(workerId)) throw new Error('El puente debe actualizarse y conectar OpenJarvis antes de conversar.');
    if (this.entries.some(e => e.state === 'running')) return null;
    const entry = this.entries.find(e => e.state === 'queued'); if (!entry) return null;
    const lease = randomBytes(24).toString('hex');
    entry.state = 'running'; entry.workerId = workerId; entry.leaseHash = hash(lease).toString('hex'); entry.updatedAt = this.now(); entry.model = this.jarvis.status().model;
    this.save();
    return { id: entry.id, lease, question: entry.question, report: entry.report, model: entry.model };
  }
  complete(id: string, workerId: string, lease: unknown, input: { failed?: boolean; answer?: unknown }) {
    this.expire(); const entry = this.entries.find(e => e.id === id);
    if (!entry || entry.workerId !== workerId || typeof lease !== 'string' || lease.length > 100 || !entry.leaseHash || !timingSafeEqual(hash(lease), Buffer.from(entry.leaseHash, 'hex'))) throw new Error('Consulta no asignada a este puente.');
    if (['completed', 'failed'].includes(entry.state)) return;
    if (input.failed) { entry.state = 'failed'; entry.error = 'OpenJarvis no devolvió una respuesta válida. No se regeneró la consulta.'; }
    else {
      if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 3000) throw new Error('Respuesta inválida.');
      entry.answer = input.answer.trim(); entry.state = 'completed';
    }
    entry.updatedAt = this.now(); this.save();
  }
}
export function registerAssistantWorkerRoutes(app: Express, queue: AssistantQueue) {
  app.post('/api/assistant/worker/:action', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Puente no autorizado.' });
    try {
      const { workerId } = req.body || {};
      if (typeof workerId !== 'string' || !workerId || workerId.length > 100) throw new Error('Identificador de puente inválido.');
      if (req.params.action === 'claim') return res.json({ job: queue.claim(workerId) });
      if (req.params.action === 'complete') { queue.complete(req.body.id, workerId, req.body.lease, req.body); return res.json({ ok: true }); }
      return res.status(404).json({ error: 'Acción desconocida.' });
    } catch (e: any) { return res.status(409).json({ error: e.message }); }
  });
}
