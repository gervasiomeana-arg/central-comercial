import { volleyballRecipientAllowed } from './volleyball-outreach.js';
import { accountingDay } from '../src/ledger.js';
import { isAutomaticNotice } from '../src/email-policy.js';
import { campaignCountryAllowed } from './campaign-markets.js';
import {campaignStrategyReady, orderCommercialConversations, unlimitedCampaignOutreach, unlimitedDirectorOutreach,dailyOutreachKeys,outreachKey} from './sales-director.js';
import {randomUUID,createHash} from 'node:crypto';
import type {Express} from 'express';
import {db} from './db.js';
import {workerAuthorized,TEST_RECIPIENTS} from './channelTests.js';
import {campaignWhatsAppPaused,whatsappCampaignEligible,whatsappPhone} from '../src/whatsapp-policy.js';
import {replyDecision,currentReplyText,dailyCommercialDigest} from './commercial-email.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const canonical=(s:string)=>whatsappPhone(s).replace(/^549/,'54');
let active:{id:string;at:number;ready:boolean}|undefined;
export function whatsappStatus(){return {online:Boolean(active&&Date.now()-active.at<90000),ready:Boolean(active?.ready&&Date.now()-active.at<90000)};}
function worker(id:string){if(!whatsappStatus().ready||active?.id!==id)throw new Error('WhatsApp no está vinculado al ejecutor actual.');}
export function whatsappHeartbeat(id:string,ready:boolean,account:string){
 if(typeof id!=='string'||!id||id.length>100||ready&&canonical(account)!==canonical(TEST_RECIPIENTS.whatsapp))throw new Error('La cuenta de WhatsApp no coincide con la del propietario.');
 if(active&&Date.now()-active.at<90000&&active.id!==id)throw new Error('Ya hay otro ejecutor WhatsApp activo.');active={id,at:Date.now(),ready};
}
const whatsappDailyLimit = 10;
const whatsappRotation = ['open-voley', 'neuroplaneta', 'visibility-ai', 'funeraria'];
const whatsappStart = Date.parse('2026-11-26');
export function whatsappAppForDay(now: Date) {
 const offset = (Date.parse(accountingDay(now)) - whatsappStart) / 86400000;
 return offset >= 0 ? whatsappRotation[offset % whatsappRotation.length] : undefined;
}

export function whatsappDispatchApp(now: Date) {
 if (!whatsappStatus().ready) return undefined;
 const scheduledApp = whatsappAppForDay(now);
 if (!scheduledApp) return undefined;
 const dayForRotation = accountingDay(now);
 const attemptedThreads = db.getConversations().flatMap(thread => thread.messages.filter(message =>
  message.channel === 'whatsapp' && message.direction === 'outbound' && message.attemptedAt &&
  Number.isFinite(Date.parse(message.attemptedAt)) && accountingDay(new Date(message.attemptedAt)) === dayForRotation).map(() => thread));
 if (attemptedThreads.length >= whatsappDailyLimit ||
     attemptedThreads.some(thread => db.getApplicationById(thread.appId)?.slug !== scheduledApp)) return undefined;
 return scheduledApp;
}

