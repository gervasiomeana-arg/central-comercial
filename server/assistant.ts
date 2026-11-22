import { cloudOpenJarvisEnabled, openJarvisWorkerKey } from './execution-role.js';
import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';
import { db } from './db.js';
import { workerAuthorized } from './channelTests.js';
import type { DatabaseSchema } from './db.js';
import type { AssistantEntry, AssistantReport } from '../src/assistant-types.js';
import { applyCampaignProposal, campaignChatEnabled, validateCampaignProposal } from './assistant-campaigns.js';
import { accountingDay } from '../src/ledger.js';
import { promotionReceipt, recordedDay } from './daily-statistics.js';
import { normalize } from './sales-director.js';
import type { JarvisQueue } from './openjarvis.js';

export function dailyMarketActivity(data: DatabaseSchema, appId: string, now: Date) {
  const day = accountingDay(now);
  const belongs = (id: string) => appId === 'all' || id === appId;
  const rows = new Map<string,{country:string; active:number; requests:number; contacts:number; promotions:number}>();
  const row = (country = '') => {
    const label = country.trim() || 'País sin registrar';
    const key = normalize(label);
    let value = rows.get(key);
    if (!value) { value = { country:label, active:0, requests:0, contacts:0, promotions:0 }; rows.set(key,value); }
    return value;
  };
  const campaigns = new Map(data.campaigns.filter(c => belongs(c.appId)).map(c => [c.id,c]));
  const countriesByContact = new Map(data.contacts.map(c => [c.id,c.country]));
  for (const campaign of campaigns.values()) {
    if (campaign.status === 'activa') row(campaign.country).active++;
    if (campaign.researchDay === day && (campaign.researchCount || 0) > 0) row(campaign.country).requests += campaign.researchCount!;
  }
  const countedContacts = new Set<string>();
  for (const contact of data.contacts) {
    if (recordedDay(contact.createdAt) !== day || !contact.interestedAppIds?.some(belongs) || countedContacts.has(contact.id)) continue;
    row(contact.country).contacts++;
    countedContacts.add(contact.id);
  }
  const countedPromotions = new Set<string>();
  for (const thread of data.conversations) {
    if (!belongs(thread.appId) || !thread.campaignId) continue;
    for (const message of thread.messages) {
      const receipt = promotionReceipt(message);
      if (!receipt || receipt.day !== day || countedPromotions.has(receipt.key)) continue;
      countedPromotions.add(receipt.key);
      row(countriesByContact.get(thread.contactId) || campaigns.get(thread.campaignId)?.country).promotions++;
    }
  }
  const activity = [...rows.values()].filter(x => x.requests || x.contacts || x.promotions);
  const details = activity.sort((a,b)=>a.country.localeCompare(b.country,'es')).map(x => {
    const metrics = [
      x.requests ? `Consultas de búsqueda: ${x.requests}` : '',
      x.contacts ? `Contactos nuevos: ${x.contacts}` : '',
      x.promotions ? `Promociones aceptadas por el proveedor: ${x.promotions}` : '',
    ].filter(Boolean);
    return `• ${x.country} — ${metrics.join(' · ')}`;
  });
  const activeOnly = [...rows.values()].filter(x=>x.active && !x.requests && !x.contacts && !x.promotions)
    .map(x=>x.country).sort((a,b)=>a.localeCompare(b,'es'));
  return [
    `Actividad de hoy (${day.split('-').reverse().join('/')}, hora argentina) · ${data.applications.find(a=>a.id===appId)?.name || 'Todas las aplicaciones'}`,
    ...(details.length ? details : ['Hasta ahora no figuran consultas de búsqueda, contactos nuevos ni promociones aceptadas para hoy.']),
    ...(activeOnly.length ? [`Campañas activas sin actividad registrada hoy: ${activeOnly.join(', ')}.`] : []),
  ].join('\n');
}

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
  return { createdAt: now.toISOString(), appId, appName: app?.name || 'Todas las aplicaciones', text: details.join('\n\n'), dailyMarketActivity: dailyMarketActivity(data, appId, now), catalog };
}
export function currentAssistantReport(appId = 'all') {
  const g = db.getSalesGoalReport();
  return buildAssistantReport(db.getRaw(), { month: g.goal.month, targetClients: g.goal.targetClients, remaining: g.remaining }, appId);
}

