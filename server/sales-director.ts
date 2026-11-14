import type { Application, Campaign, MonthlySalesGoal, PaymentRecord, Client } from '../src/types.js';
import { accountingDay, validDay } from '../src/ledger.js';

export const normalize = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function defaultGoal(month: string): MonthlySalesGoal {
  return { month, targetClients: month === '2026-11' ? 5 : 0, enabled: month === '2026-11', discoverContacts: true, sendEmail: true, answerEmail: true, countries: ['Argentina'], dailyEmailLimit: 10, dailyResearchLimit: 12, updatedAt: new Date().toISOString() };
}
export function validateGoal(input: MonthlySalesGoal) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('Mes no válido.');
  if (!Number.isInteger(input.targetClients) || input.targetClients < 0 || input.targetClients > 10000) throw new Error('La meta debe ser un entero entre 0 y 10.000 clientes.');
  if (!Number.isInteger(input.dailyEmailLimit) || input.dailyEmailLimit < 1 || input.dailyEmailLimit > 50) throw new Error('Elegí un límite diario de 1 a 50 correos.');
  if (!Number.isInteger(input.dailyResearchLimit) || input.dailyResearchLimit < 1 || input.dailyResearchLimit > 20) throw new Error('Elegí de 1 a 20 páginas de investigación por día.');
  if (!Array.isArray(input.countries) || !input.countries.length || input.countries.length > 10 || input.countries.some(c => typeof c !== 'string' || !c.trim() || c.length > 60)) throw new Error('Indicá hasta diez países de búsqueda.');
  for (const field of ['enabled', 'discoverContacts', 'sendEmail', 'answerEmail'] as const) if (typeof input[field] !== 'boolean') throw new Error('Configuración de autonomía no válida.');
}
export function playbook(app: Application) {
  const name = normalize(`${app.slug} ${app.name}`);
  if (name.includes('voley')) return { audience: 'Clubes, escuelas y asociaciones de voleibol', reason: 'Sus entrenadores registran partidos y preparan análisis y entrenamientos.', terms: ['voleibol', 'voley', 'volley', 'vôlei'], segments: ['club voleibol contacto', 'club vóley contacto', 'federación voleibol contacto', 'asociación voley contacto', 'escuela voleibol contacto'] };
  if (name.includes('visibility')) return { audience: 'Agencias digitales, consultoras y pymes con sitio web', reason: 'Pueden contratar auditorías y seguimiento o sumar el servicio para sus clientes.', terms: ['agencia', 'marketing', 'consultora', 'digital', 'seo'], segments: ['agencia marketing digital contacto', 'consultora SEO contacto', 'agencia diseño web contacto'] };
  if (name.includes('neuro')) return { audience: 'Instituciones educativas y centros con contacto institucional público', reason: 'Pueden conocer las actividades y herramientas de acompañamiento adulto. No se investigan familias ni datos de niños.', terms: ['educacion', 'educativo', 'infancia', 'escuela', 'inclusion', 'neurodesarrollo', 'actividades infantiles', 'jardin de infantes', 'autismo', 'tdah', 'psicopedagog', 'terapeutic'], segments: ['centro educativo contacto institucional', 'institución educativa actividades niños contacto', 'fundación educación familias contacto'] };
  return { audience: app.targetAudience, reason: 'La aplicación debe estar lista y habilitada para campañas.', terms: [], segments: [] };
}
export function researchQueriesFor(app: Application, country: string) {
  if (normalize(country) !== 'brasil') return playbook(app).segments.map(segment=>`${segment} ${country}`);
  const name=normalize(`${app.slug} ${app.name}`);
  const segments=name.includes('voley')?['clube vôlei contato','escola voleibol contato','federação voleibol contato']:name.includes('visibility')?['agência marketing digital contato','consultoria SEO contato','agência desenvolvimento web contato']:name.includes('neuro')?['instituição educação infantil contato','escola atividades infantis contato','fundação educação famílias contato']:[];
  return segments.map(segment=>`${segment} ${country}`);
}
export function goalProgress(goal: MonthlySalesGoal, applications: Application[], payments: PaymentRecord[], clients: Client[], now = new Date()) {
  const eligibleApps = applications.filter(a => a.status === 'lista' && a.campaignsAllowed);
  const appIds = new Set(eligibleApps.map(a => a.id)), clientIds = new Set(clients.map(c => c.id));
  const paid = payments.filter(p => p.status === 'confirmado' && p.reviewedAt && typeof p.paymentDate === 'string' && validDay(p.paymentDate.slice(0,10)) && p.paymentDate.slice(0,10) <= accountingDay(now) && Number.isFinite(p.amount) && p.amount > 0 && appIds.has(p.appId) && clientIds.has(p.clientId)).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  const firstClient = new Map<string, PaymentRecord>();
  const firstApp = new Map<string, PaymentRecord>();
  for (const payment of paid) {
    if (!firstClient.has(payment.clientId)) firstClient.set(payment.clientId, payment);
    const key = `${payment.clientId}:${payment.appId}`;
    if (!firstApp.has(key)) firstApp.set(key, payment);
  }
  const belongs = (p: PaymentRecord) => /^\d{4}-\d{2}-\d{2}/.test(p.paymentDate || '') && p.paymentDate.slice(0, 7) === goal.month;
  const achieved = [...firstClient.values()].filter(belongs).length;
  const today = accountingDay(now);
  const end = new Date(`${goal.month}-01T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  const daysRemaining = today.slice(0, 7) === goal.month ? Math.max(0, Math.round((Date.parse(end.toISOString().slice(0, 10)) - Date.parse(today)) / 86400000) + 1) : today.slice(0, 7) > goal.month ? 0 : end.getUTCDate();
  return { goal, achieved, remaining: Math.max(0, goal.targetClients - achieved), daysRemaining, apps: applications.map(app => ({ id: app.id, name: app.name, ready: appIds.has(app.id), clients: [...firstApp.values()].filter(p => p.appId === app.id && belongs(p)).length, ...playbook(app) })) };
}
export function promotionalTemplate(app: Application, country: string) {
  const portuguese = normalize(country) === 'brasil';
  const key = normalize(app.slug);
  const description = portuguese ? key.includes('voley') ? 'Uma plataforma de scout, análise e treinamento de voleibol para treinadores e clubes.' : key.includes('visibility') ? 'Auditoria e acompanhamento da presença digital de empresas e agências.' : 'Atividades e jogos para crianças com acompanhamento de adultos. A plataforma não faz diagnósticos nem tratamentos.' : app.description;
  return portuguese
    ? `Olá, equipe de {organizacion}.\n\nGostaríamos de apresentar ${app.name}. ${description}\n\nVocê pode conhecer os serviços e as condições em ${app.website}. Gostaria de receber mais informações para sua organização?\n\nEquipe ${app.name}\nSe este contato não for adequado ou você preferir não receber novas mensagens, responda BAJA ou SAIR.`
    : `Hola, equipo de {organizacion}:\n\nDesde ${app.name} queremos presentarles nuestros servicios. ${description}\n\nPueden conocer las funciones y condiciones en ${app.website}. ¿Les interesaría recibir una presentación para evaluar si puede ser útil para su organización?\n\nQuedamos a disposición para responder sus consultas.\nEquipo de ${app.name}\nSi este contacto no corresponde o prefieren no recibir más mensajes, respondan BAJA y no volveremos a contactarlos.`;
}
export function goalCampaigns(goal: MonthlySalesGoal, apps: Application[], existing: Campaign[], now = new Date()) {
  if (!goal.enabled || goal.targetClients <= 0 || accountingDay(now).slice(0, 7) !== goal.month) return [];
  const result: Campaign[] = [];
  for (const app of apps.filter(a => a.status === 'lista' && a.campaignsAllowed)) for (const country of goal.countries) {
    const strategy = playbook(app); if (!strategy.segments.length) continue;
    const id = `goal-${goal.month}-${app.id}-${normalize(country).replace(/[^a-z0-9]+/g,'-')}`;
    if (existing.some(c => c.id === id)) continue;
    const end = new Date(`${goal.month}-01T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
    result.push({ id, appId: app.id, name: `${app.name} · Objetivo ${goal.month}`, goalMonth: goal.month, objective: `Contribuir al objetivo conjunto de ${goal.targetClients} clientes nuevos con primer pago confirmado.`, country, language: normalize(country) === 'brasil' ? 'pt-BR' : 'es', segment: '', researchSegment: strategy.audience, researchQueryVersion: 2, researchQueries: researchQueriesFor(app,country), channels: ['email'], messageTemplate: promotionalTemplate(app, country), followUpTemplates: [], timezone: 'America/Argentina/Buenos_Aires', sendWindowStart: '09:00', sendWindowEnd: '18:00', dailyLimit: Math.max(1, Math.floor(goal.dailyEmailLimit / Math.max(1, apps.filter(a => a.status === 'lista' && a.campaignsAllowed).length))), startDate: accountingDay(now), endDate: end.toISOString().slice(0, 10), maxFollowUps: 0, followUpIntervalDays: 4, stopCriteria: ['respuesta_recibida', 'solicitud_baja', 'objetivo_alcanzado'], mode: 'automatico', status: 'lista', autoPrepare: true, autoSendEmail: goal.sendEmail, allowPublicEmail: true, stats: { contactsCount: 0, messagesPending: 0, messagesSent: 0, messagesFailed: 0, messagesUnknown: 0, responsesReceived: 0 }, createdAt: now.toISOString(), updatedAt: now.toISOString() });
  }
  return result;
}