export function claimWhatsApp(id:string,now=new Date()){
 worker(id);const report=db.getSalesGoalProgress();if(report.paused||!report.goal.enabled)return null;
 const threads = db.getConversations().filter(c => c.channel === 'whatsapp');
 if (!threads.length) return null;
 const expired = threads.flatMap(c => c.messages).filter(m => m.channel === 'whatsapp' && m.status === 'envio_intentado' && (m.sendDeadline || 0) < now.getTime());
 for (const m of expired) {
  m.status = 'resultado_desconocido';
  m.serviceError = 'Sin confirmación: no se reenvía automáticamente.';
 }
 if (expired.length) db.save();
 const candidates = threads.filter(c => c.messages.some(m => m.direction === 'outbound' && m.channel === 'whatsapp' &&
   m.status === 'preparado' && !m.replacementMessageId && m.reviewStatus !== 'rejected' && !m.attemptedAt));
 if (!candidates.length) return null;
 const history = db.getConversations();
 const scheduledApp = whatsappDispatchApp(now);
 if (!scheduledApp) return null;
 const directorUnlimited=unlimitedDirectorOutreach(report.goal);
 const conversations = report.goal.directorEnabled ? orderCommercialConversations(candidates,now,history) : candidates;
 const pilotIds = new Set(db.getCampaigns().filter(c => c.funeralShiftPilot).map(c => c.id));
 conversations.sort((a, b) => Number(pilotIds.has(b.campaignId || '')) - Number(pilotIds.has(a.campaignId || '')));
 for(const conv of conversations){
  const contact=db.getContactById(conv.contactId),app=db.getApplicationById(conv.appId),campaign=conv.campaignId?db.getCampaignById(conv.campaignId):undefined;
  if(!contact||!app||app.slug!==scheduledApp||app.status!=='lista'||!app.campaignsAllowed||!whatsappCampaignEligible(contact,now))continue;
  for(const msg of conv.messages){
   if(msg.direction!=='outbound'||msg.channel!=='whatsapp'||msg.status!=='preparado'||msg.replacementMessageId||msg.reviewStatus==='rejected'||msg.attemptedAt)continue;
   const reply=Boolean(msg.replyToProviderId);
   if (campaignWhatsAppPaused && (conv.campaignId || !reply)) continue;
   if(reply){if(!report.goal.answerEmail||msg.reviewStatus!=='approved')continue;}
   else{
    if (!volleyballRecipientAllowed(app, contact) || contact.status === 'cliente' || !campaignCountryAllowed(app, contact.country)) continue;
    const reviewedAt = Date.parse(contact.sourceReviewDate);
    if (!contact.source?.trim() || !Number.isFinite(reviewedAt) || reviewedAt > now.getTime()) continue;
    if(!report.remaining||!campaign?.autoSendWhatsApp||!campaign.channels.includes('whatsapp')||!db.campaignInActiveRun(campaign.id)||!campaignStrategyReady(campaign,db.getApplicationById(campaign.appId))||!['lista','activa','bloqueada_por_configuracion'].includes(campaign.status)||conv.messages.some(m=>m.direction==='inbound'))continue;
    if(campaign.goalMonth&&(campaign.goalMonth!==report.goal.month||!report.goal.countries.includes(campaign.country)))continue;
    if(campaign.mode!=='automatico'&&msg.reviewStatus!=='approved')continue;
    const unlimited=directorUnlimited&&unlimitedCampaignOutreach(campaign);
    if(!unlimited&&campaign.dailyLimit<1)continue;
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:campaign.timezone}).format(now),time=new Intl.DateTimeFormat('en-GB',{timeZone:campaign.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
    if(day<campaign.startDate||day>campaign.endDate||(!unlimited&&(time<campaign.sendWindowStart||time>=campaign.sendWindowEnd)))continue;
    if (campaign.maxContacts !== undefined) {
      const attemptedContacts = new Set(history.filter(c => c.campaignId === campaign.id &&
        c.messages.some(m => m.direction === 'outbound' && !m.replyToProviderId && m.attemptedAt)).map(c => c.contactId));
      if (!attemptedContacts.has(conv.contactId) && attemptedContacts.size >= campaign.maxContacts) continue;
    }
    if (!unlimited) {
      const sentToday = dailyOutreachKeys(history, now, campaign.id);
      if (sentToday.size >= campaign.dailyLimit && !sentToday.has(outreachKey(conv, msg))) continue;
    }
   }
   if(!reply&&db.getTasks().some(t=>t.relatedId===conv.id&&t.status==='pendiente'))continue;
   const recipient=whatsappPhone(contact.phone);if(msg.approvedRecipient&&msg.approvedRecipient!==recipient)continue;
   const lease=randomUUID();Object.assign(msg,{sendLease:hash(lease),sendWorker:id,sendDeadline:now.getTime()+120000,status:'envio_intentado',attemptedAt:now.toISOString(),approvedRecipient:recipient});db.save();
   return {conversationId:conv.id,messageId:msg.id,lease,recipient,content:msg.content};
  }
 }
 return null;
}
export function completeWhatsApp(input:any){
 const conv=db.getConversationById(input.conversationId),msg=conv?.messages.find(m=>m.id===input.messageId);
 if(!conv||!msg||msg.channel!=='whatsapp'||typeof input.lease!=='string'||msg.sendLease!==hash(input.lease)||msg.sendWorker!==input.workerId)throw new Error('Intento WhatsApp no válido.');
 if(['aceptado_proveedor','fallido','resultado_desconocido'].includes(msg.status)&&msg.providerEvidence)return {success:true};
 if(!['envio_intentado','resultado_desconocido'].includes(msg.status))throw new Error('El intento ya terminó.');
 const accepted=input.outcome==='accepted'&&Number.isInteger(input.ack)&&input.ack>=1&&typeof input.providerId==='string'&&input.providerId.trim().length>0&&input.providerId.length<500&&typeof input.chatId==='string'&&/^[\w.-]+@(?:c\.us|lid)$/.test(input.chatId);
 const rejected=input.outcome==='rejected';
 msg.status=accepted?'aceptado_proveedor':rejected?'fallido':'resultado_desconocido';
 msg.providerEvidence=accepted?'WhatsApp confirmó recepción por su servidor (ACK >= 1). No confirma lectura.':
  rejected?'WhatsApp rechazó el envío o el número no tiene cuenta registrada.':'No hubo confirmación de aceptación; no se repite automáticamente.';
 if(typeof input.chatId==='string'&&/^[\w.-]+@(?:c\.us|lid)$/.test(input.chatId))msg.providerChatId=input.chatId;
 const campaign = conv.campaignId ? db.getCampaignById(conv.campaignId) : undefined;
 if (accepted) {
  msg.providerMessageId = msg.serviceConfirmationId = input.providerId;
  msg.acceptedAt = new Date().toISOString();
  const contact = db.getContactById(conv.contactId);
  if (contact?.status === 'prospecto') contact.status = 'contactado';
  if (campaign) campaign.stats.messagesSent++;
 } else if (rejected && campaign) {
  campaign.stats.messagesFailed++;
 }
 db.save();return {success:true};
}
export function whatsappRouting(){return db.getConversations().filter(c=>c.channel==='whatsapp').flatMap(c=>c.messages.filter(m=>m.direction==='outbound'&&['aceptado_proveedor','resultado_desconocido'].includes(m.status)&&m.providerChatId).map(m=>({chatId:m.providerChatId!,conversationId:c.id})));}
export function importWhatsAppReply(input:any){
 if(typeof input.providerId!=='string'||!input.providerId.trim()||input.providerId.length>500||typeof input.text!=='string'||!input.text.trim()||input.text.length>30000)throw new Error('Respuesta WhatsApp no válida.');
 const routes=whatsappRouting().filter(r=>r.chatId===input.chatId),ids=[...new Set(routes.map(r=>r.conversationId))];
 if(ids.length!==1)throw new Error('El chat no corresponde a una única conversación comercial registrada.');
 if(db.getConversations().some(c=>c.messages.some(m=>m.providerMessageId===input.providerId)))return {success:true,duplicate:true};
 const conv=db.getConversationById(ids[0])!,contact=db.getContactById(conv.contactId)!,app=db.getApplicationById(conv.appId)!;
 const text=currentReplyText(input.text);db.addMessageToConversation(conv.id,{conversationId:conv.id,direction:'inbound',channel:'whatsapp',content:text,providerMessageId:input.providerId,status:'respuesta_recibida'});
 if (isAutomaticNotice(text)) return { success:true, decision:'automatic_notice' };
 const decision=replyDecision(text,app,contact.country);
 if(decision.kind==='unsubscribe'){for(const c of db.getContacts().filter(c=>whatsappPhone(c.phone)===whatsappPhone(contact.phone))){c.permission='revocado';c.status='baja_solicitada';if(c.whatsappConsent)c.whatsappConsent.granted=false;}conv.requiresHumanIntervention=false;}
 else if(decision.kind==='answer'&&db.getMonthlyGoal().answerEmail&&!db.getTasks().some(t=>t.relatedId===conv.id&&t.status==='pendiente')){conv.requiresHumanIntervention=false;conv.messages.push({id:randomUUID(),conversationId:conv.id,direction:'outbound',channel:'whatsapp',content:decision.text,replyToProviderId:input.providerId,status:'preparado',reviewStatus:'approved',approvedRecipient:whatsappPhone(contact.phone),createdAt:new Date().toISOString()});}
 else{conv.requiresHumanIntervention=true;if(decision.kind==='purchase')db.convertContactToClient(contact.id);db.saveTask({id:'wa-reply-'+hash(input.providerId).slice(0,24),title:`Responder a ${contact.orgName} · WhatsApp`,description:('reason'in decision?decision.reason:undefined)||'Revisar consulta y responder desde la app.',priority:'alta',category:'intervencion_ia',relatedType:'conversacion',relatedId:conv.id,dueDate:null,status:'pendiente',createdAt:new Date().toISOString()});}
 db.save();return {success:true,decision:decision.kind};
}
export function registerCommercialWhatsAppRoutes(app:Express){app.post('/api/commercial-whatsapp/worker/:action',(req,res)=>{
 if(!workerAuthorized(req.headers.authorization))return res.status(401).json({error:'Ejecutor no autorizado.'});
 try{const d=req.body;switch(req.params.action){case'owner-report':{worker(d.workerId);if(!/^\d{4}-\d{2}-\d{2}$/.test(d.day))return res.status(400).json({error:'Fecha inválida'});const report=dailyCommercialDigest(d.day,'');return res.json({content:report.content,day:d.day});}case'heartbeat':whatsappHeartbeat(d.workerId,d.ready===true,d.account||'');return res.json({success:true});case'claim':return res.json({job:claimWhatsApp(d.workerId)});case'complete':return res.json(completeWhatsApp(d));case'routing':worker(d.workerId);return res.json({routes:whatsappRouting()});case'inbound':worker(d.workerId);return res.json(importWhatsAppReply(d));default:return res.status(404).json({error:'Operación desconocida.'});}}catch(error:any){res.status(409).json({error:error.message});}});}