type StoredEntry = AssistantEntry & { report: AssistantReport; workerId?: string; leaseHash?: string };
const geminiModel = process.env.CENTRAL_GEMINI_MODEL || 'gemini-2.5-flash-lite';
const geminiEnabled = () => !cloudOpenJarvisEnabled() && process.env.CENTRAL_GEMINI_FREE_ONLY === 'true' && Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
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
    return { campaignActions:campaignChatEnabled(), campaignJarvisReady:jarvis.assistantReady === true, ready: jarvis.assistantReady === true || geminiEnabled(), model: jarvis.assistantReady ? jarvis.model : geminiEnabled() ? `Gemini (${geminiModel})` : '',
      entries: this.entries.slice(-40).map(({ workerId, leaseHash, report, ...entry }) => entry) };
  }
  async ask(question: unknown, report: AssistantReport, kind: unknown = 'question') {
    this.expire();
    if (typeof question !== 'string' || !question.trim() || question.length > 1200) throw new Error('Escribí una consulta de hasta 1200 caracteres.');
    const q = question.trim(), normalized = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const command = /\b(envia|enviar|manda|mandar|activa|activar|inicia|iniciar|cobra|cobrar|confirma|confirmar|borra|borrar|elimina|eliminar)\b/.test(normalized);
    const wantsMarkets = /\b(en que|en cuales|cuales|que) (paises|mercados)\b/.test(normalized) &&
      (/\b(hoy|campanas?|trabaj\w*|buscar|busc\w*|promocion\w*)\b/.test(normalized) || /^(?:[¿?] *)?(?:y )?en que (paises|mercados)\??$/.test(normalized));
    const wantsDailyActivity = /\b(que|cuanto) (hiciste|trabajaste) hoy\b|\btrabajaste hoy\b/.test(normalized);
    const asksForStrategy = /\b(deberiamos|podriamos|conviene|recomend\w*|sugier\w*|propon\w*|plane\w*|armemos|podemos)\b/.test(normalized);
    const dailyActivity = kind !== 'report' && !asksForStrategy && (wantsMarkets || wantsDailyActivity) ? report.dailyMarketActivity : undefined;
    const records = Boolean(dailyActivity) || kind === 'report' || (!report.campaignScope && /\b(informe|resumen|estado|objetivo|cobramos|vendimos|cuantos|cuantas)\b|como (voy|vamos)|que (falta|logro|consiguio)/.test(normalized));
    const same = this.entries.find(e => e.question === q && e.report.appId === report.appId && e.report.text === report.text && JSON.stringify(e.report.campaignScope) === JSON.stringify(report.campaignScope) && e.state !== 'failed' && this.now() - e.createdAt < 30000);
    if (same) return same.id;
    const local = this.jarvis.status().assistantReady;
    const source = (command && !report.campaignScope) || records ? 'records' : 'openjarvis';
    if (report.campaignScope && source === 'openjarvis' && !local) throw new Error('Conectá OpenJarvis en tu PC para trabajar en campañas.');
    if (source === 'openjarvis' && !this.status().ready) throw new Error(cloudOpenJarvisEnabled() ? 'OpenJarvis en la nube está pendiente de conexión.' : 'OpenJarvis y Gemini todavía no están configurados para conversar.');
    if (source === 'openjarvis' && this.entries.filter(e => e.source === 'openjarvis' && this.now() - e.createdAt < 86400000).length >= 20) throw new Error('Límite de veinte consultas diarias a OpenJarvis para cuidar los recursos.');
    const entry: StoredEntry = { id: randomUUID(), question: q, appId: report.appId, appName: report.appName, report, source,
      state: source === 'records' ? 'completed' : 'queued', createdAt: this.now(), updatedAt: this.now() };
    if (source === 'records') entry.answer = dailyActivity ?? (command && kind !== 'report' ? 'No ejecuté esa acción. En esta etapa, el asistente conversa, recomienda y da informes. Para iniciar campañas, enviar o registrar pagos, usá los controles correspondientes de Central Comercial.' : report.text);
    this.entries.push(entry); this.save();
    if (source === 'openjarvis' && !this.jarvis.status().assistantReady && geminiEnabled()) {
      entry.state = 'running'; entry.model = geminiModel; this.save();
      try {
        const history = this.entries.filter(e => e.id !== entry.id && e.appId === entry.appId && e.state === 'completed' && e.answer).slice(-6).map(e => `Usuario: ${e.question.slice(0,400)}\nCentral: ${e.answer!.slice(0,600)}`).join('\n\n');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({ model: geminiModel, contents: JSON.stringify({ question: q, history, report }), config: { maxOutputTokens: 600, temperature: 0.3, systemInstruction: 'Sos Central Comercial, director comercial consultivo. Conversá naturalmente en español y respondé preguntas de seguimiento usando el historial. Basate solo en los registros fechados y el catálogo adjunto; para actividad de hoy usá dailyMarketActivity. Una campaña activa o cero suscripciones no indican si hubo actividad; no inventes clientes, resultados, precios ni envíos. No ejecutes acciones ni afirmes que las ejecutaste. No reveles claves. No envíes mensajes ni confirmes pagos. Si falta información, decilo.' } });
        const answer = response.text?.trim();
        if (!answer || answer.length > 3000) throw new Error('Gemini no devolvió una respuesta válida.');
        entry.answer = answer; entry.state = 'completed';
      } catch (error: any) {
        entry.state = 'failed'; entry.error = /429|quota|RESOURCE_EXHAUSTED/i.test(String(error?.message)) ? 'Cuota Gemini agotada: se detuvieron las consultas, sin reintentos automáticos.' : 'No se pudo obtener respuesta de Gemini. Revisá la configuración y la cuota gratuita.';
      }
      entry.updatedAt = this.now(); this.save();
    }
    return entry.id;
  }
  claim(workerId: string) {
    this.expire();
    if (!this.jarvis.assistantWorkerReady(workerId)) throw new Error('El puente debe actualizarse y conectar OpenJarvis antes de conversar.');
    if (this.entries.some(e => e.state === 'running')) return null;
    const entry = this.entries.find(e => e.state === 'queued'); if (!entry) return null;
    const lease = randomBytes(24).toString('hex');
    entry.state = 'running'; entry.workerId = workerId; entry.leaseHash = hash(lease).toString('hex'); entry.updatedAt = this.now(); entry.model = this.jarvis.status().model;
    this.save();
    const previous = this.entries.filter(e => e.appId === entry.appId && e.state === 'completed' && Boolean(e.answer) && e.createdAt < entry.createdAt).slice(-6);
    const conversationContext = previous.map(e => `Usuario: ${e.question.slice(0, 500)}\nCentral: ${(e.answer || '').slice(0, 900)}${e.campaignProposal ? '\nPropuesta previa: '+JSON.stringify(e.campaignProposal).slice(0, 2100) : ''}`).join('\n\n');
    return { id: entry.id, lease, question: entry.question, conversationContext, report: entry.report, model: entry.model };
  }
  complete(id: string, workerId: string, lease: unknown, input: { failed?: boolean; answer?: unknown; campaignProposal?: unknown }) {
    this.expire(); const entry = this.entries.find(e => e.id === id);
    if (!entry || entry.workerId !== workerId || typeof lease !== 'string' || lease.length > 100 || !entry.leaseHash || !timingSafeEqual(hash(lease), Buffer.from(entry.leaseHash, 'hex'))) throw new Error('Consulta no asignada a este puente.');
    if (['completed', 'failed'].includes(entry.state)) return;
    if (input.failed) { entry.state = 'failed'; entry.error = 'OpenJarvis no devolvió una respuesta válida. No se regeneró la consulta.'; }
    else {
      if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 3000) throw new Error('Respuesta inválida.');
      entry.answer = input.answer.trim();
      entry.campaignProposal = validateCampaignProposal(input.campaignProposal, entry.report);
      if (input.campaignProposal && !entry.campaignProposal) entry.answer += '\n\nNo pude preparar un cambio válido. Revisá la aplicación, la campaña elegida y el país.';
      entry.state = 'completed';
    }
    entry.updatedAt = this.now(); this.save();
  }
  applyCampaign(id: string) {
    if (!campaignChatEnabled()) throw new Error('Aplicá los cambios desde Central Comercial en tu PC.');
    const entry = this.entries.find(item => item.id === id);
    const proposal = entry?.campaignProposal;
    if (!entry || entry.state !== 'completed' || !proposal) throw new Error('No hay una propuesta pendiente en este mensaje.');
    if (!proposal.applied) {
      const newer = this.entries.some(item => item.createdAt > entry.createdAt && item.appId === entry.appId &&
        item.campaignProposal && item.campaignProposal.campaignId === proposal.campaignId);
      if (newer) throw new Error('Hay una propuesta más reciente. Revisá el último cambio antes de aplicarlo.');
      proposal.applied = applyCampaignProposal(entry.id, entry.appId, proposal);
      this.save();
    }
    return proposal.applied;
  }
}
export function registerAssistantWorkerRoutes(app: Express, queue: AssistantQueue) {
  app.post('/api/assistant/worker/:action', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!workerAuthorized(req.headers.authorization, openJarvisWorkerKey())) return res.status(401).json({ error: 'Puente no autorizado.' });
    try {
      const { workerId } = req.body || {};
      if (typeof workerId !== 'string' || !workerId || workerId.length > 100) throw new Error('Identificador de puente inválido.');
      if (req.params.action === 'claim') return res.json({ job: queue.claim(workerId) });
      if (req.params.action === 'complete') { queue.complete(req.body.id, workerId, req.body.lease, req.body); return res.json({ ok: true }); }
      return res.status(404).json({ error: 'Acción desconocida.' });
    } catch (e: any) { return res.status(409).json({ error: e.message }); }
  });
}
