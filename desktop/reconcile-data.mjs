import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicJSON} from './recovery.mjs';

const collections=['applications','contacts','campaigns','conversations','clients','subscriptions','payments','tasks','accountCharges','monthlySalesGoals','logs'];
const required=['applications','contacts','campaigns','conversations','clients','subscriptions','payments'];
const stable=value=>JSON.stringify(value);
export function validateDatabase(data){
 if(!data||required.some(k=>!Array.isArray(data[k])))throw new Error('La base no contiene las colecciones requeridas. No se cambió ningún registro.');
 for(const k of collections){
  if(data[k]===undefined)continue;
  if(!Array.isArray(data[k]))throw new Error('Colección inválida: '+k);
  const ids=data[k].map(x=>k==='monthlySalesGoals'?x.month:x.id);
  if(ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length)throw new Error('Identificadores inválidos o repetidos en '+k);
 }
}
export function verifyCheckpoint(snapshot){
 if(snapshot?.payload?.format!==1||createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex')!==snapshot.sha256)throw new Error('La copia publicada no supera la comprobación de integridad.');
 const data=snapshot.payload.files?.['central_comercial_db.json'];validateDatabase(data);return data;
}
export function reconcileDatabases(local,remote,{activate=false,researchLimit=24}={}){
 validateDatabase(local);validateDatabase(remote);
 if(!Number.isInteger(researchLimit)||researchLimit<1||researchLimit>40)throw new Error('Cupo de investigación inválido.');
 const merged=structuredClone(local),report={added:{},preservedDifferences:[],before:{},after:{},researchLimit};
 for(const collection of collections){
  merged[collection]||=[];
  const id=x=>collection==='monthlySalesGoals'?x.month:x.id;
  const index=new Map(merged[collection].map(x=>[id(x),x]));let added=0;
  report.before[collection]=merged[collection].length;
  for(const item of remote[collection]||[]){
   const previous=index.get(id(item));
   if(!previous){
    if(collection==='contacts'){
     const email=String(item.email||'').trim().toLowerCase();
     if(email&&merged.contacts.some(c=>String(c.email||'').trim().toLowerCase()===email))throw new Error('Hay contactos con el mismo correo y distintos identificadores. Requieren revisión; no se cambió la base.');
    }
    const copy=structuredClone(item);merged[collection].push(copy);index.set(id(item),copy);added++;continue;
   }
   if(stable(previous)===stable(item))continue;
   const fields=Object.keys({...previous,...item}).filter(k=>stable(previous[k])!==stable(item[k]));
   report.preservedDifferences.push({collection,id:id(item),fields});
   // Keep all local decisions and financial states. Both full originals are archived.
   if(['contacts','clients','subscriptions','accountCharges'].includes(collection))throw new Error('Hay versiones diferentes del mismo registro comercial: '+collection+'. Revisar las copias antes de continuar.');
   if(collection==='payments'&&['status','amount','currency','clientId','appId'].some(k=>stable(previous[k])!==stable(item[k])))throw new Error('Hay versiones financieras distintas de un pago. No se cambió la base.');
   if(collection==='conversations'){
    const messages=new Map((previous.messages||[]).map(m=>[m.id,m]));
    for(const message of item.messages||[]){const old=messages.get(message.id);if(old&&stable(old)!==stable(message))throw new Error('Hay resultados distintos del mismo mensaje. No se repetirá automáticamente.');if(!old){previous.messages.push(structuredClone(message));messages.set(message.id,message);}}
   }
   if(collection==='campaigns'){
    // Retain local strategy/model references; merge discovery history and pending URLs.
    previous.researchSeenUrls=[...new Set([...(previous.researchSeenUrls||[]),...(item.researchSeenUrls||[])])];
    const queue=new Map([...(previous.researchQueue||[]),...(item.researchQueue||[])].map(x=>[typeof x==='string'?x:x.url,x]));previous.researchQueue=[...queue.values()];
    if((item.researchDay||'')>(previous.researchDay||'')){previous.researchDay=item.researchDay;previous.researchCount=item.researchCount||0;previous.researchQueriesToday=item.researchQueriesToday||0;}
    else if(item.researchDay===previous.researchDay){previous.researchCount=Math.max(previous.researchCount||0,item.researchCount||0);previous.researchQueriesToday=Math.max(previous.researchQueriesToday||0,item.researchQueriesToday||0);}
   }
  }
  report.added[collection]=added;report.after[collection]=merged[collection].length;
 }
 // A pending or accepted send must never be turned into a fresh attempt.
 for(const c of merged.conversations)for(const m of c.messages||[])if(m.status==='envio_intentado'){m.status='resultado_desconocido';m.serviceError='Conciliación: revisar resultado anterior antes de reenviar.';}
 const l=local.researchState||{},r=remote.researchState||{};
 merged.researchState=structuredClone((r.day||'')>(l.day||'')?r:l);
 if(l.day===r.day)merged.researchState.requests=Math.max(l.requests||0,r.requests||0);
 merged.researchState.visited=[...new Set([...(l.visited||[]),...(r.visited||[])])];
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const month=parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value;
 const current=merged.monthlySalesGoals.find(g=>g.month===month);
 if(!current)throw new Error('Falta el objetivo del mes actual. No se habilitaron países nuevos.');
 if(!Array.isArray(current.countries)||!current.countries.length||!Number.isInteger(current.dailyEmailLimit))throw new Error('El objetivo local no tiene países o límites válidos.');
 current.dailyResearchLimit=researchLimit;
 if(!merged.researchState.blocked)for(const campaign of merged.campaigns.filter(c=>c.goalMonth===current.month))delete campaign.researchNextAttemptAt;
 if(activate){current.enabled=true;current.directorEnabled=true;current.directorChannels||=['email','whatsapp'];merged.scheduler.automationsPaused=false;}
 report.requestsPreserved=merged.researchState.requests||0;report.countries=[...current.countries];report.emailLimit=current.dailyEmailLimit;report.activated=activate;
 merged.updatedAt=new Date().toISOString();validateDatabase(merged);
 return {merged,report};
}
export async function reconcileRuntime(runtimeDir,config,{activate=false,researchLimit=24,fetcher=fetch}={}){
 const file=path.join(runtimeDir,'records','central_comercial_db.json');
 if(!fs.existsSync(file))throw new Error('No se encontró la base local existente. Iniciar primero la preparación del paquete completo.');
 const before=fs.readFileSync(file,'utf8');const local=JSON.parse(before);validateDatabase(local);
 const archive=path.join(runtimeDir,'reconciliation',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(archive,{recursive:true});
 atomicJSON(path.join(archive,'local-before.json'),local);
 const response=await fetcher(new URL('/api/local-runtime/migrate',config.url),{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('No se pudo congelar la publicación para conciliar. No se modificó la base local.');
 const snapshot=await response.json(),remote=verifyCheckpoint(snapshot);
 atomicJSON(path.join(archive,'publication.json'),snapshot);
 const {merged,report}=reconcileDatabases(local,remote,{activate,researchLimit});
 // Detect a server/editor writing after this operation began. Never overwrite it.
 if(fs.readFileSync(file,'utf8')!==before)throw new Error('La base local cambió durante la revisión. Cerrá el iniciador y repetí; no se sobrescribió.');
 report.sourceSha256=snapshot.sha256;report.at=new Date().toISOString();report.source=config.url.origin;
 atomicJSON(path.join(archive,'report.json'),report);
 atomicJSON(file,merged);
 atomicJSON(path.join(runtimeDir,'reconciliation-report.json'),report);
 return report;
}
