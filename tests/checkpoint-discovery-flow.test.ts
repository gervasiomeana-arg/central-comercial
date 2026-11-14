import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {accountingDay} from '../src/ledger.js';
import {defaultGoal,goalCampaigns} from '../server/sales-director.js';

test('regresión del respaldo: recupera cola vieja, conserva cupo, filtra RSS ajeno y encuentra contacto con HTML y página oficial',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cc-checkpoint-flow-'));process.env.CENTRAL_DATA_DIR=dir;
 try{
  const {db}=await import('../server/db.js');const {researchGoalProspects}=await import('../server/prospect-research.js');
  const {claimCommercialEmail,completeCommercialEmail}=await import('../server/commercial-email.js');
  const raw=db.getRaw(),day=accountingDay(),month=day.slice(0,7);
  const goal={...defaultGoal(month),enabled:true,directorEnabled:true,targetClients:5,countries:['Argentina'],dailyEmailLimit:10,dailyResearchLimit:12,directorChannels:['email'] as ('email'|'whatsapp')[]};
  raw.contacts=[];raw.conversations=[];raw.monthlySalesGoals=[goal];raw.scheduler.automationsPaused=false;
  raw.researchState={month,day,requests:11,visited:[],status:'waiting'};
  raw.campaigns=goalCampaigns(goal,db.getApplications(),[]);
  const open=raw.campaigns.find(c=>c.appId==='app-open-voley')!;
  for(const c of raw.campaigns)Object.assign(c,{researchDay:day,researchCount:c===open?4:3,researchQueriesToday:2,researchNextAttemptAt:Date.now()+3600000,researchQueue:[{url:'https://www.merriam-webster.com/dictionary/club'}]});
  open.researchQueries=['Open Voley Argentina análisis táctico'];open.intelligencePlanId='legacy-invalid';
  db.processSalesDirector();assert.equal(raw.researchState.requests,11);assert.equal(open.researchRepairArchive?.count,4);assert.equal(open.researchNextAttemptAt,undefined);assert.equal(open.status,'activa');
  for(const c of raw.campaigns)c.lastResearchAt=c===open?'2000-01-01':new Date(Date.now()+3600000).toISOString();
  const fetched:string[]=[];
  const fetcher=async(url:string)=>{
   fetched.push(url);
   if(url.includes('bing.com'))return {url,text:'<rss><channel><item><title>Club dictionary</title><link>https://www.merriam-webster.com/dictionary/club</link></item></channel></rss>'};
   if(url.includes('duckduckgo.com'))return {url,text:'<a class="result__a" href="https://club-simulado.test/">Club de voleibol Argentina</a><a class="result__snippet">Página oficial de contacto institucional.</a>'};
   if(url==='https://club-simulado.test/')return {url,text:'<title>Club de voleibol Argentina</title><h1>Club de voleibol Argentina</h1><a href="/contacto">Contacto</a>'};
   if(url==='https://club-simulado.test/contacto')return {url,text:'<title>Contacto</title><p>Argentina</p><a href="mailto:info@club-simulado.test">Escribinos</a>'};
   throw new Error('No debía consultar esta página: '+url);
  };
  await researchGoalProspects(fetcher);assert.equal(fetched.length,1);assert.equal(raw.contacts.length,0);assert.equal(raw.researchState.requests,12);assert.equal(raw.researchState.status,'quota');assert.ok(open.researchSearchFallbackQuery);
  db.saveMonthlyGoal({...goal,dailyResearchLimit:20});assert.equal(raw.researchState.requests,12);
  await researchGoalProspects(fetcher);await researchGoalProspects(fetcher);
  assert.equal(fetched.length,4);assert.ok(!fetched.some(url=>url.includes('merriam-webster')));
  assert.equal(raw.contacts.length,1);assert.equal(raw.contacts[0].source,'https://club-simulado.test/contacto');assert.equal(raw.contacts[0].country,'Argentina');assert.equal(raw.researchState.requests,15);
  open.sendWindowStart='00:00';open.sendWindowEnd='23:59';assert.equal(db.prepareCampaignDrafts(open.id).created,1);
  db.commercialEmailHeartbeat('fixture-mail',true,true,'owner@fixture.test');const job=claimCommercialEmail('fixture-mail')!;assert.ok(job);assert.equal(job.recipient,'info@club-simulado.test');
  completeCommercialEmail({...job,workerId:'fixture-mail',outcome:'accepted',response:'250 SIMULATED ONLY'});
  assert.equal(db.getAutonomousRunReport().director?.apps.find(a=>a.id===open.appId)?.operations.acceptedContacts,1);
  assert.equal(claimCommercialEmail('fixture-mail'),null);assert.equal(db.getSalesGoalReport().achieved,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
