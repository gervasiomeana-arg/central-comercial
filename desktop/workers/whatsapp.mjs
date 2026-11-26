import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import qrcode from 'qrcode-terminal';
import wwebjs from 'whatsapp-web.js';
import {sendWhatsAppTest} from './transports.mjs';
import {commercialWhatsAppRunner,ownerReportSchedule,ownerInstantReport,sendToChatWithAck,whatsappStartupFailure,useWhatsAppSessionPolling} from './commercial.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const config=process.env.CENTRAL_CONFIG_FILE||path.join(directory,'.env');
if(!fs.existsSync(config))throw new Error('Seleccione la carpeta donde ya funciona INICIAR_CORREO.bat.');
dotenv.config({path:config,quiet:true});
const origin=new URL(process.env.CENTRAL_URL||'https://central-comercial.ai.studio');
if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw new Error('La conexion requiere HTTPS o servidor local.');
const key=process.env.CHANNEL_TEST_WORKER_KEY||'';
if(key.length<32)throw new Error('La carpeta seleccionada no tiene la clave de enlace del correo configurada.');
const stateDir=path.join(directory,'private-state');fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
const idFile=path.join(stateDir,'worker-id');
const workerId=fs.existsSync(idFile)?fs.readFileSync(idFile,'utf8').trim():crypto.randomUUID();
fs.writeFileSync(idFile,workerId,{mode:0o600});
const journalFile=path.join(stateDir,'outbox.json');
const journal=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,'utf8')):{};
const save=()=>{fs.writeFileSync(journalFile+'.tmp',JSON.stringify(journal),{mode:0o600});fs.renameSync(journalFile+'.tmp',journalFile);};
const canonicalPhone=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.startsWith('549')?'54'+digits.slice(3):digits;};
let whatsappReady=false,running=false,stopping=false,verified=false,signaling=false;
let linkedAccount='', linkedWid='', connectedToCentral=false;
const authTimeoutMs=90000;
let phase, startupTimeout;
function reportPhase(next) {
 if(phase===next)return;
 phase=next;
 process.send?.({type:'whatsapp_status',status:next});
}
function waitForSession() {
 clearTimeout(startupTimeout);
 startupTimeout=setTimeout(()=>{
  reportPhase('session_timeout');
  console.log('[whatsapp] WhatsApp no terminó de iniciar. Se reintenta con el mismo perfil vinculado.');
  void recover(75);
 },2*authTimeoutMs+60000);
}
async function api(action,body={},area='channel-tests'){
 const response=await fetch(new URL(`/api/${area}/worker/${action}`,origin),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({workerId,...body}),signal:AbortSignal.timeout(20000),redirect:'error'})
   .catch(error => { throw new Error(`No se pudo consultar ${area}/${action}: ${error.message}`); });
 if(!response.ok){const error=new Error(`Central Comercial respondió HTTP ${response.status} en ${area}/${action}`);error.httpStatus=response.status;throw error;}
 return response.json();
}
const {Client,LocalAuth}=wwebjs;
const visibleBrowser=process.platform==='win32'&&process.env.CENTRAL_WHATSAPP_VISIBLE==='true';
const observedPages=new WeakSet();
class SessionClient extends Client {
 async inject(){
  const page=this.pupPage;
  if(page&&!observedPages.has(page)){
   useWhatsAppSessionPolling(page);
   observedPages.add(page);
  }
  return super.inject();
 }
}
const client=new SessionClient({
 authStrategy:new LocalAuth({dataPath:path.join(stateDir,'whatsapp')}),
 authTimeoutMs,
 userAgent:false,
 webVersionCache:{type:'none'},
 puppeteer:{
  headless:!visibleBrowser,
  ...(process.platform==='win32'?{pipe:true}:{}),
  ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),
 },
});
const ownerReportFile=path.join(stateDir,'owner-reports.json');
const ownerReports=fs.existsSync(ownerReportFile)?JSON.parse(fs.readFileSync(ownerReportFile,'utf8')):{};
const saveOwnerReports=()=>{const tmp=ownerReportFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(ownerReports),{mode:0o600});fs.renameSync(tmp,ownerReportFile);};
client.on('message_ack', (message, ack) => {
 if (ack < 2 || !message?.id?._serialized) return;
 const report = Object.values(ownerReports).find(entry => entry.providerId === message.id._serialized);
 if (report?.status !== 'aceptado_proveedor') return;
 report.status = 'entrega_confirmada';
 saveOwnerReports();
});
async function ownerReportTick(account){
 if(!whatsappReady||process.env.CENTRAL_DIAGNOSTIC_MODE==='true')return;
 const now = new Date();
 const task = ownerInstantReport(stateDir, ownerReports, now) ||
  ownerReportSchedule(ownerReports, now, process.env.CENTRAL_WHATSAPP_REPORT_DAY);
 if (!task) return;
 const {day,key,manual} = task;
 const owner = client.info?.wid;
 if (linkedAccount !== account || owner?._serialized !== linkedWid ||
     !/^\d+@(?:c\.us|lid)$/.test(owner?._serialized || '')) {
  console.log('WhatsApp no confirmó el identificador del chat personal. El informe queda pendiente.');
  return;
 }
 const report=await api('owner-report',{day},'commercial-whatsapp');
 // Reserve before sending; never duplicate an uncertain WhatsApp delivery.
 ownerReports[key]={status:'resultado_desconocido',manual,at:new Date().toISOString()};saveOwnerReports();
 try{
  const content = key.startsWith('instant-') ? report.content.replace('INFORME DIARIO','INFORME AL MOMENTO') : report.content;
  const result=await sendToChatWithAck(client,owner._serialized,content,async()=>{},60000);
  ownerReports[key]={status:result.ack>=2?'entrega_confirmada':result.outcome==='accepted'?'aceptado_proveedor':result.outcome==='rejected'?'rechazado':'resultado_desconocido',manual,at:new Date().toISOString(),providerId:result.providerId||''};
 }catch(error){ownerReports[key]={status:'resultado_desconocido',manual,at:new Date().toISOString(),error:String(error.code||error.message).slice(0,100)};}
 saveOwnerReports();console.log('Informe WhatsApp '+day+': '+ownerReports[key].status);
}
const commercial=commercialWhatsAppRunner({client,stateDir,call:(action,data={})=>api(action,data,'commercial-whatsapp')});
client.on('qr',qr=>{
 clearTimeout(startupTimeout);
 reportPhase('qr');
 console.log('Vinculá el navegador de Central desde WhatsApp > Dispositivos vinculados.');
 console.log('Escanee este QR. No lo comparta por chat.');
 qrcode.generate(qr,{small:true});
});
client.on('authenticated',()=>{
 if(whatsappReady||stopping)return;
 reportPhase('loading');
 waitForSession();
});
client.on('ready',()=>{
 clearTimeout(startupTimeout);
 whatsappReady=true;
 reportPhase('verifying');
 void heartbeat();
});
client.on('auth_failure',()=>{
 reportPhase('auth_failed');
 console.log('WhatsApp requiere volver a vincular el dispositivo.');
 void recover(78);
});
client.on('disconnected',reason=>{console.log('WhatsApp desconectado. Se conserva la sesión para recuperarla.');void recover(String(reason).toUpperCase()==='LOGOUT'?78:75);});

