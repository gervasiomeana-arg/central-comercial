import { randomUUID, createHash } from 'node:crypto';
import type { Express } from 'express';
import { db } from './db.js';
import { workerAuthorized } from './channelTests.js';
import { accountingDay } from '../src/ledger.js';
import { normalize } from './sales-director.js';
import { verifiedPriceSummary } from './commercial-catalog.js';
import type { Application } from '../src/types.js';

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
  const status = worker(id), report = db.getSalesGoalReport(), goal = report.goal;
  if (!status.send || report.paused || !goal.enabled) return null;
  const all = db.getConversations().flatMap(c => c.messages);
  for (const m of all) if (m.status === 'envio_intentado' && m.sendDeadline && m.sendDeadline < now.getTime()) { m.status = 'resultado_desconocido'; m.serviceError = 'El ejecutor no confirmó el resultado. Revisión manual, sin reenvío automático.'; }
  db.save();
  if (all.filter(m => m.direction === 'outbound' && m.attemptedAt && accountingDay(new Date(m.attemptedAt)) === accountingDay(now)).length >= goal.dailyEmailLimit) return null;
  for (const conv of db.getConversations()) {
    const app = db.getApplicationById(conv.appId), contact = db.getContactById(conv.contactId), campaign = conv.campaignId ? db.getCampaignById(conv.campaignId) : undefined;
    if (!app || app.status !== 'lista' || !app.campaignsAllowed || !contact || contact.status === 'baja_solicitada' || contact.status === 'descartado' || contact.permission === 'revocado') continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || !contact.source || (!Number.isFinite(Date.parse(contact.sourceReviewDate)) || Date.parse(contact.sourceReviewDate) > now.getTime())) continue;
    for (const msg of conv.messages) {
      if (msg.channel !== 'email' || msg.direction !== 'outbound' || msg.status !== 'preparado' || msg.reviewStatus === 'rejected' || msg.attemptedAt) continue;
      const replying = Boolean(msg.replyToProviderId);
      if (replying) { if (!goal.answerEmail || msg.reviewStatus !== 'approved') continue; }
      else {
        if (!goal.sendEmail || !report.remaining || (campaign?.goalMonth && (campaign.goalMonth !== goal.month || !goal.countries.includes(campaign.country))) || !campaign?.autoSendEmail || !['lista','activa','bloqueada_por_configuracion'].includes(campaign.status) || conv.messages.some(m => m.direction === 'inbound')) continue;
        if (contact.permission !== 'autorizado' && !(contact.permission === 'desconocido' && campaign.allowPublicEmail && contact.outreachBasis === 'public_business_contact')) continue;
        if (campaign.mode !== 'automatico' && msg.reviewStatus !== 'approved') continue;
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: campaign.timezone }).format(now);
        const time = new Intl.DateTimeFormat('en-GB', { timeZone: campaign.timezone, hour:'2-digit', minute:'2-digit', hour12:false }).format(now);
        if (day < campaign.startDate || day > campaign.endDate || time < campaign.sendWindowStart || time >= campaign.sendWindowEnd) continue;
        if (db.getConversations().filter(c => c.campaignId === campaign.id).flatMap(c => c.messages).filter(m => m.attemptedAt && accountingDay(new Date(m.attemptedAt)) === accountingDay(now)).length >= campaign.dailyLimit) continue;
      }
      if (!replying && conv.requiresHumanIntervention && db.getTasks().some(t => t.relatedId === conv.id && t.status === 'pendiente')) continue;
      if (msg.approvedRecipient && msg.approvedRecipient.toLowerCase() !== contact.email.trim().toLowerCase()) continue;
      const lease = randomUUID(); msg.sendLease = hash(lease); msg.sendWorker = id; msg.sendDeadline = now.getTime() + 120000;
      msg.status = 'envio_intentado'; msg.attemptedAt = now.toISOString(); msg.approvedRecipient = contact.email.trim().toLowerCase();
      msg.providerMessageId = `<cc-${randomUUID()}@${status.sender!.split('@')[1]}>`;
      if (campaign && !replying) campaign.status = 'activa';
      msg.emailSubject ||= replying ? `Re: ${app.name} · Presentación` : `${app.name} · Presentación para ${contact.orgName}`;
      db.save();
      return { conversationId: conv.id, messageId: msg.id, lease, recipient: msg.approvedRecipient, subject: msg.emailSubject.replace(/[\r\n]/g,' '), content: msg.content, providerMessageId: msg.providerMessageId, inReplyTo: msg.replyToProviderId };
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
  } else msg.serviceError = String(input.response || 'Sin confirmación del proveedor').slice(0,500);
  db.addLog(accepted ? 'info' : 'warning', 'conversaciones', `Correo ${msg.status}`, { conversationId:conv.id, messageId:msg.id }); db.save(); return { success:true };
}
export function importCommercialReply(input: any) {
  if (typeof input.messageId !== 'string' || input.messageId.length > 500 || !Array.isArray(input.references) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 30000 || input.automatic) throw new Error('Respuesta no válida o automática.');
  input.text = currentReplyText(input.text);
  if (!input.text) return {success:true, skipped:true};
  const conv = db.getConversations().find(c => db.getContactById(c.contactId)?.email.trim().toLowerCase() === String(input.from).toLowerCase() && c.messages.some(m => m.direction === 'outbound' && m.providerMessageId && (m.status === 'aceptado_proveedor' || m.status === 'entrega_confirmada') && input.references.includes(m.providerMessageId)));
  if (!conv) throw new Error('La respuesta no corresponde a un envío registrado.');
  if (db.getConversations().some(c => c.messages.some(m => m.providerMessageId === input.messageId))) return { success:true, duplicate:true };
  const contact = db.getContactById(conv.contactId)!, app = db.getApplicationById(conv.appId)!;
  db.addMessageToConversation(conv.id, { conversationId:conv.id, direction:'inbound', channel:'email', content:input.text, providerMessageId:input.messageId, status:'enviado' });
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
export function registerCommercialEmailRoutes(app: Express) {
  app.post('/api/commercial-email/worker/:action', (req,res) => {
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error:'Ejecutor no autorizado.' });
    try {
      const data = req.body;
      switch(req.params.action) {
        case 'heartbeat': db.commercialEmailHeartbeat(data.workerId, data.send === true, data.read === true, data.sender); return res.json({success:true});
        case 'claim': return res.json({job:claimCommercialEmail(data.workerId)});
        case 'complete': return res.json(completeCommercialEmail(data));
        case 'routing': worker(data.workerId); return res.json({threads:db.getConversations().flatMap(c => c.messages.filter(m => m.direction === 'outbound' && m.providerMessageId && (m.status === 'aceptado_proveedor' || m.status === 'entrega_confirmada')).map(m => ({id:m.providerMessageId, from:db.getContactById(c.contactId)?.email.trim().toLowerCase()})))});
        case 'inbound': worker(data.workerId); return res.json(importCommercialReply(data));
        default: return res.status(404).json({error:'Operación desconocida.'});
      }
    } catch(error:any) { res.status(400).json({error:error.message}); }
  });
}
