import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { atomicJSON } from './recovery.mjs';
export function dependenciesReady(root) { return fs.existsSync(path.join(root,'node_modules','tsx','package.json')) && fs.existsSync(path.join(root,'node_modules','express','package.json')); }
export async function installDependencies(root) {
  if(dependenciesReady(root))return;
  const npm=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  if(!fs.existsSync(npm))throw new Error('No se encontró npm de Node.js. Revisar la instalación de Node.js LTS.');
  const code=await new Promise(resolve=>{const p=spawn(process.execPath,[npm,'ci','--include=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:root,stdio:'inherit'});p.on('error',()=>resolve(-1));p.on('exit',resolve);});
  if(code!==0||!dependenciesReady(root))throw new Error('No se completaron las dependencias de la app. No se trasladaron registros.');
}
export async function prepareLocalRecords(root,runtimeDir,config) {
  if(!dependenciesReady(root)||!fs.existsSync(path.join(root,'dist','index.html')))throw new Error('Primero abrir PREPARAR_CENTRAL_COMERCIAL.bat del paquete completo.');
  const dir=path.join(runtimeDir,'records'), dbFile=path.join(dir,'central_comercial_db.json');
  if(fs.existsSync(dbFile))return dir; // The local dataset is authoritative. Never overwrite it on update.
  if(fs.existsSync(path.join(runtimeDir,'migration.json')))throw new Error('Falta la base local de una instalación ya trasladada. Revisar sus respaldos; no se reemplazará con una base vacía de la publicación.');
  const response=await fetch(new URL('/api/local-runtime/migrate',config.url),{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('No se pudo trasladar la base publicada. Publicar la versión actual y cerrar los ejecutores anteriores; no se creó una base vacía.');
  const snapshot=await response.json();
  if(snapshot.payload?.format!==1||createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex')!==snapshot.sha256||!Array.isArray(snapshot.payload.files?.['central_comercial_db.json']?.contacts))throw new Error('La copia de traslado no es válida. No se reemplazaron registros.');
  const staged=path.join(runtimeDir,'records-staging');fs.rmSync(staged,{recursive:true,force:true});fs.mkdirSync(staged,{recursive:true});
  for(const name of ['central_comercial_db.json','channel_test_jobs.json','openjarvis_plans.json','assistant_history.json']){
    const value=snapshot.payload.files[name];if(value===undefined)continue;
    if(name==='central_comercial_db.json'){
      delete value.localMigration;delete value.localMigrationPending;delete value.commercialEmailWorker;delete value.commercialWhatsAppWorker;
      for(const c of value.conversations||[])for(const m of c.messages||[])if(m.status==='envio_intentado'){m.status='resultado_desconocido';m.serviceError='Traslado durante un intento: revisar el resultado antes de reenviar.';}
    }
    atomicJSON(path.join(staged,name),value);
  }
  fs.renameSync(staged,dir);atomicJSON(path.join(runtimeDir,'migration.json'),{at:Date.now(),source:config.url.origin,sha256:snapshot.sha256});return dir;
}