// Operational counts use recorded evidence. Prepared drafts and claims of payment
// never become sent mail or paid customers in this view.
export function operationalSummary(
  app: Application, month: string,
  contacts: import('../src/types.js').Contact[],
  campaigns: Campaign[], conversations: import('../src/types.js').Conversation[],
  payments: PaymentRecord[], tasks: import('../src/types.js').CommercialTask[]
) {
  const inMonth = (value?: string) => {
    if (!value || !Number.isFinite(Date.parse(value))) return false;
    return accountingDay(new Date(value)).slice(0, 7) === month;
  };
  const pool = contacts.filter(c => c.interestedAppIds?.includes(app.id) && !['cliente', 'descartado', 'baja_solicitada'].includes(c.status) && c.permission !== 'revocado' && c.source?.trim() && Number.isFinite(Date.parse(c.sourceReviewDate)));
  const threads = conversations.filter(c => c.appId === app.id);
  const attempted = threads.flatMap(c => c.messages.map(m => ({ ...m, contactId: c.contactId })));
  const accepted = attempted.filter(m => m.direction === 'outbound' && ['aceptado_proveedor', 'entrega_confirmada', 'enviado'].includes(m.status) && m.serviceConfirmationId && inMonth(m.acceptedAt || m.sentAt));
  const received = threads.filter(c => c.messages.some(m => m.direction === 'inbound' && m.providerMessageId && inMonth(m.createdAt)));
  const questions = threads.filter(c => c.requiresHumanIntervention && c.messages.some(m => m.direction === 'inbound')).map(c => {
    const task = tasks.find(t => t.status === 'pendiente' && t.relatedType === 'conversacion' && t.relatedId === c.id);
    const contact = contacts.find(item => item.id === c.contactId);
    return { id: c.id, organization: contact?.orgName || 'Contacto registrado', reason: task?.description || c.adminNote || 'Revisar la consulta recibida antes de responder.' };
  });
  return {
    contactsAvailable: pool.length,
    prepared: attempted.filter(m => m.direction === 'outbound' && m.status === 'preparado' && m.reviewStatus !== 'rejected' && inMonth(m.createdAt)).length,
    acceptedContacts: new Set(accepted.map(m => m.contactId)).size,
    responses: new Set(received.map(c => c.contactId)).size,
    interested: contacts.filter(c => c.interestedAppIds?.includes(app.id) && c.status === 'interesado').length,
    uncertain: attempted.filter(m => m.direction === 'outbound' && m.status === 'resultado_desconocido' && inMonth(m.attemptedAt || m.createdAt)).length,
    pendingPayments: payments.filter(p => p.appId === app.id && p.status === 'pendiente_confirmacion_manual').length,
    questions,
    campaigns: campaigns.filter(c => c.appId === app.id && c.goalMonth === month).map(c => ({ id: c.id, name: c.name, country: c.country, status: c.status, language: c.language, lastPreparedAt: c.lastPreparation?.at, researchedAt: c.lastResearchAt }))
  };
}
