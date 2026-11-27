import type { Application, Campaign, Conversation, MonthlySalesGoal, PaymentRecord, Client, Message } from '../src/types.js';
import { localOperationsEnabled } from './execution-role.js';
import { accountingDay, validDay } from '../src/ledger.js';
import {usableContactEmail} from '../src/email-policy.js';
import {whatsappAuthorized} from '../src/whatsapp-policy.js';

import { americanMarkets, campaignCountryAllowed, marketLanguage, marketSearchName, normalize } from './campaign-markets.js';
export { normalize } from './campaign-markets.js';

// Give each application an opportunity before one with more drafts takes another turn.
export function orderCommercialConversations(conversations: Conversation[], now: Date, history = conversations, channel?: 'email' | 'whatsapp') {
  const day = accountingDay(now);
  const attempts = new Map<string,number>();
  for (const conversation of history) {
    const count = conversation.messages.filter(message => message.direction === 'outbound' &&
      (!channel || message.channel === channel) && !message.replyToProviderId && message.attemptedAt && accountingDay(new Date(message.attemptedAt)) === day).length;
    attempts.set(conversation.appId, (attempts.get(conversation.appId) || 0) + count);
  }
  return [...conversations].sort((a,b)=>(attempts.get(a.appId)||0)-(attempts.get(b.appId)||0) ||
    a.createdAt.localeCompare(b.createdAt));
}

export function unlimitedDirectorOutreach(goal: MonthlySalesGoal) {
  return localOperationsEnabled() && Boolean(goal.directorEnabled);
}

export function unlimitedCampaignOutreach(campaign: Campaign) {
  return campaign.dailyLimit === 0 && campaign.mode === 'automatico' &&
    Boolean(campaign.goalMonth && campaign.id.startsWith(`goal-${campaign.goalMonth}-`));
}

