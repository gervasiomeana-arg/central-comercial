import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {sendWhatsAppTest} from './transports.mjs';
import {commercialWhatsAppRunner,ownerReportSchedule,ownerInstantReport,sendToChatWithAck,useWhatsAppSessionPolling,whatsappStartupFailure} from './commercial.mjs';

const requireLocal = createRequire(import.meta.url);
const bundled = process.env.CENTRAL_WHATSAPP_MODULE_DIR;
const bundledManifest = bundled && path.join(bundled,'node_modules','whatsapp-web.js','package.json');
const requireWhatsApp = bundledManifest && fs.existsSync(bundledManifest)
 ? createRequire(path.join(bundled,'package.json')) : requireLocal;
const dotenv=requireWhatsApp('dotenv');
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
let whatsappReady=false,running=false,stopping=false,verified=false;
let linkedAccount='', linkedWid='';
const authTimeoutMs=90000;
const refreshWeb=process.env.CENTRAL_WHATSAPP_REFRESH_WEB==='true';
const startupExitCode=()=>sessionAuthenticated?77:linkByPhone||refreshWeb?78:76;
let phase, startupTimeout, initialization, sessionAuthenticated=false;
let notifyBrowserAvailable;
const browserAvailable=new Promise(resolve=>{notifyBrowserAvailable=resolve;});
function reportPhase(next) {
 if(phase===next)return;
 phase=next;
 process.send?.({type:'whatsapp_status',status:next});
}
function waitForSession() {
 clearTimeout(startupTimeout);
 startupTimeout=setTimeout(()=>{
  reportPhase('session_timeout');
  console.log('[whatsapp] WhatsApp no terminó de iniciar con el perfil guardado.');
  void recover(startupExitCode());
 },sessionAuthenticated ? 120000 : 2*authTimeoutMs+60000);
}
async function api(action,body={},area='channel-tests'){
 const response=await fetch(new URL(`/api/${area}/worker/${action}`,origin),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({workerId,...body}),signal:AbortSignal.timeout(20000),redirect:'error'})
   .catch(error => { throw new Error(`No se pudo consultar ${area}/${action}: ${error.message}`); });
 if(!response.ok){const error=new Error(`Central Comercial respondió HTTP ${response.status} en ${area}/${action}`);error.httpStatus=response.status;throw error;}
 return response.json();
}
const {Client,LocalAuth}=requireWhatsApp('whatsapp-web.js');
console.log('[whatsapp] Biblioteca '+requireWhatsApp('whatsapp-web.js/package.json').version);
const pairNumber=process.env.CENTRAL_WHATSAPP_PAIR_NUMBER||'';
const linkByPhone=/^[1-9]\d{9,14}$/.test(pairNumber);
class PersistentSession extends LocalAuth {
 async afterBrowserInitialized(){
  await super.afterBrowserInitialized();
  if(this.client?.pupPage)useWhatsAppSessionPolling(this.client.pupPage);
  this.client?.pupBrowser?.on('targetcreated',target=>{
   if(target.type()==='page')void target.page().then(page=>useWhatsAppSessionPolling(page)).catch(()=>{});
  });
  notifyBrowserAvailable();
 }
 // Keep the local profile even when the provider invalidates its authentication.
 async logout(){}
}
class SessionClient extends Client {
 async inject(){
  useWhatsAppSessionPolling(this.pupPage);
  return super.inject();
 }
}
const client=new SessionClient({
 authStrategy:new PersistentSession({dataPath:path.join(stateDir,'whatsapp')}),
 authTimeoutMs,
 ...(linkByPhone || refreshWeb ? {webVersionCache:{type:'none'}} : {}),
 puppeteer:{
  headless:true, timeout:60000,
  handleSIGINT:false, handleSIGTERM:false, handleSIGHUP:false,
  args:['--disable-blink-features=AutomationControlled','--no-first-run','--no-default-browser-check'],
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
 if (linkedAccount !== account || currentWid() !== linkedWid ||
     !/^\d+@(?:c\.us|lid)$/.test(linkedWid)) {
  console.log('WhatsApp no confirmó el identificador del chat personal. El informe queda pendiente.');
  return;
 }
 const report=await api('owner-report',{day},'commercial-whatsapp');
 // Reserve before sending; never duplicate an uncertain WhatsApp delivery.
 ownerReports[key]={status:'resultado_desconocido',manual,at:new Date().toISOString()};saveOwnerReports();
 try{
  const content = key.startsWith('instant-') ? report.content.replace('INFORME DIARIO','INFORME AL MOMENTO') : report.content;
  const result=await sendToChatWithAck(client,linkedWid,content,async()=>{},60000);
  ownerReports[key]={status:result.ack>=2?'entrega_confirmada':result.outcome==='accepted'?'aceptado_proveedor':result.outcome==='rejected'?'rechazado':'resultado_desconocido',manual,at:new Date().toISOString(),providerId:result.providerId||''};
 }catch(error){ownerReports[key]={status:'resultado_desconocido',manual,at:new Date().toISOString(),error:String(error.code||error.message).slice(0,100)};}
 saveOwnerReports();console.log('Informe WhatsApp '+day+': '+ownerReports[key].status);
}
const commercial=commercialWhatsAppRunner({client,stateDir,call:(action,data={})=>api(action,data,'commercial-whatsapp')});
let pairingRequested=false, lastPairingCode;
function publishPairingCode(code){
 if(!linkByPhone||stopping||sessionAuthenticated||typeof code!=='string'||!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(code))return;
 const normalized=code.replace('-','').toUpperCase();
 if(normalized===lastPairingCode)return;
 lastPairingCode=normalized;
 const formatted=normalized.slice(0,4)+'-'+normalized.slice(4);
 reportPhase('phone_link');
 console.log('[whatsapp] Código para vincular Central con WhatsApp: '+formatted+'. Ingresalo solo en WhatsApp, en tu celular (Dispositivos vinculados > Vincular con el número de teléfono).');
}
function requestPairingWithRetry(attempt=1){
 if(stopping||sessionAuthenticated||whatsappReady||lastPairingCode)return;
 void client.requestPairingCode(pairNumber,true,180000).then(publishPairingCode).catch(error=>{
  if(stopping||sessionAuthenticated||whatsappReady||lastPairingCode)return;
  if(attempt<2){
   console.log('[whatsapp] Reintentando generar el código de vinculación en WhatsApp Web...');
   setTimeout(()=>requestPairingWithRetry(attempt+1),3000);
   return;
  }
  reportPhase('phone_link_failed');
  console.log('[whatsapp] WhatsApp Web no pudo generar el código de vinculación: '+(error?.message || 'sin detalle del navegador'));
  void recover(78);
 });
}
client.on('code',publishPairingCode);
client.on('qr',()=>{
 if(sessionAuthenticated||whatsappReady||stopping)return;
 if(linkByPhone){
  if(phase==='qr'||phase==='phone_link'||pairingRequested)return;
  reportPhase('qr');
  clearTimeout(startupTimeout);
  pairingRequested=true;
  requestPairingWithRetry(1);
  startupTimeout=setTimeout(()=>{
   if(sessionAuthenticated||whatsappReady||stopping)return;
   reportPhase('phone_link_failed');
   console.log('[whatsapp] Se agotó el tiempo de espera del código de vinculación.');
   void recover(78);
  },5*60000);
  return;
 }
 if(!refreshWeb){
  if(phase==='qr')return;
  reportPhase('qr');
  clearTimeout(startupTimeout);
  console.log('[whatsapp] El navegador todavía no reconoce la sesión guardada. Refrescando WhatsApp Web...');
  startupTimeout=setTimeout(()=>{
   if(sessionAuthenticated||whatsappReady||stopping)return;
   void recover(startupExitCode());
  },30000);
  return;
 }
 if(phase!=='pairing_required'){
  reportPhase('pairing_required');
  clearTimeout(startupTimeout);
  console.log('[whatsapp] WhatsApp requiere vinculación. El código se solicita desde Conexiones de Central Comercial.');
 }
});
client.on('authenticated',()=>{
 if(whatsappReady||sessionAuthenticated||stopping)return;
 sessionAuthenticated=true;
 reportPhase('loading');
 waitForSession();
});
client.on('ready',()=>{
 if(stopping||whatsappReady)return;
 clearTimeout(startupTimeout);
 whatsappReady=true;
 reportPhase('verifying');
 void tick();
});
client.on('auth_failure',()=>{
 reportPhase('auth_failed');
 console.log('[whatsapp] WhatsApp rechazó la restauración de la sesión del ejecutor. El perfil queda guardado.');
 void recover(78);
});
client.on('disconnected',reason=>{
 const loggedOut=String(reason).toUpperCase()==='LOGOUT';
 reportPhase(loggedOut?'auth_failed':'restarting');
 console.log('[whatsapp] WhatsApp se desconectó. El perfil queda guardado.');
 void recover(loggedOut?78:75);
});

function currentWid(){
 const identity=client.info?.wid;
 return identity?._serialized || identity?.$1 ||
  (identity?.user && identity?.server ? identity.user+'@'+identity.server : '');
}

async function resolveAccount(wid){
 const phone=identity=>String(identity||'').match(/^(\d{10,15})@(?:c\.us|s\.whatsapp\.net)$/)?.[1]||'';
 const direct=phone(wid);
 if(direct)return direct;
 if(!/^\d+@lid$/.test(wid||''))return '';
 let timer;
 try{
  const local=await Promise.race([
   client.pupPage?.evaluate(()=>{
    const own=window.require('WAWebUserPrefsMeUser').getMaybeMePnUser();
    return own?._serialized || own?.$1 || (own?.user&&own?.server ? own.user+'@'+own.server : '');
   }).catch(()=>''), new Promise(resolve=>{timer=setTimeout(()=>resolve(''),3000);}),
  ]);
  clearTimeout(timer);
  if(phone(local))return phone(local);
  if(typeof client.getContactLidAndPhone!=='function')return '';
  const records=await Promise.race([
   client.getContactLidAndPhone([wid]).catch(()=>[]),
   new Promise(resolve=>{timer=setTimeout(()=>resolve([]),8000);}),
  ]);
  const pn=records?.[0]?.pn;
  return phone(pn)||(/^\d{10,15}$/.test(pn||'') ? pn : '');
 }finally{clearTimeout(timer);}
}

async function tick(){
 if(running||stopping)return;
 running=true;
 let confirmed=false;
 try{
  const wid=currentWid();
  if(whatsappReady&&(wid!==linkedWid||!linkedAccount)){
   linkedAccount=await resolveAccount(wid);
   linkedWid=wid;
  }
  if(stopping)return;
  const account=linkedAccount;
  const ready=whatsappReady&&Boolean(account);
  await api('heartbeat',{ready,account},'commercial-whatsapp');
  if(stopping)return;
  const testReady=await api('heartbeat',{channel:'whatsapp',whatsapp:ready})
   .then(()=>true).catch(()=>false);
  if(stopping)return;
  confirmed=ready;
  if(whatsappReady)reportPhase(ready?'connected':'identity_unavailable');
  if(ready&&!verified){
   verified=true;
   process.send?.({type:'healthy'});
   console.log('WhatsApp personal vinculado a Central Comercial.');
  }
  if(!ready||!whatsappReady)return;
  await ownerReportTick(account).catch(error => console.log(`Informe personal pendiente: ${error.message}`));
  if(stopping||!whatsappReady)return;
  await commercial.tick();
  if(stopping||!whatsappReady)return;
  for(const entry of Object.values(journal))if(entry.result&&!entry.reported){try{await api('complete',{id:entry.id,lease:entry.lease,result:entry.result});entry.reported=true;save();}catch(error){if(error.httpStatus===409){entry.reported=true;save();}else throw error;}}
  if(!testReady)return;
  const {job}=await api('claim',{channel:'whatsapp'});if(!job)return;
  if(job.channel!=='whatsapp'||canonicalPhone(job.recipient)!==canonicalPhone(account))throw new Error('Solo se permiten comprobaciones al numero personal del propietario.');
  if(journal[job.id]){const previous=journal[job.id];await api('complete',{id:job.id,lease:job.lease,result:previous.result});previous.reported=true;save();return;}
  const entry=journal[job.id]={id:job.id,lease:job.lease,result:{state:'resultado_desconocido',evidence:'Intento iniciado; ante una interrupcion no se reenvia automaticamente.'}};save();
  try{entry.result=await sendWhatsAppTest(client,job);}catch{entry.result={state:'resultado_desconocido',evidence:'WhatsApp no confirmo el resultado. Revisar antes de reenviar.'};}
  save();await api('complete',{id:entry.id,lease:entry.lease,result:entry.result});entry.reported=true;save();
 }catch(error){
  if(whatsappReady&&!confirmed)reportPhase('server_rejected');
  console.log(error.httpStatus===401?'Central rechazó la clave de enlace compartida con el correo.':
   error.httpStatus===409&&!confirmed?'Central no confirmó la cuenta vinculada o detectó otro ejecutor de WhatsApp.':
   `Conexión de WhatsApp pendiente: ${error.message || 'revisá Internet'}`);
 }
 finally{running=false;}
}
console.log('[whatsapp] Preparando WhatsApp dentro del inicio único de Central Comercial.');
reportPhase('starting');
const timer=setInterval(()=>void tick(),20000);
async function recover(code){
 if(stopping)return;
 stopping=true;
 if(linkByPhone&&!whatsappReady&&code===75)code=78;
 whatsappReady=false;
 clearInterval(timer);
 clearTimeout(startupTimeout);

 const offline=Promise.allSettled([
  api('heartbeat',{ready:false,account:''},'commercial-whatsapp'),
  api('heartbeat',{channel:'whatsapp',whatsapp:false})
 ]);
 try{
  if(initialization && !client.pupBrowser)await Promise.race([browserAvailable,initialization.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,15000))]);
  await client.destroy();
 }catch{
  console.log('[whatsapp] El navegador no confirmó el cierre del perfil.');
 }
 await Promise.race([offline,new Promise(resolve=>setTimeout(resolve,2000))]);
 process.exit(code);
}
if(process.send){
 process.on('disconnect',()=>void recover(75));
 process.on('message',message=>{
  if(message?.type==='central_stop')void recover(0);
  if(message?.type==='whatsapp_prepare_pairing'&&!whatsappReady&&!sessionAuthenticated&&!linkByPhone)void recover(79);
 });
}
process.on('SIGINT',()=>void recover(0));
process.on('SIGTERM',()=>void recover(0));
process.on('SIGHUP',()=>void recover(0));
await tick();
if(!stopping)waitForSession();
try{
 if(!stopping){
  initialization=client.initialize();
  await initialization;
 }
}
catch(error){
 if(!stopping){
  const failure=whatsappStartupFailure(error);
  reportPhase(failure);
  // This console is local. Never add provider exceptions to the web heartbeat.
  console.error('[whatsapp] No se pudo iniciar el navegador de WhatsApp ('+failure+').', error?.message || (typeof error === 'string' ? error : error?.name) || 'Sin detalle del navegador.');
 }
 await recover(phase==='session_timeout' ? startupExitCode() : 75);
}
