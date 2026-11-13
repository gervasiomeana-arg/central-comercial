import 'dotenv/config';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeJournal, reserveMessage, finishMessage } from './journal.mjs';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const env=process.env, base=new URL(env.CENTRAL_URL || 'http://localhost:3000');
if(base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname))) throw new Error('Usar HTTPS o servidor local.');
if((env.CHANNEL_TEST_WORKER_KEY||'').length<32 || !env.EMAIL_ADDRESS || !env.SMTP_PASSWORD || !env.IMAP_PASSWORD) throw new Error('Completar .env con correo y conexiones SMTP/IMAP. No se envió ningún mensaje.');
const stateFile=new URL('./email-state.json',import.meta.url);
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{workerId:randomUUID(),outcomes:{},uid:0,validity:''};
initializeJournal(state);
const save=()=>{const temporary=new URL('./email-state.tmp',import.meta.url);const fd=fs.openSync(temporary,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,stateFile);};save();
const api=async(action,data={})=>{const response=await fetch(new URL(`/api/commercial-email/worker/${action}`,base),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.CHANNEL_TEST_WORKER_KEY}`},body:JSON.stringify({workerId:state.workerId,...data}),signal:AbortSignal.timeout(15000)});if(!response.ok){const error=new Error(`Central Comercial rechazó ${action}: ${response.status}`);error.status=response.status;throw error;}return response.json();};
const smtp=nodemailer.createTransport({host:env.SMTP_HOST||'smtp.gmail.com',port:Number(env.SMTP_PORT||465),secure:env.SMTP_SECURE!=='false',requireTLS:true,auth:{user:env.SMTP_USER||env.EMAIL_ADDRESS,pass:env.SMTP_PASSWORD},connectionTimeout:15000,socketTimeout:30000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
let imap, nextConnection=0, attempts=0, reconnect=true, authBlocked=false;
const createMailbox=()=>{
 const client=new ImapFlow({host:env.IMAP_HOST||'imap.gmail.com',port:Number(env.IMAP_PORT||993),secure:true,auth:{user:env.IMAP_USER||env.EMAIL_ADDRESS,pass:env.IMAP_PASSWORD},logger:false,socketTimeout:30000,connectionTimeout:15000,greetingTimeout:15000});
 client.on('error',()=>{if(imap===client)reconnect=true;});client.on('close',()=>{if(imap===client)reconnect=true;});return client;
};
async function connect(){
 if(authBlocked||Date.now()<nextConnection)return false;
 if(imap?.usable&&!reconnect)return true;
 try{
  imap?.close();imap=createMailbox();reconnect=false;
  await smtp.verify();await imap.connect();await imap.mailboxOpen('INBOX');attempts=0;nextConnection=0;
  console.log('Correo reconectado. Se revisa el registro antes de continuar.');return true;
 }catch(error){
  reconnect=true;imap?.close();attempts++;
  authBlocked=error.authenticationFailed===true||[534,535].includes(error.responseCode);
  nextConnection=Date.now()+Math.min(300000,5000*2**Math.min(attempts-1,6));
  if(authBlocked){console.error('Gmail requiere revisar la autorización. No se intentará adivinar ni cambiar la clave.');process.send?.({type:'attention',code:'email_auth'});setTimeout(()=>process.exit(78),1000);}
  else console.error('Conexión de correo interrumpida. Se reintentará automáticamente.');
  await api('heartbeat',{send:false,read:false,sender:env.EMAIL_ADDRESS}).catch(()=>{});return false;
 }
}
const heartbeat=()=>api('heartbeat',{send:!reconnect&&Boolean(imap?.usable),read:!reconnect&&Boolean(imap?.usable),sender:env.EMAIL_ADDRESS});
async function flush(){for(const [key,result] of Object.entries(state.outcomes)){try{await api('complete',result);}catch(error){if(error.status!==409)throw error;console.error('Resultado conservado localmente; el servidor exige revisar una asignación anterior. No se repite el envío.');}delete state.outcomes[key];save();}}
async function send(){
  const {job}=await api('claim');if(!job)return;
  // Persist before SMTP. A crash here becomes an unknown result, never an automatic resend.
  const {shouldSend,result}=reserveMessage(state,job);save();if(!shouldSend){await flush();return;}
  try{
    const receipt=await smtp.sendMail({from:env.EMAIL_ADDRESS,to:job.recipient,subject:job.subject,text:job.content,messageId:job.providerMessageId,inReplyTo:job.inReplyTo,references:job.inReplyTo?[job.inReplyTo]:undefined,headers:{'X-Central-Comercial-Id':job.messageId},disableFileAccess:true,disableUrlAccess:true});
    result.outcome=receipt.accepted?.some(a=>String(a).toLowerCase()===job.recipient.toLowerCase())?'accepted':'rejected';result.response=String(receipt.response||'Sin respuesta SMTP');
  }catch(error){result.outcome=error.responseCode>=500?'rejected':'unknown';result.response=String(error.response||error.code||'Resultado SMTP desconocido');if([534,535].includes(error.responseCode)){authBlocked=true;reconnect=true;process.send?.({type:'attention',code:'email_auth'});setTimeout(()=>process.exit(78),2000);}}
  finishMessage(state,job,result);save();await flush();
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
let processing=false;async function tick(){if(processing)return;processing=true;try{if(!await connect())return;await heartbeat();await flush();await read();await send();process.send?.({type:'healthy'});}catch(error){console.error(new Date().toISOString(),error.message);if(!imap?.usable)reconnect=true;}finally{processing=false;}}
const stop=()=>{imap?.close();smtp.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
if(process.send)process.on('disconnect',stop);
await tick();setInterval(()=>void tick(),20000);
