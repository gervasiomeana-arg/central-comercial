import 'dotenv/config';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const env=process.env, base=new URL(env.CENTRAL_URL || 'http://localhost:3000');
if(base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname))) throw new Error('Usar HTTPS o servidor local.');
if((env.CHANNEL_TEST_WORKER_KEY||'').length<32 || !env.EMAIL_ADDRESS || !env.SMTP_PASSWORD || !env.IMAP_PASSWORD) throw new Error('Completar .env con correo y conexiones SMTP/IMAP. No se envió ningún mensaje.');
const stateFile=new URL('./email-state.json',import.meta.url);
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{workerId:randomUUID(),outcomes:{},uid:0,validity:''};
const save=()=>{const temporary=new URL('./email-state.tmp',import.meta.url);fs.writeFileSync(temporary,JSON.stringify(state),{mode:0o600});fs.renameSync(temporary,stateFile);};save();
const api=async(action,data={})=>{const response=await fetch(new URL(`/api/commercial-email/worker/${action}`,base),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.CHANNEL_TEST_WORKER_KEY}`},body:JSON.stringify({workerId:state.workerId,...data}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`Central Comercial rechazó ${action}: ${response.status}`);return response.json();};
const smtp=nodemailer.createTransport({host:env.SMTP_HOST||'smtp.gmail.com',port:Number(env.SMTP_PORT||465),secure:env.SMTP_SECURE!=='false',requireTLS:true,auth:{user:env.SMTP_USER||env.EMAIL_ADDRESS,pass:env.SMTP_PASSWORD},connectionTimeout:15000,socketTimeout:30000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
const imap=new ImapFlow({host:env.IMAP_HOST||'imap.gmail.com',port:Number(env.IMAP_PORT||993),secure:true,auth:{user:env.IMAP_USER||env.EMAIL_ADDRESS,pass:env.IMAP_PASSWORD},logger:false,socketTimeout:30000});
await smtp.verify();await imap.connect();await imap.mailboxOpen('INBOX');
const heartbeat=()=>api('heartbeat',{send:true,read:imap.usable,sender:env.EMAIL_ADDRESS});await heartbeat();
console.log('Central Comercial: ejecutor de correo conectado. WhatsApp no se inicia.');
async function flush(){for(const [key,result] of Object.entries(state.outcomes)){await api('complete',result);delete state.outcomes[key];save();}}
async function send(){
  const {job}=await api('claim');if(!job)return;
  // Persist before SMTP. A crash here becomes an unknown result, never an automatic resend.
  const result={...job,workerId:state.workerId,outcome:'unknown',response:'Proceso interrumpido: comprobar correo enviado antes de cualquier reintento.'};state.outcomes[job.messageId]=result;save();
  try{
    const receipt=await smtp.sendMail({from:env.EMAIL_ADDRESS,to:job.recipient,subject:job.subject,text:job.content,messageId:job.providerMessageId,inReplyTo:job.inReplyTo,references:job.inReplyTo?[job.inReplyTo]:undefined,headers:{'X-Central-Comercial-Id':job.messageId},disableFileAccess:true,disableUrlAccess:true});
    result.outcome=receipt.accepted?.some(a=>String(a).toLowerCase()===job.recipient.toLowerCase())?'accepted':'rejected';result.response=String(receipt.response||'Sin respuesta SMTP');
  }catch(error){result.outcome=error.responseCode>=500?'rejected':'unknown';result.response=String(error.response||error.code||'Resultado SMTP desconocido');}
  state.outcomes[job.messageId]=result;save();await flush();
}
async function read(){
  const {threads}=await api('routing');if(!threads.length)return;await imap.noop();
  const validity=String(imap.mailbox.uidValidity);if(state.validity!==validity){state.validity=validity;state.uid=Math.max(0,Number(imap.mailbox.uidNext)-51);save();}
  const upper=Number(imap.mailbox.uidNext)-1;if(upper<=state.uid)return;
  const pending=[];
  // Collect first. Never run another IMAP command inside the fetch iterator.
  for await(const message of imap.fetch(`${state.uid+1}:${upper}`,{uid:true,headers:['message-id','in-reply-to','references','auto-submitted'],envelope:true,size:true},{uid:true})){
    const headers=message.headers?.toString('utf8')||'', from=message.envelope?.from?.[0]?.address?.toLowerCase();
    const refs=headers.match(/<[^<>\r\n]+>/g)||[];
    const automatic=/auto-submitted:\s*(?!no\b)/i.test(headers);
    if(!automatic&&message.size<=1000000&&threads.some(t=>t.from===from&&refs.includes(t.id)))pending.push({uid:message.uid,from,refs});
  }
  for(const entry of pending){const message=await imap.fetchOne(entry.uid,{source:true},{uid:true});if(!message?.source)throw new Error('No se pudo leer una respuesta vinculada.');const mail=await simpleParser(message.source,{skipHtmlToText:true,skipTextToHtml:true});if(mail.messageId&&mail.text?.trim())await api('inbound',{from:entry.from,messageId:mail.messageId,references:entry.refs,text:mail.text.slice(0,30000),automatic:false});}
  state.uid=upper;save();
}
let processing=false;async function tick(){if(processing)return;processing=true;try{if(!imap.usable)throw new Error('Buzón desconectado. Reiniciar el ejecutor para reconectar.');await heartbeat();await flush();await read();await send();}catch(error){console.error(new Date().toISOString(),error.message);}finally{processing=false;}}
await tick();setInterval(()=>void tick(),20000);
process.on('SIGINT',async()=>{await imap.logout().catch(()=>{});smtp.close();process.exit(0);});
