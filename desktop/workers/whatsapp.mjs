import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import qrcode from 'qrcode-terminal';
import wwebjs from 'whatsapp-web.js';
import {sendWhatsAppTest} from './transports.mjs';
import {commercialWhatsAppRunner,sendWithAck} from './commercial.mjs';

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
const phone='5492235802743';
const canonicalPhone=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.startsWith('549')?'54'+digits.slice(3):digits;};
let whatsappReady=false,running=false,stopping=false;
async function api(action,body={},area='channel-tests'){
 const response=await fetch(new URL(`/api/${area}/worker/${action}`,origin),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({workerId,...body}),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok){const error=new Error(`Central Comercial respondio HTTP ${response.status}`);error.httpStatus=response.status;throw error;}
 return response.json();
}
const {Client,LocalAuth}=wwebjs;
const client=new Client({authStrategy:new LocalAuth({dataPath:path.join(stateDir,'whatsapp')}),puppeteer:{headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}});
const ownerReportFile=path.join(stateDir,'owner-reports.json');
const ownerReports=fs.existsSync(ownerReportFile)?JSON.parse(fs.readFileSync(ownerReportFile,'utf8')):{};
const saveOwnerReports=()=>{const tmp=ownerReportFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(ownerReports),{mode:0o600});fs.renameSync(tmp,ownerReportFile);};
async function ownerReportTick(){
 if(!whatsappReady||process.env.CENTRAL_DIAGNOSTIC_MODE==='true')return;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const part=k=>parts.find(x=>x.type===k)?.value||'';
 const day=part('year')+'-'+part('month')+'-'+part('day'),minute=Number(part('hour'))*60+Number(part('minute'));
 const test=day==='2026-11-17'&&minute>=23*60+30;
 const daily=day>='2026-11-18'&&minute>=20*60;
 if(!test&&!daily)return;
 const key=(test?'test-':'daily-')+day;
 if(ownerReports[key])return;
 const report=await api('owner-report',{day},'commercial-whatsapp');
 // Reserve before sending; never duplicate an uncertain WhatsApp delivery.
 ownerReports[key]={status:'resultado_desconocido',at:new Date().toISOString()};saveOwnerReports();
 try{
  const message=(test?'PRUEBA DE WHATSAPP — CENTRAL COMERCIAL\n\n':'')+report.content;
  const result=await sendWithAck(client,{recipient:phone,content:message},async()=>{},60000);
  ownerReports[key]={status:result.outcome==='accepted'?'aceptado_proveedor':result.outcome==='rejected'?'rechazado':'resultado_desconocido',at:new Date().toISOString(),providerId:result.providerId||''};
 }catch(error){ownerReports[key]={status:'resultado_desconocido',at:new Date().toISOString(),error:String(error.code||error.message).slice(0,100)};}
 saveOwnerReports();console.log('Informe WhatsApp '+day+': '+ownerReports[key].status);
}
const commercial=commercialWhatsAppRunner({client,stateDir,call:(action,data={})=>api(action,data,'commercial-whatsapp')});
client.on('qr',qr=>{console.log('\nEn el telefono: WhatsApp > Dispositivos vinculados > Vincular un dispositivo.');console.log('Escanee este QR. No lo comparta por chat.');qrcode.generate(qr,{small:true});});
client.on('ready',()=>{
 const account=client.info?.wid?.user;
 if(!account||canonicalPhone(account)!==canonicalPhone(phone)){whatsappReady=false;console.log('La cuenta vinculada no coincide con el numero personal previsto. No se habilitaran envios. Desvincule este dispositivo desde el telefono y vuelva a iniciar.');void recover(78);return;}
 process.send?.({type:'healthy'});whatsappReady=true;console.log('WhatsApp personal vinculado a Central Comercial. No se inicio ninguna campana.');void tick();
});
client.on('auth_failure',()=>{whatsappReady=false;console.log('WhatsApp requiere volver a vincular el dispositivo.');void recover(78);});
client.on('disconnected',reason=>{whatsappReady=false;console.log('WhatsApp desconectado. Se conserva la sesión para recuperarla.');void recover(String(reason).toUpperCase()==='LOGOUT'?78:75);});
async function tick(){
 if(running||stopping)return;running=true;
 try{
  await api('heartbeat',{email:false,whatsapp:whatsappReady});
  await api('heartbeat',{ready:whatsappReady,account:client.info?.wid?.user||''},'commercial-whatsapp');
  for(const entry of Object.values(journal))if(entry.result&&!entry.reported){try{await api('complete',{id:entry.id,lease:entry.lease,result:entry.result});entry.reported=true;save();}catch(error){if(error.httpStatus===409){entry.reported=true;save();}else throw error;}}
  if(!whatsappReady)return;
  await ownerReportTick();
  await commercial.tick();
  const {job}=await api('claim');if(!job)return;
  if(job.channel!=='whatsapp'||job.recipient!==phone)throw new Error('Solo se permiten comprobaciones al numero personal del propietario.');
  if(journal[job.id]){const previous=journal[job.id];await api('complete',{id:job.id,lease:job.lease,result:previous.result});previous.reported=true;save();return;}
  const entry=journal[job.id]={id:job.id,lease:job.lease,result:{state:'resultado_desconocido',evidence:'Intento iniciado; ante una interrupcion no se reenvia automaticamente.'}};save();
  try{entry.result=await sendWhatsAppTest(client,job);}catch{entry.result={state:'resultado_desconocido',evidence:'WhatsApp no confirmo el resultado. Revisar antes de reenviar.'};}
  save();await api('complete',{id:entry.id,lease:entry.lease,result:entry.result});entry.reported=true;save();
 }catch(error){console.log(error.httpStatus===401?'El servidor rechazo la clave de enlace. Revise la configuracion compartida con el correo.':error.httpStatus===409?'Hay otro ejecutor de comprobaciones activo. Cierre el anterior y espere a que se desconecte.':`Conexion pendiente: ${error.message||'revise Internet'}`);}
 finally{running=false;}
}
console.log('Preparando WhatsApp dentro del inicio único de Central Comercial.');
const timer=setInterval(()=>void tick(),20000);
if(process.send)process.on('disconnect',()=>void recover(75));
await tick();
async function recover(code){if(stopping)return;stopping=true;whatsappReady=false;clearInterval(timer);if(code===78)process.send?.({type:'attention',code:'whatsapp_auth'});await api('heartbeat',{email:false,whatsapp:false}).catch(()=>{});await Promise.race([client.destroy().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,5000))]);process.exit(code);}
await client.initialize().catch(()=>recover(75));
async function stop(){stopping=true;clearInterval(timer);whatsappReady=false;await api('heartbeat',{email:false,whatsapp:false}).catch(()=>{});await client.destroy().catch(()=>{});process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());

