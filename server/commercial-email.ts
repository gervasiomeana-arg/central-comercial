import { whatsappAuthorized, whatsappCampaignEligible, whatsappPhone } from '../src/whatsapp-policy.js';
import { campaignCountryAllowed, marketLanguage } from './campaign-markets.js';
import {emailPromotionHold, usableContactEmail} from '../src/email-policy.js';
import {campaignStrategyReady, orderCommercialConversations, unlimitedCampaignOutreach, unlimitedDirectorOutreach,dailyOutreachKeys,outreachKey} from './sales-director.js';
import { randomUUID, createHash } from 'node:crypto';
import type { Express } from 'express';
import { db } from './db.js';
import { workerAuthorized } from './channelTests.js';
import { accountingDay } from '../src/ledger.js';
import { normalize } from './sales-director.js';
import { verifiedPriceSummary } from './commercial-catalog.js';
import type { Application, Contact, Conversation, Message } from '../src/types.js';

const whatsappInvitations = {
  es: 'Si aceptás recibir información y promociones de Central Comercial sobre sus aplicaciones por WhatsApp, respondé solo con WHATSAPP OK seguido de tu número en formato internacional con +.',
  en: 'If you agree to receive information and promotions from Central Comercial about its apps via WhatsApp, reply only with WHATSAPP OK followed by your international number starting with +.',
  'pt-BR': 'Se você aceita receber informações e promoções da Central Comercial sobre seus aplicativos pelo WhatsApp, responda apenas WHATSAPP OK seguido do seu número internacional com +.',
  fr: 'Si vous acceptez de recevoir par WhatsApp des informations et des offres de Central Comercial sur ses applications, répondez uniquement WHATSAPP OK suivi de votre numéro international commençant par +.',
  nl: 'Als u via WhatsApp informatie en aanbiedingen van Central Comercial over zijn apps wilt ontvangen, antwoord dan alleen met WHATSAPP OK gevolgd door uw internationale nummer met +.',
};

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function currentReplyText(text: string) {
  return text.split(/\n(?:>+|On .{0,250}wrote:|El .{0,250}escribi[oó]:|Em .{0,250}escreveu:|_{5,}|-{3,}\s*(?:Original|Mensaje|Mensagem))/i)[0].trim();
}
export function replyDecision(text: string, app: Application, country: string) {
  const input = normalize(text);
  if (/\b(baja|sair|unsubscribe|stop)\b|no (me interesa|enviar|contact)|nao (tenho interesse|enviar)/.test(input)) return { kind: 'unsubscribe' as const };
  if (/pague|pago realizado|transferi|comprobante|ya abone|pagamento efetuado/.test(input)) return { kind: 'human' as const, reason: 'Revisar el pago informado y registrar el importe únicamente contra comprobación real.' };
  if (/quiero (contratar|suscribirme|comprar)|confirmo.*(contrat|suscri)|quero (contratar|assinar)/.test(input)) return { kind: 'purchase' as const, reason: 'Confirmar el plan y las condiciones; registrar la cuenta corriente y revisar el primer pago.' };
  if (normalize(country) === 'brasil' || /descuento|reclamo|cancel|contrato|garant|reembol|diagnostic|tratamiento/.test(input)) return { kind: 'human' as const, reason: 'Consulta que requiere condiciones o respuesta personal del propietario.' };
  if (/precio|tarifa|cuanto cuesta|planes|costo/.test(input)) return { kind: 'answer' as const, text: `Gracias por consultar por ${app.name}. Estas son las condiciones del catálogo verificado:\n\n${verifiedPriceSummary(app)}\n\n${app.commercialNotes || ''}\n${app.website}\n\n¿Qué plan les interesaría evaluar? Equipo ${app.name}` };
  if (/informacion|presentacion|funciona|servicios|probar|prueba|demo/.test(input)) return { kind: 'answer' as const, text: `Gracias por su interés en ${app.name}. ${app.description}\n\n${app.commercialNotes || ''}\nPueden conocer los servicios en ${app.website}.\n\nCuéntennos qué necesita su organización para orientarles. Equipo ${app.name}` };
  return { kind: 'human' as const, reason: 'La consulta no coincide con una respuesta comercial verificada. Preparar respuesta con el propietario.' };
}
function worker(id: string) {
  const status = db.getCommercialEmailStatus();
  // Heartbeat identifies the current worker; only the private worker key grants access.
  if (!status.online) throw new Error('El ejecutor debe registrar su conexión primero.');
  db.commercialEmailHeartbeat(id, status.send, status.read, status.sender!);
  return status;
}
export function claimCommercialEmail(id: string, now = new Date()) {
  const status = worker(id), report = db.getSalesGoalProgress(), goal = report.goal;
  if (!status.send || report.paused || !goal.enabled) return null;
  const all = db.getConversations().flatMap(c => c.messages);
  const expired = all.filter(m => m.channel === 'email' && m.status === 'envio_intentado' && m.sendDeadline && m.sendDeadline < now.getTime());
  for (const m of expired) {
    m.status = 'resultado_desconocido';
    m.serviceError = 'El ejecutor no confirmó el resultado. Revisión manual, sin reenvío automático.';
  }
  if (expired.length) db.save();
  const promotionHold = emailPromotionHold(all, now.getTime());
  const directorUnlimited = unlimitedDirectorOutreach(goal);
  const dailyContacts = directorUnlimited ? new Set<string>() : dailyOutreachKeys(db.getConversations(), now);
  const whatsappAlternates = new Set(all.filter(m => m.channel === 'whatsapp' && m.status === 'fallido')
    .map(m => m.replacementMessageId));
  for (const conv of goal.directorEnabled ? orderCommercialConversations(db.getConversations(),now) : db.getConversations()) {
    const app = db.getApplicationById(conv.appId), contact = db.getContactById(conv.contactId), campaign = conv.campaignId ? db.getCampaignById(conv.campaignId) : undefined;
    if (!app || app.status !== 'lista' || !app.campaignsAllowed || !contact || contact.status === 'baja_solicitada' || contact.status === 'descartado' || contact.permission === 'revocado') continue;
    if (contact.undeliverableEmail === contact.email?.trim().toLowerCase() || !usableContactEmail(contact.email) || !contact.source || (!Number.isFinite(Date.parse(contact.sourceReviewDate)) || Date.parse(contact.sourceReviewDate) > now.getTime())) continue;
    for (const msg of conv.messages) {
      if (msg.channel !== 'email' || msg.direction !== 'outbound' || msg.status !== 'preparado' || msg.replacementMessageId || msg.reviewStatus === 'rejected' || msg.attemptedAt) continue;
      const replying = Boolean(msg.replyToProviderId);
      if (replying) { if (!goal.answerEmail || msg.reviewStatus !== 'approved') continue; }
      else {
        if (contact.status === 'cliente' || promotionHold || !campaignCountryAllowed(app, contact.country)) continue;
        if (campaign?.mode === 'automatico' && campaign.autoSendWhatsApp && campaign.channels.includes('whatsapp') &&
            !msg.reviewStatus && !whatsappAlternates.has(msg.id) && whatsappCampaignEligible(contact, now)) continue;
        if (!goal.sendEmail || !report.remaining || campaign&&!campaignStrategyReady(campaign,app) || (campaign && !db.campaignInActiveRun(campaign.id)) || (campaign?.goalMonth && (campaign.goalMonth !== goal.month || !goal.countries.includes(campaign.country))) || !campaign?.autoSendEmail || !campaign.channels.includes('email') || !['lista','activa','bloqueada_por_configuracion'].includes(campaign.status) || conv.messages.some(m => m.direction === 'inbound')) continue;
        if (contact.permission !== 'autorizado' && !(contact.permission === 'desconocido' && campaign.allowPublicEmail && contact.outreachBasis === 'public_business_contact')) continue;
        if (campaign.maxContacts !== undefined) {
          const attemptedContacts = new Set(db.getConversations().filter(c => c.campaignId === campaign.id &&
            c.messages.some(m => m.direction === 'outbound' && !m.replyToProviderId && m.attemptedAt)).map(c => c.contactId));
          if (!attemptedContacts.has(conv.contactId) && attemptedContacts.size >= campaign.maxContacts) continue;
        }
        if (campaign.mode !== 'automatico' && msg.reviewStatus !== 'approved') continue;
        const unlimited = directorUnlimited && unlimitedCampaignOutreach(campaign);
        if (!unlimited && campaign.dailyLimit < 1) continue;
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: campaign.timezone }).format(now);
        const time = new Intl.DateTimeFormat('en-GB', { timeZone: campaign.timezone, hour:'2-digit', minute:'2-digit', hour12:false }).format(now);
        if (day < campaign.startDate || day > campaign.endDate || (!unlimited && (time < campaign.sendWindowStart || time >= campaign.sendWindowEnd))) continue;
        if (!unlimited) {
          const sentToday = dailyOutreachKeys(db.getConversations(), now, campaign.id);
          if (sentToday.size >= campaign.dailyLimit && !sentToday.has(outreachKey(conv, msg))) continue;
        }
      }
      if (!replying && conv.requiresHumanIntervention && db.getTasks().some(t => t.relatedId === conv.id && t.status === 'pendiente')) continue;
      if (msg.approvedRecipient && msg.approvedRecipient.toLowerCase() !== contact.email.trim().toLowerCase()) continue;
      if (!directorUnlimited && dailyContacts.size >= goal.dailyEmailLimit && !dailyContacts.has(outreachKey(conv, msg))) continue;
      const lease = randomUUID(); msg.sendLease = hash(lease); msg.sendWorker = id; msg.sendDeadline = now.getTime() + 120000;
      msg.status = 'envio_intentado'; msg.attemptedAt = now.toISOString(); msg.approvedRecipient = contact.email.trim().toLowerCase();
      msg.providerMessageId = `<cc-${randomUUID()}@${status.sender!.split('@')[1]}>`;
      if (campaign && !replying) campaign.status = 'activa';
      if (!replying && campaign?.autoSendWhatsApp && campaign.channels.includes('whatsapp') && !whatsappCampaignEligible(contact, now)) {
        msg.whatsappInvitation = whatsappInvitations[marketLanguage(contact.country)];
      }
      msg.emailSubject ||= replying ? `Re: ${app.name} · Presentación` : `${app.name} · Presentación para ${contact.orgName}`;
      db.save();
      return { conversationId: conv.id, messageId: msg.id, lease, recipient: msg.approvedRecipient, subject: msg.emailSubject.replace(/[\r\n]/g,' '), content: msg.whatsappInvitation ? msg.content + '\n\n' + msg.whatsappInvitation : msg.content, providerMessageId: msg.providerMessageId, inReplyTo: msg.replyToProviderId };
    }
  }
  return null;
}
export function completeCommercialEmail(input: any) {
  const conv = db.getConversationById(input.conversationId), msg = conv?.messages.find(m => m.id === input.messageId);
  if (!conv || !msg || !input.lease || msg.sendLease !== hash(input.lease) || msg.sendWorker !== input.workerId) throw new Error('Intento no válido.');
  if (msg.status === 'aceptado_proveedor' || msg.status === 'fallido') return { success: true };
  if (!['envio_intentado','resultado_desconocido'].includes(msg.status)) throw new Error('El intento ya finalizó.');
  const accepted = input.outcome === 'accepted' && input.providerMessageId === msg.providerMessageId && typeof input.response === 'string' && input.response.length > 0;
  msg.status = accepted ? 'aceptado_proveedor' : input.outcome === 'rejected' ? 'fallido' : 'resultado_desconocido';
  if (accepted) {
    msg.acceptedAt = new Date().toISOString(); msg.serviceConfirmationId = msg.providerMessageId; msg.providerEvidence = String(input.response).slice(0,500);
    const contact = db.getContactById(conv.contactId)!;
    if (contact.status === 'prospecto') contact.status = 'contactado';
    contact.history.push({ id: randomUUID(), type:'mensaje_enviado', timestamp:msg.acceptedAt, description:'Correo aceptado por SMTP. No confirma entrega ni lectura.', author:'Central Comercial' });
    if (conv.campaignId) { const c = db.getCampaignById(conv.campaignId); if(c) c.stats.messagesSent++; }
  } else {
    msg.serviceError = String(input.response || 'Sin confirmación del proveedor').slice(0,500);
    if (msg.status === 'fallido' && /^5\d{2}(?:[ -]|$)/.test(msg.serviceError)) {
      msg.emailFailureAt = new Date().toISOString();
      if (msg.approvedRecipient) suppressInvalidEmail(msg.approvedRecipient, msg.serviceError);
    }
  }
  db.addLog(accepted ? 'info' : 'warning', 'conversaciones', `Correo ${msg.status}`, { conversationId:conv.id, messageId:msg.id }); db.save(); return { success:true };
}
function suppressInvalidEmail(recipient: string, diagnostic: string, status?: string) {
  const invalidMailbox = ['5.1.1', '5.1.3', '5.1.10'].includes(status || '') ||
    /\b5\.1\.(?:1|3|10)\b|\b(?:no such user|user unknown|unknown recipient|recipient unknown|mailbox does not exist|recipient (?:address )?(?:does not exist|not found))\b/i.test(diagnostic);
  if (!invalidMailbox) return;
  for (const contact of db.getContacts().filter(c => c.email?.trim().toLowerCase() === recipient)) {
    contact.undeliverableEmail = recipient;
  }
}