export function defaultGoal(month: string): MonthlySalesGoal {
  return { month, targetClients: month === '2026-11' ? 5 : 0, enabled: month === '2026-11', discoverContacts: true, sendEmail: true, answerEmail: true, countries: ['Argentina'], dailyEmailLimit: 10, dailyResearchLimit: localOperationsEnabled() ? 0 : 40, updatedAt: new Date().toISOString() };
}
export function validateGoal(input: MonthlySalesGoal) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('Mes no válido.');
  if (!Number.isInteger(input.targetClients) || input.targetClients < 0 || input.targetClients > 10000) throw new Error('La meta debe ser un entero entre 0 y 10.000 clientes.');
  if (!Number.isInteger(input.dailyEmailLimit) || input.dailyEmailLimit < 1 || input.dailyEmailLimit > 50) throw new Error('Elegí un límite diario de 1 a 50 correos.');
  if (!Number.isInteger(input.dailyResearchLimit) || input.dailyResearchLimit < 0) throw new Error('Configuración de investigación inválida.');
  if (!Array.isArray(input.countries) || !input.countries.length || input.countries.length > americanMarkets.length || input.countries.some(c => typeof c !== 'string' || !c.trim() || c.length > 60)) throw new Error('Indicá hasta 35 países de búsqueda.');
  for (const field of ['enabled', 'discoverContacts', 'sendEmail', 'answerEmail'] as const) if (typeof input[field] !== 'boolean') throw new Error('Configuración de autonomía no válida.');
}
export function playbook(app: Application) {
  const name = normalize(`${app.slug} ${app.name}`);
  if (name.includes('voley')) return { audience: 'Clubes, escuelas, asociaciones y técnicos de voleibol', reason: 'Sus entrenadores registran partidos y preparan análisis y entrenamientos.', terms: ['voleibol', 'voley', 'volley', 'vôlei', 'volleyball', 'volleybal'], segments: ['entrenador de voleibol contacto profesional', 'director técnico de vóley contacto profesional', 'club voleibol contacto', 'club vóley contacto', 'federación voleibol contacto', 'asociación voley contacto', 'escuela voleibol contacto'] };
  if (name.includes('visibility')) return { audience: 'Agencias digitales, consultoras y pymes con sitio web', reason: 'Pueden contratar auditorías y seguimiento o sumar el servicio para sus clientes.', terms: ['agencia', 'marketing', 'consultora', 'digital', 'seo'], segments: ['agencia marketing digital contacto', 'consultora SEO contacto', 'agencia diseño web contacto'] };
  if (name.includes('funer')) return {audience:'Empresas funerarias y salas velatorias',reason:'Pueden organizar los servicios, recursos, agenda e inventario de su empresa.',terms:['funeraria','funerarias','funerario','funerarios','funeral','funerales','velatorio','velatorios','velatoria','velatorias','servicios funebres'],segments:['empresa funeraria contacto','servicios funerarios contacto','sala velatoria contacto']};
  if (name.includes('neuro')) return { audience: 'Instituciones educativas y centros con contacto institucional público', reason: 'Pueden conocer las actividades y herramientas de acompañamiento adulto. No se investigan familias ni datos de niños.', terms: ['educacion', 'educativo', 'educativa', 'educacao', 'infantil', 'escola', 'infancia', 'escuela', 'inclusion', 'neurodesarrollo', 'actividades infantiles', 'jardin de infantes', 'autismo', 'tdah', 'psicopedagog', 'terapeutic'], segments: ['centro educativo contacto institucional', 'institución educativa actividades niños contacto', 'fundación educación familias contacto'] };
  return { audience: app.targetAudience, reason: 'La aplicación debe estar lista y habilitada para campañas.', terms: [], segments: [] };
}
const translatedProspecting = {
  en: {
    voley: ['volleyball coach professional contact', 'volleyball club', 'volleyball federation', 'volleyball academy'],
    visibility: ['digital marketing agency', 'SEO consultancy', 'web design agency'],
    neuro: ['early childhood education centre', 'kindergarten', 'family education foundation'],
  },
  fr: {
    voley: ['entraîneur de volleyball', 'club de volleyball', 'fédération de volleyball', 'école de volleyball'],
    visibility: ['agence de marketing numérique', 'consultant SEO', 'agence web'],
    neuro: ['école maternelle', 'centre de la petite enfance', 'association éducative'],
  },
  nl: {
    voley: ['volleyballtrainer', 'volleybalclub', 'volleybalbond', 'volleybalschool'],
    visibility: ['digitaal marketingbureau', 'SEO adviesbureau', 'webdesignbureau'],
    neuro: ['kleuterschool', 'centrum voor kinderopvang', 'educatieve stichting'],
  },
};
function audienceKey(app: Application) {
  const slug = normalize(app.slug);
  return slug.includes('voley') ? 'voley' : slug.includes('visibility') ? 'visibility' : slug.includes('neuro') ? 'neuro' : undefined;
}
export function prospectingTerms(app: Application, country: string) {
  const language = marketLanguage(country);
  const key = audienceKey(app);
  return key && language in translatedProspecting
    ? [...playbook(app).terms, ...translatedProspecting[language as keyof typeof translatedProspecting][key]]
    : playbook(app).terms;
}
export function researchQueriesFor(app: Application, country: string) {
  const language = marketLanguage(country), key = audienceKey(app);
  const market = marketSearchName(country);
  if (key && language in translatedProspecting) {
    return translatedProspecting[language as keyof typeof translatedProspecting][key].map(segment => `${segment} contact ${market}`);
  }
  if (language !== 'pt-BR') return playbook(app).segments.map(segment => `${segment} ${market}`);
  const name=normalize(`${app.slug} ${app.name}`);
  const segments=name.includes('voley')?['treinador de vôlei contato profissional','técnico de voleibol contato profissional','clube vôlei contato','escola voleibol contato','federação voleibol contato']:name.includes('visibility')?['agência marketing digital contato','consultoria SEO contato','agência desenvolvimento web contato']:name.includes('funer')?['empresa funerária contato','serviços funerários contato','sala velatória contato']:name.includes('neuro')?['instituição educação infantil contato','escola atividades infantis contato','fundação educação famílias contato']:[];
  return segments.map(segment=>`${segment} ${country}`);
}
// Catalog execution is explicit and distinct from a completed AI proposal.
export function campaignStrategyReady(c: Campaign, app: Application | undefined) {
  if (!c.intelligenceEnabled || c.intelligencePlanId) return true;
  const base = c.catalogStrategy;
  if (!app || app.status !== 'lista' || !app.campaignsAllowed || !base || base.version !== 1 || base.appId !== app.id || base.country !== c.country) return false;
  const canonical = researchQueriesFor(app, c.country);
  return Boolean(c.researchQueries?.length && c.researchQueries.every(q => canonical.includes(q)));
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
  const language = marketLanguage(country);
  if (language === 'en') return `Hello, {organizacion} team.

We would like to introduce ${app.name}. You can learn about our services at ${app.website}. Would you like a brief introduction to see if it fits your organisation?

The ${app.name} team
If you prefer not to receive further messages, please reply UNSUBSCRIBE.`;
  if (language === 'fr') return `Bonjour, équipe de {organizacion}.

Nous souhaitons vous présenter ${app.name}. Découvrez nos services sur ${app.website}. Souhaitez-vous recevoir une présentation pour votre organisation ?

L’équipe ${app.name}
Pour ne plus recevoir de messages, répondez STOP.`;
  if (language === 'nl') return `Hallo, team van {organizacion}.

Graag stellen wij ${app.name} aan u voor. Op ${app.website} vindt u informatie over onze diensten. Wilt u een korte introductie voor uw organisatie ontvangen?

Het team van ${app.name}
Antwoord STOP als u geen verdere berichten wilt ontvangen.`;
  const portuguese = language === 'pt-BR';
  const key = normalize(app.slug);
  const description = portuguese ? key.includes('voley') ? 'Uma plataforma de scout, análise e treinamento de voleibol para treinadores e clubes.' : key.includes('visibility') ? 'Auditoria e acompanhamento da presença digital de empresas e agências.' : key.includes('funer') ? 'Gestão operacional e administrativa para empresas funerárias: serviços, recursos, agenda e estoque.' : 'Atividades e jogos para crianças com acompanhamento de adultos. A plataforma não faz diagnósticos nem tratamentos.' : app.description;
  return portuguese
    ? `Olá, equipe de {organizacion}.\n\nGostaríamos de apresentar ${app.name}. ${description}\n\nVocê pode conhecer os serviços e as condições em ${app.website}. Gostaria de receber mais informações para sua organização?\n\nEquipe ${app.name}\nSe este contato não for adequado ou você preferir não receber novas mensagens, responda BAJA ou SAIR.`
    : `Hola, equipo de {organizacion}:\n\nDesde ${app.name} queremos presentarles nuestros servicios. ${description}\n\nPueden conocer las funciones y condiciones en ${app.website}. ¿Les interesaría recibir una presentación para evaluar si puede ser útil para su organización?\n\nQuedamos a disposición para responder sus consultas.\nEquipo de ${app.name}\nSi este contacto no corresponde o prefieren no recibir más mensajes, respondan BAJA y no volveremos a contactarlos.`;
}
export function goalCampaigns(goal: MonthlySalesGoal, apps: Application[], existing: Campaign[], now = new Date()) {
  if (!goal.enabled || goal.targetClients <= 0 || accountingDay(now).slice(0, 7) !== goal.month) return [];
  const result: Campaign[] = [];
  for (const app of apps.filter(a => a.status === 'lista' && a.campaignsAllowed)) for (const country of goal.countries) {
    if (!campaignCountryAllowed(app, country)) continue;
    const strategy = playbook(app); if (!strategy.segments.length) continue;
    const id = `goal-${goal.month}-${app.id}-${normalize(country).replace(/[^a-z0-9]+/g,'-')}`;
    if (existing.some(c => c.id === id)) continue;
    const end = new Date(`${goal.month}-01T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
    result.push({ id, appId: app.id, name: `${app.name} · Objetivo ${goal.month}`, goalMonth: goal.month, objective: `Contribuir al objetivo conjunto de ${goal.targetClients} clientes nuevos con primer pago confirmado.`, country, language: marketLanguage(country), segment: '', researchSegment: strategy.audience, researchQueryVersion: 2, researchQueries: researchQueriesFor(app,country), channels: ['email'], messageTemplate: promotionalTemplate(app, country), followUpTemplates: [], timezone: 'America/Argentina/Buenos_Aires', sendWindowStart: '09:00', sendWindowEnd: '18:00', dailyLimit: Math.max(1, Math.floor(goal.dailyEmailLimit / Math.max(1, apps.filter(a => a.status === 'lista' && a.campaignsAllowed).length))), startDate: accountingDay(now), endDate: end.toISOString().slice(0, 10), maxFollowUps: 0, followUpIntervalDays: 4, stopCriteria: ['respuesta_recibida', 'solicitud_baja', 'objetivo_alcanzado'], mode: 'automatico', status: 'lista', autoPrepare: true, autoSendEmail: goal.sendEmail, allowPublicEmail: true, stats: { contactsCount: 0, messagesPending: 0, messagesSent: 0, messagesFailed: 0, messagesUnknown: 0, responsesReceived: 0 }, createdAt: now.toISOString(), updatedAt: now.toISOString() });
  }
  return result;
}

export const funeralShiftQueries = ['funeraria servicio 24 horas contacto México', 'funeraria nuestras sucursales contacto México'];

export function createFuneralShiftPilot(goal: MonthlySalesGoal, apps: Application[], existing: Campaign[], now = new Date()) {
  if (!goal.directorEnabled || existing.some(c => c.funeralShiftPilot && c.goalMonth === goal.month)) return undefined;
  const app = apps.find(a => a.slug === 'funeraria');
  const country = goal.countries.find(name => normalize(name) === 'mexico');
  if (!app || !country) return undefined;
  const [base] = goalCampaigns({ ...goal, countries: [country] }, [app], [], now);
  if (!base) return undefined;
  return {
    ...base,
    id: base.id + '-refuerzo-turnos',
    name: 'Funeraria Control · Refuerzo de cambio de turno',
    objective: 'Conocer cómo las funerarias mexicanas coordinan los servicios entre turnos.',
    funeralShiftPilot: true,
    channels: goal.sendEmail ? ['email', 'whatsapp'] : ['whatsapp'],
    autoSendWhatsApp: true,
    autoSendEmail: goal.sendEmail,
    allowPublicEmail: true,
    dailyLimit: unlimitedDirectorOutreach(goal) ? 0 : base.dailyLimit,
    researchDiscoveryVersion: 3,
    researchSegment: 'Funerarias mexicanas con varias sucursales o atención 24 horas',
    researchQueries: [...funeralShiftQueries],
    messageTemplate: `Hola, equipo de {organizacion}.

Soy Gervasio, de Funeraria Control. La app reúne el expediente de cada servicio, sus horarios, el vehículo asignado y las tareas pendientes.

Si un servicio empieza de noche, el equipo de la mañana puede abrir el expediente y ver qué se confirmó y qué falta resolver.

¿Cómo comparten hoy esa información entre turnos? Si les interesa, les puedo enviar un ejemplo breve.

Saludos,
Gervasio · Funeraria Control
Si prefieren no recibir más mensajes, respondan BAJA.`,
  } satisfies Campaign;
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
  const pool = contacts.filter(c => c.interestedAppIds?.includes(app.id) && !['cliente', 'descartado', 'baja_solicitada'].includes(c.status) && c.permission !== 'revocado' && c.source?.trim() && Number.isFinite(Date.parse(c.sourceReviewDate)) && (usableContactEmail(c.email) || whatsappAuthorized(c)));
  const threads = conversations.filter(c => c.appId === app.id);
  const attempted = threads.flatMap(c => c.messages.map(m => ({ ...m, contactId: c.contactId })));
  const contactById = new Map(contacts.map(c => [c.id,c]));
  const accepted = attempted.filter(m => m.direction === 'outbound' && ['aceptado_proveedor', 'entrega_confirmada', 'enviado'].includes(m.status) && m.serviceConfirmationId && inMonth(m.acceptedAt || m.sentAt));
  const received = threads.filter(c => c.messages.some(m => m.direction === 'inbound' && m.providerMessageId && inMonth(m.createdAt)));
  const questions = threads.filter(c => c.requiresHumanIntervention && c.messages.some(m => m.direction === 'inbound')).map(c => {
    const task = tasks.find(t => t.status === 'pendiente' && t.relatedType === 'conversacion' && t.relatedId === c.id);
    const contact = contacts.find(item => item.id === c.contactId);
    return { id: c.id, organization: contact?.orgName || 'Contacto registrado', reason: task?.description || c.adminNote || 'Revisar la consulta recibida antes de responder.' };
  });
  return {
    contactsAvailable: pool.length,
    prepared: attempted.filter(m => {
      const contact = contactById.get(m.contactId);
      return m.direction === 'outbound' && m.status === 'preparado' && !m.replacementMessageId && m.reviewStatus !== 'rejected' && inMonth(m.createdAt) && contact && !['descartado','baja_solicitada'].includes(contact.status) && contact.permission !== 'revocado' && (m.channel === 'email' ? usableContactEmail(contact.email) : m.channel === 'whatsapp' && whatsappAuthorized(contact));
    }).length,
    acceptedContacts: new Set(accepted.map(m => m.contactId)).size,
    responses: new Set(received.map(c => c.contactId)).size,
    interested: contacts.filter(c => c.interestedAppIds?.includes(app.id) && c.status === 'interesado').length,
    uncertain: attempted.filter(m => m.direction === 'outbound' && m.status === 'resultado_desconocido' && inMonth(m.attemptedAt || m.createdAt)).length,
    pendingPayments: payments.filter(p => p.appId === app.id && p.status === 'pendiente_confirmacion_manual').length,
    questions,
    campaigns: campaigns.filter(c => c.appId === app.id && c.goalMonth === month).map(c => ({ id: c.id, name: c.name, country: c.country, status: c.status, language: c.language, lastPreparedAt: c.lastPreparation?.at, researchedAt: c.lastResearchAt }))
  };
}

// Per-campaign quotas count both channels. A channel filter can limit a provider-specific quota.
export function dailyOutreachKeys(conversations: Conversation[], now: Date, campaignId?: string, channel?: 'email' | 'whatsapp') {
  const day = accountingDay(now);
  return new Set(conversations.flatMap(thread => {
    if (campaignId && thread.campaignId !== campaignId) return [];
    return thread.messages.filter(message => message.direction === 'outbound' && message.attemptedAt &&
      (!channel || message.channel === channel) && accountingDay(new Date(message.attemptedAt)) === day && (!campaignId || !message.replyToProviderId))
      .map(message => outreachKey(thread, message));
  }));
}

export function outreachKey(thread: Conversation, message: Message) {
  return thread.campaignId && !message.replyToProviderId
    ? JSON.stringify([thread.campaignId, thread.contactId])
    : message.id;
}
