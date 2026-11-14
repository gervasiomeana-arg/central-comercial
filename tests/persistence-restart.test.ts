import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function run(directory:string,code:string){
 const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:process.cwd(),env:{...process.env,CENTRAL_DATA_DIR:directory},encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
}
const imports=`import assert from 'node:assert/strict';import {db} from './server/db.ts';import {claimCommercialEmail,completeCommercialEmail} from './server/commercial-email.ts';`;

test('tres arranques conservan descartes, bajas, límites, pagos e intentos sin duplicar correos',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'central-restart-'));
 try{
  run(directory,imports+`
   const app=db.getApplications().find(a=>a.slug==='open-voley');
   db.startAutonomousRun({appId:app.id,country:'Argentina',maxContacts:7,targetClients:8,sendWindowStart:'00:00',sendWindowEnd:'23:59',channels:['email'],useLocalIntelligence:false});
   const campaign=db.getCampaignById(db.getAutonomousRun().campaignId),now=new Date().toISOString();
   const contact=id=>({id,orgName:id,email:id+'@institucion.test',phone:'',source:'https://institucion.test/contacto',sourceReviewDate:now,interestedAppIds:[app.id],permission:'autorizado',status:'prospecto',country:'Argentina',language:'es',preferredChannel:'email',history:[],notes:'Nota del propietario',createdAt:now,updatedAt:now});
   db.saveContact(contact('interrupted'));assert.equal(db.prepareCampaignDrafts(campaign.id).created,1);db.commercialEmailHeartbeat('simulated',true,true,'owner@fixture.test');
   const job=claimCommercialEmail('simulated');assert.ok(job);assert.equal(job.recipient,'interrupted@institucion.test');
   db.saveContact(contact('valid'));db.prepareCampaignDrafts(campaign.id);
   db.saveContact({...contact('example'),email:'tu@email.com',outreachBasis:'public_business_contact',permission:'desconocido'});
   db.saveContact({...contact('discarded'),status:'descartado'});
   db.saveContact({...contact('unsubscribed'),permission:'revocado',status:'baja_solicitada'});
   for(const id of ['example','discarded','unsubscribed']) db.getRaw().conversations.push({id:'conv-'+id,appId:app.id,contactId:id,campaignId:campaign.id,messages:[{id:'msg-'+id,direction:'outbound',channel:'email',status:'preparado',reviewStatus:id==='example'?'approved':'rejected',approvedRecipient:id==='example'?'tu@email.com':undefined,content:'Invitación simulada',createdAt:now}]});
   db.getRaw().payments.push({id:'preserved-payment',amount:37,currency:'USD',status:'pendiente_confirmacion_manual',referenceNumber:'OWNER-NOTE'});
   db.getRaw().researchState={month:now.slice(0,7),day:now.slice(0,10),requests:11,visited:['https://institucion.test/contacto']};db.save();
  `);
  const filename=path.join(directory,'central_comercial_db.json');
  const before=JSON.parse(fs.readFileSync(filename,'utf8'));
  run(directory,imports+`
   const fake=db.getContactById('example');assert.equal(fake.status,'descartado');assert.equal(fake.email,'tu@email.com');assert.equal(fake.notes,'Nota del propietario');assert.equal(fake.history.filter(h=>h.id==='email-quality-example').length,1);
   const draft=db.getConversationById('conv-example').messages[0];assert.equal(draft.reviewStatus,'rejected');assert.equal(draft.approvedRecipient,undefined);
   assert.equal(db.getContactById('unsubscribed').permission,'revocado');assert.equal(db.getContactById('discarded').status,'descartado');
   assert.equal(db.getMonthlyGoal().targetClients,8);assert.equal(db.getMonthlyGoal().dailyEmailLimit,7);assert.equal(db.getResearchState().requests,11);
   db.commercialEmailHeartbeat('simulated',true,true,'owner@fixture.test');
   const job=claimCommercialEmail('simulated',new Date(Date.now()+180000));assert.ok(job);assert.equal(job.recipient,'valid@institucion.test');
   completeCommercialEmail({...job,workerId:'simulated',outcome:'accepted',response:'250 SIMULATED ONLY'});
   assert.equal(db.getConversations().flatMap(c=>c.messages).filter(m=>m.status==='resultado_desconocido').length,1);
   assert.equal(claimCommercialEmail('simulated'),null);
  `);
  const after=JSON.parse(fs.readFileSync(filename,'utf8'));
  assert.deepEqual(after.payments,before.payments);
  assert.deepEqual(after.researchState,before.researchState);
  run(directory,imports+`
   assert.equal(db.getContactById('example').history.filter(h=>h.id==='email-quality-example').length,1,'La reparación no se duplica al reiniciar');
   assert.equal(db.getConversationById('conv-example').messages[0].draftRevision,1);
   db.commercialEmailHeartbeat('simulated',true,true,'owner@fixture.test');assert.equal(claimCommercialEmail('simulated'),null);
   const messages=db.getConversations().flatMap(c=>c.messages);assert.equal(messages.filter(m=>m.status==='aceptado_proveedor').length,1);assert.equal(messages.filter(m=>m.status==='resultado_desconocido').length,1);
  `);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('base ausente con respaldos o escritura interrumpida, y JSON sin colecciones, detienen el arranque',()=>{
 for(const mode of ['backup','temporary','invalid-schema']){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'central-storage-'));
  try{
   const filename=path.join(directory,'central_comercial_db.json');
   if(mode==='backup'){fs.mkdirSync(path.join(directory,'backups'));fs.writeFileSync(path.join(directory,'backups','db_backup_previous.json'),'{"contacts":[{"id":"preserve"}]}');}
   if(mode==='temporary')fs.writeFileSync(filename+'.tmp','{"contacts":[{"id":"preserve"}]}');
   if(mode==='invalid-schema')fs.writeFileSync(filename,'{}');
   const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"await import('./server/db.ts')"],{cwd:process.cwd(),env:{...process.env,CENTRAL_DATA_DIR:directory},encoding:'utf8',timeout:10000});
   assert.notEqual(result.status,0);assert.match(result.stderr,/Se conservó el archivo/);
   assert.equal(fs.existsSync(filename),mode==='invalid-schema');
   if(mode==='backup')assert.match(fs.readFileSync(path.join(directory,'backups','db_backup_previous.json'),'utf8'),/preserve/);
   if(mode==='temporary')assert.match(fs.readFileSync(filename+'.tmp','utf8'),/preserve/);
   if(mode==='invalid-schema')assert.equal(fs.readFileSync(filename,'utf8'),'{}');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
 }
});

test('el programador no vuelve a generar seguimientos para descartes ni bajas y no duplica tareas',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'central-followups-'));
 try{
  run(directory,imports+`
   const {scheduler}=await import('./server/scheduler.ts');
   db.saveMonthlyGoal({...db.getMonthlyGoal(),enabled:false,discoverContacts:false});db.setAutomationsPaused(false);
   for(const [id,status,permission] of [['active','prospecto','autorizado'],['discarded','descartado','autorizado'],['stop','baja_solicitada','revocado'],['revoked','prospecto','revocado']]) db.saveContact({id,orgName:id,status,permission,history:[],interestedAppIds:[],email:id+'@fixture.test',nextFollowUpDate:'2020-01-01'});
   await scheduler.tick();await scheduler.tick();
   assert.equal(db.getTasks().filter(t=>t.relatedId==='active').length,1);
   for(const id of ['discarded','stop','revoked'])assert.equal(db.getTasks().filter(t=>t.relatedId===id).length,0);
  `);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
