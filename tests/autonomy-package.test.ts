import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {commercialWhatsAppRunner,sendWithAck} from '../desktop/whatsapp-commercial.mjs';
import {localRequestAllowed} from '../server/local-boundary.js';
test('ciclo aislado completo: estrategia, investigación, email, WhatsApp autorizado, consulta, cliente y cuenta corriente',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'central-complete-cycle-'));
 try{const result=spawnSync(process.execPath,['--import','tsx','tests/autonomy-cycle.fixture.ts'],{cwd:process.cwd(),env:{...process.env,CENTRAL_DATA_DIR:directory},encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);assert.match(result.stdout,/"brainApplied":true/);assert.match(result.stdout,/"optOutEnforced":true/);assert.match(result.stdout,/"manualPayments":1/);}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('el servidor local bloquea otros sitios y nombres de host',()=>{
 assert.equal(localRequestAllowed('127.0.0.1:39300','http://127.0.0.1:39300','same-origin',true,39300),true);
 assert.equal(localRequestAllowed('127.0.0.1:39300','https://otro-sitio.test','cross-site',true,39300),false);
 assert.equal(localRequestAllowed('otro-sitio.test:39300',undefined,undefined,true,39300),false);
});
test('un intento WhatsApp incierto no se repite después de reiniciar y no se leen chats ajenos',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'central-wa-recovery-'));
 try{
  let calls=0,imports=0;const job={conversationId:'c',messageId:'m',lease:'lease',recipient:'5491100000001',content:'Texto de control'};
  const client=Object.assign(new EventEmitter(),{getNumberId:async()=>({_serialized:'5491100000001@c.us'}),sendMessage:async()=>{calls++;throw new Error('simulated disconnect');}});
  const api=async(action:string)=>{if(action==='claim')return {job};if(action==='routing')return {routes:[]};if(action==='inbound')imports++;return {success:true};};
  let runner=commercialWhatsAppRunner({client,stateDir:dir,call:api});await runner.tick();runner.close();
  runner=commercialWhatsAppRunner({client,stateDir:dir,call:api});await runner.tick();assert.equal(calls,1);
  client.emit('message',{from:'otro@c.us',id:{_serialized:'foreign'},body:'No debe procesarse'});await runner.tick();assert.equal(imports,0);runner.close();
  const ackClient=Object.assign(new EventEmitter(),{getNumberId:async()=>({_serialized:'n@c.us'}),sendMessage:async()=>({id:{_serialized:'id'},ack:0})});const result=await sendWithAck(ackClient,job,async()=>{},1);assert.equal(result.outcome,'unknown');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
