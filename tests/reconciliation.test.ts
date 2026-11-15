import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {reconcileDatabases,reconcileRuntime} from '../desktop/reconcile-data.mjs';
import {validateGoal,defaultGoal} from '../server/sales-director.js';
const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit'}).formatToParts(new Date());
const month=parts.find(x=>x.type==='year')!.value+'-'+parts.find(x=>x.type==='month')!.value;
function fixture(){return {applications:[{id:'app'}],contacts:[],campaigns:[{id:'campaign',goalMonth:month,intelligencePlanId:'local-plan',researchDay:'2026-11-14',researchCount:4,researchQueue:[{url:'https://local-fixture.test'}],researchSeenUrls:['https://seen-local.test'],researchNextAttemptAt:9999999999999}],conversations:[],clients:[],subscriptions:[],payments:[{id:'payment',status:'rechazado',amount:20,currency:'USD'}],tasks:[{id:'task',status:'completada'}],accountCharges:[],logs:[],scheduler:{automationsPaused:true},monthlySalesGoals:[{...defaultGoal(month),countries:['Argentina'],dailyEmailLimit:10,dailyResearchLimit:12}],researchState:{day:'2026-11-14',requests:11,visited:[]}};}
function remote(){const r:any=fixture();r.contacts=[{id:'public',email:'info@institution-fixture.test',permission:'revocado'}];r.conversations=[{id:'thread',contactId:'public',messages:[{id:'message',status:'envio_intentado',lease:'fixture-only'}]}];r.tasks[0].status='pendiente';r.payments[0].reviewedAt='2026-11-14T12:00:00Z';r.researchState={day:'2026-11-15',requests:12,visited:['https://remote-fixture.test']};r.campaigns[0].researchDay='2026-11-15';r.campaigns[0].researchQueue=[{url:'https://remote-fixture.test'}];return r;}
function snapshot(d:any){const payload={format:1,files:{'central_comercial_db.json':d}};return {payload,sha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};}
test('reconciliation adds missing records, retains local decisions and consumes no extra quota',()=>{
 const local=fixture(),source=remote(),before=structuredClone(local),result=reconcileDatabases(local,source,{activate:true,researchLimit:24});
 assert.deepEqual(local,before);const m=result.merged;
 assert.equal(m.contacts.length,1);assert.equal(m.contacts[0].permission,'revocado');assert.equal(m.conversations[0].messages[0].status,'resultado_desconocido');assert.equal(m.tasks[0].status,'completada');assert.deepEqual(m.payments,local.payments);assert.equal(m.campaigns[0].intelligencePlanId,'local-plan');assert.equal(m.campaigns[0].researchQueue.length,2);assert.equal(m.campaigns[0].researchNextAttemptAt,undefined);
 assert.equal(m.researchState.requests,12);assert.equal(m.monthlySalesGoals[0].dailyResearchLimit,24);assert.equal(m.monthlySalesGoals[0].dailyEmailLimit,10);assert.deepEqual(m.monthlySalesGoals[0].countries,['Argentina']);assert.equal(m.scheduler.automationsPaused,false);assert.equal(m.monthlySalesGoals[0].directorEnabled,true);
});
test('financial conflict or duplicate contact identity prevents overwriting',()=>{
 const source=remote();source.payments[0].status='confirmado';assert.throws(()=>reconcileDatabases(fixture(),source),/financieras/);
 const local:any=fixture();local.contacts=[{id:'other',email:'info@institution-fixture.test'}];assert.throws(()=>reconcileDatabases(local,remote()),/mismo correo/);
});
test('24 pages is accepted, zero or above 40 is rejected; email cap is unchanged',()=>{
 validateGoal({...defaultGoal(month),dailyResearchLimit:24});assert.throws(()=>validateGoal({...defaultGoal(month),dailyResearchLimit:0}));assert.throws(()=>validateGoal({...defaultGoal(month),dailyResearchLimit:41}));
});
test('disk reconciliation archives both inputs and refuses a concurrently modified local DB',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'central-reconcile-'));const file=path.join(folder,'records','central_comercial_db.json');fs.mkdirSync(path.dirname(file));const local=fixture();fs.writeFileSync(file,JSON.stringify(local));
 try{const fetcher=async()=>{fs.writeFileSync(file,JSON.stringify({...local,ownerNote:'changed meanwhile'}));return Response.json(snapshot(remote()));};await assert.rejects(reconcileRuntime(folder,{url:new URL('http://127.0.0.1'),key:'fixture-only'},{fetcher}),/cambió/);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).ownerNote,'changed meanwhile');assert.ok(fs.existsSync(path.join(folder,'reconciliation')));}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('successful disk reconciliation keeps local queues and credentials untouched',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'central-reconcile-'));const file=path.join(folder,'records','central_comercial_db.json');fs.mkdirSync(path.dirname(file));fs.writeFileSync(file,JSON.stringify(fixture()));fs.writeFileSync(path.join(folder,'records','openjarvis_plans.json'),'["preserved-local-plan"]');fs.writeFileSync(path.join(folder,'.env'),'fixture-key-never-copied');
 try{const report=await reconcileRuntime(folder,{url:new URL('http://127.0.0.1'),key:'fixture-only'},{activate:true,fetcher:async()=>Response.json(snapshot(remote()))});assert.equal((report.added as Record<string,number>).contacts,1);assert.equal((report.added as Record<string,number>).conversations,1);assert.equal(fs.readFileSync(path.join(folder,'records','openjarvis_plans.json'),'utf8'),'["preserved-local-plan"]');assert.equal(fs.readFileSync(path.join(folder,'.env'),'utf8'),'fixture-key-never-copied');assert.ok(fs.existsSync(path.join(folder,'reconciliation-report.json')));}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('bad remote integrity retains the exact local DB',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'central-reconcile-'));const file=path.join(folder,'records','central_comercial_db.json');fs.mkdirSync(path.dirname(file));const initial=JSON.stringify(fixture());fs.writeFileSync(file,initial);
 try{await assert.rejects(reconcileRuntime(folder,{url:new URL('http://127.0.0.1'),key:'fixture-only'},{fetcher:async()=>Response.json({...snapshot(remote()),sha256:'invalid'})}),/integridad/);assert.equal(fs.readFileSync(file,'utf8'),initial);}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