function legacyBounce(message: Message) {
  return message.status === 'fallido' && !message.emailFailureAt &&
    message.serviceError?.startsWith('Rebote permanente confirmado:');
}

export function recordCommercialBounce(input: { references?: unknown; recipient?: unknown; status?: unknown; diagnostic?: unknown; reportedAt?: unknown }, persist = true) {
  if (!Array.isArray(input.references) || typeof input.recipient !== 'string' ||
      typeof input.status !== 'string' || !/^5\.\d{1,3}\.\d{1,3}$/.test(input.status)) return { matched: false };
  const recipient = input.recipient.trim().toLowerCase();
  for (const conversation of db.getConversations()) {
    const message = conversation.messages.find(m => m.direction === 'outbound' && m.channel === 'email' &&
      (m.status === 'aceptado_proveedor' || m.status === 'entrega_confirmada' || legacyBounce(m)) &&
      m.providerMessageId && input.references instanceof Array &&
      input.references.includes(m.providerMessageId) && m.approvedRecipient === recipient);
    if (!message) continue;
    const wasAlreadyFailed = message.status === 'fallido';
    message.status = 'fallido';
    const diagnostic = typeof input.diagnostic === 'string' ? input.diagnostic.trim().slice(0,350) : '';
    const reportedAt = typeof input.reportedAt === 'string' ? Date.parse(input.reportedAt) : NaN;
    message.emailFailureAt = new Date(Number.isFinite(reportedAt) && reportedAt > 0 && reportedAt <= Date.now() ? reportedAt : Date.now()).toISOString();
    message.serviceError = 'Rebote permanente confirmado: ' + input.status + (diagnostic ? ' · ' + diagnostic : '');
    suppressInvalidEmail(recipient, diagnostic, input.status);
    const campaign = conversation.campaignId ? db.getCampaignById(conversation.campaignId) : undefined;
    if (campaign && !wasAlreadyFailed) {
      campaign.stats.messagesSent = Math.max(0, campaign.stats.messagesSent - 1);
      campaign.stats.messagesFailed++;
    }
    db.addLog('warning', 'conversaciones', 'Correo devuelto después de la aceptación SMTP', { messageId: message.id, status: input.status }, persist);
    return { matched: true };
  }
  return { matched: false };
}