async function resolveAccount(wid){
 const direct=String(wid||'').match(/^(\d+)@c\.us$/);
 if(direct)return direct[1];
 if(!/^\d+@lid$/.test(wid||'')||typeof client.getContactLidAndPhone!=='function')return '';
 let timer;
 try{
  const records=await Promise.race([
   client.getContactLidAndPhone([wid]),
   new Promise(resolve=>{timer=setTimeout(()=>resolve([]),8000);}),
  ]);
  return String(records?.[0]?.pn||'').match(/^(\d+)(?:@(?:c\.us|s\.whatsapp\.net))?$/)?.[1]||'';
 }finally{clearTimeout(timer);}
}

async function heartbeat(){
 if(signaling||stopping)return;
 signaling=true;
 try{
  const identity=client.info?.wid;
  const wid=identity?._serialized || (identity?.user && identity?.server ? identity.user+'@'+identity.server : '');
  if(whatsappReady&&(wid!==linkedWid||!linkedAccount)){
   linkedAccount=await resolveAccount(wid);
   linkedWid=wid;
  }
  if(stopping)return;
  const ready=whatsappReady&&Boolean(linkedAccount);
  await api('heartbeat',{ready,account:linkedAccount},'commercial-whatsapp');
  if(stopping)return;
  connectedToCentral=ready;
  if(whatsappReady)reportPhase(ready?'connected':'verifying');
  if(whatsappReady&&!ready)console.log('WhatsApp Web está vinculado; esperando que confirme el número de la cuenta.');
  if(ready&&!verified){
   verified=true;
   process.send?.({type:'healthy'});
   console.log('WhatsApp personal vinculado a Central Comercial.');
  }
  await api('heartbeat',{email:false,whatsapp:ready}).catch(error => console.log(`Verificación de canales pendiente: ${error.message}`));
 }catch(error){
  connectedToCentral=false;
  if(whatsappReady)reportPhase('server_rejected');
  console.log(error.httpStatus===401?'Central rechazó la clave de enlace compartida con el correo.':
   error.httpStatus===409?'Central no confirmó la cuenta vinculada o detectó otro ejecutor de WhatsApp.':
   `Conexión de WhatsApp pendiente: ${error.message}`);
 }finally{signaling=false;}
 if(connectedToCentral)void tick();
}

