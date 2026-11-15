import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {commercialCatalog,mergeCommercialCatalog} from '../server/commercial-catalog.js';
import {goalCampaigns,defaultGoal,researchQueriesFor,promotionalTemplate} from '../server/sales-director.js';
import {prospectQuery} from '../server/discovery-plan.js';
import {extractContact} from '../server/public-web.js';

async function withServer(local:boolean,run:(base:string,key:string)=>Promise<void>){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'central-role-'));
 const port=await new Promise<number>(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=(socket.address() as net.AddressInfo).port;socket.close(()=>resolve(port));});});
 const key='isolated-worker-fixture-'.repeat(3);
 const child=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,NODE_ENV:'production',CENTRAL_LOCAL_MODE:String(local),CENTRAL_DIAGNOSTIC_MODE:String(local),CENTRAL_DATA_DIR:directory,CHANNEL_TEST_WORKER_KEY:key,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',data=>errors+=data);
 try{
  const base=`http://127.0.0.1:${port}`;let ready=false;
  for(let n=0;n<100;n++){try{const r=await fetch(base+'/api/status');if(r.ok){ready=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));}
  assert.ok(ready,errors);await run(base,key);
 }finally{child.kill('SIGTERM');await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.once('exit',()=>r());});fs.rmSync(directory,{recursive:true,force:true});}
}
const request=(base:string,key:string,route:string,body:any)=>fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('cloud deploy cannot execute or claim work even without the migration marker; monitoring survives handoff',async()=>{
 await withServer(false,async(base,key)=>{
  const status=await fetch(base+'/api/status').then(r=>r.json());
  assert.equal(status.cloudMonitorMode,true);assert.equal(status.scheduler.isRunning,false);assert.match(status.release.sourceFingerprint,/^[a-f0-9]{64}$/);
  for(const route of ['/api/automation/director/start','/api/commercial-email/worker/claim','/api/commercial-whatsapp/worker/claim','/api/channel-tests/worker/claim'])assert.equal((await request(base,key,route,{})).status,409);
  assert.equal((await request(base,key,'/api/local-runtime/heartbeat',{workerId:'fixture',startedAt:Date.now(),ramGB:8,model:'fixture-local',components:{email:'running',whatsapp:'missing',intelligence:'running'},connections:{email:true,whatsapp:false,intelligence:true},diagnosticMode:true,issues:[],sourceFingerprint:'a'.repeat(64)})).status,200);
  assert.equal((await request(base,key,'/api/local-runtime/migrate',{})).status,200);
  const runtime=await fetch(base+'/api/local-runtime').then(r=>r.json());assert.equal(runtime.connections.email,true);assert.equal(runtime.diagnosticMode,true);
  assert.equal((await request(base,key,'/api/local-runtime/heartbeat',{workerId:'fixture',startedAt:Date.now(),ramGB:8,model:'fixture-local',components:{email:'stopped',whatsapp:'missing',intelligence:'stopped'},connections:{email:false,whatsapp:false,intelligence:false},issues:[]})).status,200);
  assert.equal((await fetch(base+'/api/contacts')).status,409);
 });
});
test('diagnostic PC confirms connections but never gives any email, WhatsApp or test job to a transport',async()=>{
 await withServer(true,async(base,key)=>{
  const status=await fetch(base+'/api/status').then(r=>r.json());assert.equal(status.diagnosticMode,true);assert.equal(status.scheduler.isRunning,false);assert.equal(status.cloudMonitorMode,false);
  await request(base,key,'/api/channel-tests/worker/heartbeat',{workerId:'fixture',email:true,whatsapp:true});
  const queued=await request(base,key,'/api/channel-tests',{channels:['email','whatsapp']});assert.equal(queued.status,200);
  for(const route of ['/api/commercial-email/worker/claim','/api/commercial-whatsapp/worker/claim','/api/channel-tests/worker/claim'])assert.equal((await request(base,key,route,{workerId:'fixture'}).then(r=>r.json())).job,null);
  const jobs=await fetch(base+'/api/channel-tests').then(r=>r.json());assert.equal(jobs.jobs.length,2);assert.ok(jobs.jobs.every((j:any)=>j.state==='pendiente'));
  assert.equal((await fetch(base+'/api/local-runtime/report')).status,401);
  const report=await fetch(base+'/api/local-runtime/report',{headers:{Authorization:`Bearer ${key}`}}).then(r=>r.json());assert.deepEqual(report.connections,{email:false,whatsapp:false,intelligence:false});assert.ok(!JSON.stringify(report).includes(key));
 });
});
test('Funeraria participates in autonomous research, preserving IDs, history, countries and price uncertainty',()=>{
 const app=commercialCatalog().find(a=>a.slug==='funeraria')!;
 const historical={...app,id:'preserved-id',commercialCatalogVersion:'2026-11-12.2',status:'en_desarrollo' as const,campaignsAllowed:false,internalNotes:'Nota del propietario',countries:['Chile']};
 const merged=mergeCommercialCatalog([historical]).applications.find(a=>a.id===historical.id)!;
 assert.equal(merged.status,'lista');assert.equal(merged.campaignsAllowed,true);assert.equal(merged.internalNotes,'Nota del propietario');assert.ok(merged.countries.includes('Chile'));assert.ok(merged.countries.includes('México'));assert.deepEqual(merged.plans,[]);
 assert.equal(mergeCommercialCatalog(mergeCommercialCatalog([historical]).applications).changed,false);
 const goal={...defaultGoal('2026-11'),countries:['México']};const campaigns=goalCampaigns(goal,[app],[],new Date('2026-11-15T12:00:00Z'));assert.equal(campaigns.length,1);
 assert.ok(researchQueriesFor(app,'México').every(q=>prospectQuery(q,app,'México')));
 const contact=extractContact('<h1>Servicios funerarios México</h1><a href="mailto:contacto@funeraria-fixture.test">Contacto</a>','https://funeraria-fixture.test/contacto',app,'México');assert.equal(contact?.email,'contacto@funeraria-fixture.test');
 assert.ok(!promotionalTemplate(app,'Brasil').includes('crianças'));
});