function registerWhatsAppRequest(contact: Contact, conversation: Conversation, source: Message, phone: string, replyId: string) {
  const canonical = whatsappPhone(phone);
  const records = db.getContacts();
  if ((whatsappAuthorized(contact) && whatsappPhone(contact.phone) !== canonical) ||
      contact.permission === 'revocado' || ['baja_solicitada', 'descartado'].includes(contact.status) ||
      records.some(c => whatsappPhone(c.phone) === canonical && (c.permission === 'revocado' || c.status === 'baja_solicitada'))) return false;
  const at = new Date().toISOString();
  if (contact.phone && whatsappPhone(contact.phone) !== canonical) {
    contact.history.push({id:randomUUID(), timestamp:at, type:'nota', description:`Teléfono anterior: ${contact.phone}`, author:'Central Comercial'});
  }
  contact.phone = phone;
  contact.preferredChannel = 'whatsapp';
  contact.whatsappConsent = {granted:true, at, evidence:`Autorización explícita por correo vinculado a la promoción. Mensaje ${replyId}`};

  const campaign = conversation.campaignId ? db.getCampaignById(conversation.campaignId) : undefined;
  if (!campaign?.autoSendWhatsApp || !campaign.channels.includes('whatsapp') || campaign.mode !== 'automatico' ||
      contact.status === 'cliente' || !db.campaignInActiveRun(campaign.id)) return true;
  const related = db.getConversations();
  const contactsWithPhone = new Set(records.filter(c => whatsappPhone(c.phone) === canonical).map(c => c.id));
  if (related.some(c => c.appId === conversation.appId && (c.contactId === contact.id || contactsWithPhone.has(c.contactId)) &&
      c.messages.some(m => m.channel === 'whatsapp' && m.direction === 'outbound'))) return true;

  const id = randomUUID();
  related.unshift({
    id, contactId:contact.id, appId:conversation.appId, campaignId:campaign.id, channel:'whatsapp',
    classification:'sin_clasificar', requiresHumanIntervention:false, createdAt:at, lastMessageAt:at,
    messages:[{id:randomUUID(), conversationId:id, channel:'whatsapp', direction:'outbound',
      content:source.content, status:'preparado', approvedRecipient:canonical, createdAt:at}],
  });
  return true;
}