async function tick(){
 if(running||stopping||!connectedToCentral)return;
 running=true;
 const account=linkedAccount;
 try{
  await commercial.tick().catch(error => console.log(`Cola comercial WhatsApp pendiente: ${error.message}`));
  await ownerReportTick(account).catch(error => console.log(`Informe personal pendiente: ${error.message}`));
  for(const entry of Object.values(journal))if(entry.result&&!entry.reported){try{await api('complete',{id:entry.id,lease:entry.lease,result:entry.result});entry.reported=true;save();}catch(error){if(error.httpStatus===409){entry.reported=true;save();}else throw error;}}
  const {job}=await api('claim');if(!job)return;
  if(job.channel!=='whatsapp'||canonicalPhone(job.recipient)!==canonicalPhone(account))throw new Error('Solo se permiten comprobaciones al numero personal del propietario.');
  if(journal[job.id]){const previous=journal[job.id];await api('complete',{id:job.id,lease:job.lease,result:previous.result});previous.reported=true;save();return;}
  const entry=journal[job.id]={id:job.id,lease:job.lease,result:{state:'resultado_desconocido',evidence:'Intento iniciado; ante una interrupcion no se reenvia automaticamente.'}};save();
  try{entry.result=await sendWhatsAppTest(client,job);}catch{entry.result={state:'resultado_desconocido',evidence:'WhatsApp no confirmo el resultado. Revisar antes de reenviar.'};}
  save();await api('complete',{id:entry.id,lease:entry.lease,result:entry.result});entry.reported=true;save();
 }catch(error){console.log(error.httpStatus===401?'El servidor rechazo la clave de enlace. Revise la configuracion compartida con el correo.':`Conexion pendiente: ${error.message||'revise Internet'}`);}
 finally{running=false;}
}
console.log(visibleBrowser
 ? '[whatsapp] Abriendo el navegador de Central en una ventana visible con el mismo perfil.'
 : '[whatsapp] Preparando WhatsApp dentro del inicio único de Central Comercial.');
reportPhase('starting');
const timer=setInterval(()=>void heartbeat(),20000);
async function recover(code){
 if(stopping)return;
 stopping=true;
 whatsappReady=false;
 clearInterval(timer);
 clearTimeout(startupTimeout);
 if(code===78)reportPhase('auth_failed');
 await Promise.allSettled([
  api('heartbeat',{ready:false,account:''},'commercial-whatsapp'),
  api('heartbeat',{email:false,whatsapp:false})
 ]);
 await Promise.race([client.destroy().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,5000))]);
 process.exit(code);
}
if(process.send)process.on('disconnect',()=>void recover(75));
process.on('SIGINT',()=>void recover(0));
process.on('SIGTERM',()=>void recover(0));
void heartbeat();
waitForSession();
try{await client.initialize();}
catch(error){
 if(!stopping){
  const failure=whatsappStartupFailure(error);
  reportPhase(failure);
  // This console is local. Never add provider exceptions to the web heartbeat.
  console.error('[whatsapp] No se pudo iniciar el navegador de WhatsApp ('+failure+').', error?.message || (typeof error === 'string' ? error : error?.name) || 'Sin detalle del navegador.');
 }
 await recover(75);
}
