import {campaignStrategyReady} from './sales-director.js';
import {randomUUID,createHash} from 'node:crypto';
import type {Express} from 'express';
import {db} from './db.js';
import {workerAuthorized,TEST_RECIPIENTS} from './channelTests.js';
import {whatsappAuthorized,whatsappPhone} from '../src/whatsapp-policy.js';
import {replyDecision,currentReplyText} from './commercial-email.js';
import {accountingDay} from '../src/ledger.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const canonical=(s:string)=>whatsappPhone(s).replace(/^549/,'54');
let active:{id:string;at:number;ready:boolean}|undefined;
export function whatsappStatus(){return {online:Boolean(active&&Date.now()-active.at<90000),ready:Boolean(active?.ready&&Date.now()-active.at<90000)};}
function worker(id:string){if(!whatsappStatus().ready||active?.id!==id)throw new Error('WhatsApp no está vinculado al ejecutor actual.');}
export function whatsappHeartbeat(id:string,ready:boolean,account:string){
 if(typeof id!=='string'||!id||id.length>100||ready&&canonical(account)!==canonical(TEST_RECIPIENTS.whatsapp))throw new Error('La cuenta de WhatsApp no coincide con la del propietario.');
 if(active&&Date.now()-active.at<90000&&active.id!==id)throw new Error('Ya hay otro ejecutor WhatsApp activo.');active={id,at:Date.now(),ready};
}
export function claimWhatsApp(id:string,now=new Date()){
 worker(id);const report=db.getSalesGoalReport();if(report.paused||!report.goal.enabled)return null;
 const all=db.getConversations().flatMap(c=>c.messages);
 for(const m of all)if(m.channel==='whatsapp'&&m.status==='envio_intentado'&&(m.sendDeadline||0)<now.getTime()){m.status='resultado_desconocido';m.serviceError='Sin confirmación: no se reenvía automáticamente.';}db.save();
 if(all.filter(m=>m.direction==='outbound'&&m.attemptedAt&&accountingDay(new Date(m.attemptedAt))===accountingDay(now)).length>=report.goal.dailyEmailLimit)return null;
 for(const conv of db.getConversations().filter(c=>c.channel==='whatsapp')){
  const contact=db.getContactById(conv.contactId),app=db.getApplicationById(conv.appId),campaign=conv.campaignId?db.getCampaignById(conv.campaignId):undefined;
  if(!contact||!app||app.status!=='lista'||!app.campaignsAllowed||!whatsappAuthorized(contact,now))continue;
  for(const msg of conv.messages){
   if(msg.direction!=='outbound'||msg.channel!=='whatsapp'||msg.status!=='preparado'||msg.reviewStatus==='rejected'||msg.attemptedAt)continue;
   const reply=Boolean(msg.replyToProviderId);
   if(reply){if(!report.goal.answerEmail||msg.reviewStatus!=='approved')continue;}
   else{
    if(!report.remaining||!campaign?.autoSendWhatsApp||!campaign.channels.includes('whatsapp')||!db.campaignInActiveRun(campaign.id)||!campaignStrategyReady(campaign,db.getApplicationById(campaign.appId))||!['lista','activa','bloqueada_por_configuracion'].includes(campaign.status)||conv.messages.some(m=>m.direction==='inbound'))continue;
    if(campaign.goalMonth&&(campaign.goalMonth!==report.goal.month||!report.goal.countries.includes(campaign.country)))continue;
    if(campaign.mode!=='automatico'&&msg.reviewStatus!=='approved')continue;
    const day=accountingDay(now),time=new Intl.DateTimeFormat('en-GB',{timeZone:campaign.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
    if(day<campaign.startDate||day>campaign.endDate||time<campaign.sendWindowStart||time>=campaign.sendWindowEnd)continue;
    const attempted=db.getConversations().filter(c=>c.campaignId===campaign.id).flatMap(c=>c.messages).filter(m=>m.direction==='outbound'&&!m.replyToProviderId&&m.attemptedAt);
    if(campaign.maxContacts!==undefined&&attempted.length>=campaign.maxContacts||attempted.filter(m=>accountingDay(new Date(m.attemptedAt!))===day).length>=campaign.dailyLimit)continue;
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
 msg.status=accepted?'aceptado_proveedor':input.outcome==='rejected'?'fallido':'resultado_desconocido';msg.providerEvidence=accepted?'WhatsApp confirmó recepción por su servidor (ACK >= 1). No confirma lectura.':'No hubo confirmación de aceptación; no se repite automáticamente.';
 if(typeof input.chatId==='string'&&/^[\w.-]+@(?:c\.us|lid)$/.test(input.chatId))msg.providerChatId=input.chatId;
 if(accepted){msg.providerMessageId=input.providerId;msg.serviceConfirmationId=input.providerId;msg.acceptedAt=new Date().toISOString();const contact=db.getContactById(conv.contactId)!;if(contact.status==='prospecto')contact.status='contactado';}
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
 const decision=replyDecision(text,app,contact.country);
 if(decision.kind==='unsubscribe'){for(const c of db.getContacts().filter(c=>whatsappPhone(c.phone)===whatsappPhone(contact.phone))){c.permission='revocado';c.status='baja_solicitada';if(c.whatsappConsent)c.whatsappConsent.granted=false;}conv.requiresHumanIntervention=false;}
 else if(decision.kind==='answer'&&db.getMonthlyGoal().answerEmail&&!db.getTasks().some(t=>t.relatedId===conv.id&&t.status==='pendiente')){conv.requiresHumanIntervention=false;conv.messages.push({id:randomUUID(),conversationId:conv.id,direction:'outbound',channel:'whatsapp',content:decision.text,replyToProviderId:input.providerId,status:'preparado',reviewStatus:'approved',approvedRecipient:whatsappPhone(contact.phone),createdAt:new Date().toISOString()});}
 else{conv.requiresHumanIntervention=true;if(decision.kind==='purchase')db.convertContactToClient(contact.id);db.saveTask({id:'wa-reply-'+hash(input.providerId).slice(0,24),title:`Responder a ${contact.orgName} · WhatsApp`,description:('reason'in decision?decision.reason:undefined)||'Revisar consulta y responder desde la app.',priority:'alta',category:'intervencion_ia',relatedType:'conversacion',relatedId:conv.id,dueDate:null,status:'pendiente',createdAt:new Date().toISOString()});}
 db.save();return {success:true,decision:decision.kind};
}
export function registerCommercialWhatsAppRoutes(app:Express){app.post('/api/commercial-whatsapp/worker/:action',(req,res)=>{
 if(!workerAuthorized(req.headers.authorization))return res.status(401).json({error:'Ejecutor no autorizado.'});
 try{const d=req.body;switch(req.params.action){case'heartbeat':whatsappHeartbeat(d.workerId,d.ready===true,d.account||'');return res.json({success:true});case'claim':return res.json({job:claimWhatsApp(d.workerId)});case'complete':return res.json(completeWhatsApp(d));case'routing':worker(d.workerId);return res.json({routes:whatsappRouting()});case'inbound':worker(d.workerId);return res.json(importWhatsAppReply(d));default:return res.status(404).json({error:'Operación desconocida.'});}}catch(error:any){res.status(409).json({error:error.message});}});}