export function importCommercialReply(input: any) {
  if (typeof input.messageId !== 'string' || input.messageId.length > 500 || !Array.isArray(input.references) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 30000 || input.automatic) throw new Error('Respuesta no válida o automática.');
  input.text = currentReplyText(input.text);
  if (!input.text) return {success:true, skipped:true};
  const conv = db.getConversations().find(c => db.getContactById(c.contactId)?.email.trim().toLowerCase() === String(input.from).toLowerCase() && c.messages.some(m => m.direction === 'outbound' && m.providerMessageId && (m.status === 'aceptado_proveedor' || m.status === 'entrega_confirmada') && input.references.includes(m.providerMessageId)));
  if (!conv) throw new Error('La respuesta no corresponde a un envío registrado.');
  if (db.getConversations().some(c => c.messages.some(m => m.providerMessageId === input.messageId))) return { success:true, duplicate:true };
  const contact = db.getContactById(conv.contactId)!, app = db.getApplicationById(conv.appId)!;
  const optIn = /^WHATSAPP OK (\+[1-9]\d{9,14})$/i.exec(input.text);
  const invitation = optIn && conv.messages.find(m => m.channel === 'email' && m.direction === 'outbound' &&
    m.whatsappInvitation && ['aceptado_proveedor','entrega_confirmada'].includes(m.status) &&
    input.references.includes(m.providerMessageId));
  const optedIn = Boolean(optIn && invitation && registerWhatsAppRequest(contact, conv, invitation, optIn[1], input.messageId));
  db.addMessageToConversation(conv.id, { conversationId:conv.id, direction:'inbound', channel:'email', content:input.text, providerMessageId:input.messageId, status:'enviado' });
  if (optedIn) return {success:true, decision:'whatsapp_opt_in'};
  const decision = replyDecision(input.text, app, contact.country);
  if (decision.kind === 'unsubscribe') { for (const record of db.getContacts().filter(c => c.email.trim().toLowerCase() === contact.email.trim().toLowerCase())) { record.permission = 'revocado'; record.status = 'baja_solicitada'; record.nextFollowUpDate = null; } conv.requiresHumanIntervention = false; }
  else if (decision.kind === 'answer' && db.getMonthlyGoal().answerEmail && !conv.requiresHumanIntervention) {
    conv.messages.push({ id:randomUUID(), conversationId:conv.id, direction:'outbound', channel:'email', content:decision.text, replyToProviderId:input.messageId, status:'preparado', reviewStatus:'approved', reviewedAt:new Date().toISOString(), reviewedBy:'Regla comercial: catálogo verificado', approvedRecipient:contact.email.toLowerCase(), createdAt:new Date().toISOString() });
  } else {
    conv.requiresHumanIntervention = true;
    if (decision.kind === 'purchase') db.convertContactToClient(contact.id);
    const reason = 'reason' in decision ? decision.reason : 'Revisar y responder al interesado.';
    db.saveTask({ id:`reply-${hash(input.messageId).slice(0,24)}`, title:`Responder a ${contact.orgName} · ${app.name}`, description:reason || 'Revisar consulta.', priority:'alta', category:'intervencion_ia', relatedType:'conversacion', relatedId:conv.id, dueDate:null, status:'pendiente', createdAt:new Date().toISOString() });
  }
  db.save(); return { success:true, decision:decision.kind };
}
// Daily owner-only activity digest, sourced exclusively from persisted records.
export function dailyCommercialDigest(day: string, sender: string) {
  const localDay = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : accountingDay(d);
  };
  const apps = db.getApplications(), contacts = db.getContacts(), conversations = db.getConversations();
  const lines = ['CENTRAL COMERCIAL — INFORME DIARIO ' + day, '', 'Registro de actividad comprobable. Aceptación SMTP no equivale a entrega o lectura.', ''];
  for (const app of apps) {
    const related = conversations.filter(c => c.appId === app.id);
    const found = contacts.filter(c => c.interestedAppIds?.includes(app.id) && localDay(c.createdAt) === day);
    const sent = related.flatMap(c => c.messages.filter(m => m.direction === 'outbound' && ['aceptado_proveedor','entrega_confirmada'].includes(m.status) && localDay(m.acceptedAt || m.deliveredAt || m.sentAt || '') === day).map(m => ({c,m})));
    const received = related.flatMap(c => c.messages.filter(m => m.direction === 'inbound' && localDay(m.createdAt) === day));
    const pending = related.filter(c => c.requiresHumanIntervention);
    lines.push(app.name.toUpperCase(), 'Contactos registrados hoy: ' + found.length);
    for (const c of found) lines.push('  - ' + c.orgName + ' | ' + (c.contactPerson || 'Sin persona') + ' | ' + (c.email || 'Sin email') + ' | ' + c.country);
    lines.push('Mensajes con aceptación confirmada hoy: ' + sent.length);
    for (const {c,m} of sent) {
      const contact = contacts.find(x => x.id === c.contactId);
      lines.push('  - ' + (contact?.orgName || 'Contacto') + ' | ' + (contact?.email || 'Sin email') + ' | ' + m.channel + ' | ' + (m.emailSubject || m.content.slice(0,100)));
    }
    lines.push('Respuestas registradas hoy: ' + received.length, 'Conversaciones que requieren intervención: ' + pending.length, '');
  }
  lines.push('Este informe se genera con datos guardados en Central Comercial. No incluye envíos sin confirmación.');
  return {recipient:sender,subject:'Central Comercial | Resumen diario ' + day,content:lines.join('\n'),day};
}
export function registerCommercialEmailRoutes(app: Express) {
  app.post('/api/commercial-email/worker/:action', (req,res) => {
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error:'Ejecutor no autorizado.' });
    try {
      const data = req.body;
      switch(req.params.action) {
        case 'heartbeat': db.commercialEmailHeartbeat(data.workerId, data.send === true, data.read === true, data.sender); return res.json({success:true});
        case 'claim': return res.json({job:claimCommercialEmail(data.workerId)});
        case 'daily-report': {
          const status = worker(data.workerId);
          if (!status.send || !status.sender || !/^\\d{4}-\\d{2}-\\d{2}$/.test(data.day)) return res.status(409).json({error:'Correo o fecha no disponibles.'});
          return res.json(dailyCommercialDigest(data.day,status.sender));
        }
        case 'complete': return res.json(completeCommercialEmail(data));
        case 'routing': worker(data.workerId); return res.json({threads:db.getConversations().flatMap(c => c.messages.filter(m => m.direction === 'outbound' && m.channel === 'email' && m.providerMessageId && (m.status === 'aceptado_proveedor' || m.status === 'entrega_confirmada' || legacyBounce(m))).map(m => ({id:m.providerMessageId, from: m.approvedRecipient || db.getContactById(c.contactId)?.email.trim().toLowerCase()})))});
        case 'bounce': worker(data.workerId); return res.json(recordCommercialBounce(data));
        case 'bounces': {
          worker(data.workerId);
          if (!Array.isArray(data.items) || data.items.length > 50) return res.status(400).json({error:'Lote de rebotes inválido.'});
          let matched = 0;
          for (const item of data.items) if (item && recordCommercialBounce(item, false).matched) matched++;
          if (matched) db.save();
          return res.json({matched});
        }
        case 'inbound': worker(data.workerId); return res.json(importCommercialReply(data));
        default: return res.status(404).json({error:'Operación desconocida.'});
      }
    } catch(error:any) { res.status(400).json({error:error.message}); }
  });
}
