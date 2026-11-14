import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('monthly director creates its own campaigns, persists limits, excludes development and keeps the pilot separate', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cc-director-'));
 process.env.CENTRAL_DATA_DIR=dir;
 try {
  const {db}=await import('../server/db.js');
  const raw=db.getRaw();raw.contacts=[];raw.conversations=[];raw.campaigns=[];
  const ready=db.getApplications().filter(a=>a.status==='lista'&&a.campaignsAllowed);
  const goal={...db.getMonthlyGoal(),targetClients:5,enabled:true,countries:['Argentina'],dailyEmailLimit:7};
  db.saveMonthlyGoal(goal);
  db.startMonthlyDirector();
  let report=db.getAutonomousRunReport(true);
  assert.equal(report.run,null);assert.equal(report.director?.target,5);assert.equal(report.director?.dailyLimit,7);
  assert.equal(report.director?.campaigns.length,ready.length);
  const campaigns=db.getCampaigns().filter(c=>db.campaignInActiveRun(c.id));
  assert.ok(campaigns.every(c=>c.intelligenceEnabled&&c.channels.includes('email')&&c.channels.includes('whatsapp')&&!c.maxContacts));
  assert.ok(campaigns.every(c=>ready.some(a=>a.id===c.appId)));
  assert.ok(report.director?.campaigns.every(c=>c.strategyReady&&c.strategySource==='Catálogo verificado'));
  assert.ok(!report.blockers.some(b=>b.includes('OpenJarvis')));
  assert.ok(campaigns.every(c=>c.catalogStrategy&&!c.intelligencePlanId));
  db.startMonthlyDirector();assert.equal(db.getCampaigns().filter(c=>db.campaignInActiveRun(c.id)).length,campaigns.length);
  const {researchGoalProspects}=await import('../server/prospect-research.js');
  const {claimCommercialEmail,completeCommercialEmail}=await import('../server/commercial-email.js');
  const campaign=campaigns.find(c=>db.getApplicationById(c.appId)?.slug==='open-voley')!;
  for(const c of campaigns)c.lastResearchAt=c===campaign?'2000-01-01':new Date().toISOString();
  campaign.sendWindowStart='00:00';campaign.sendWindowEnd='23:59';
  let pages=0;await researchGoalProspects(async url=>{pages++;return {url,text:url.includes('bing.com')?'<rss><channel><item><link>https://club-catalogo-ficticio.test/contacto</link></item></channel></rss>':'<h1>Club de voleibol Argentina</h1><a href="mailto:info@club-catalogo-ficticio.test">Contacto institucional</a>'};});
  assert.equal(pages,2);assert.equal(db.getContacts().length,1);
  assert.equal(db.prepareCampaignDrafts(campaign.id).created,1);
  db.commercialEmailHeartbeat('simulated-mail',true,true,'owner@fixture.test');
  const email=claimCommercialEmail('simulated-mail')!;assert.ok(email);
  completeCommercialEmail({...email,workerId:'simulated-mail',outcome:'accepted',response:'250 SIMULATED ONLY'});
  assert.ok(db.getAutonomousRunReport().director?.apps.some(a=>a.operations.acceptedContacts===1));
  assert.ok(!campaign.intelligencePlanId,'No AI completion was used or invented');

  db.saveMonthlyGoal({...goal,targetClients:6,countries:['Argentina','Brasil']});
  report=db.getAutonomousRunReport(true);assert.equal(report.director?.target,6);
  assert.equal(report.director?.campaigns.length,ready.length*2);
  assert.ok(db.getMonthlyGoal().directorEnabled);
  const stored=JSON.parse(fs.readFileSync(path.join(dir,'central_comercial_db.json'),'utf8'));
  assert.ok(stored.monthlySalesGoals.some((g:any)=>g.directorEnabled&&g.targetClients===6));
  db.startAutonomousRun({appId:ready[0].id,country:'Argentina',maxContacts:3,targetClients:6,sendWindowStart:'09:00',sendWindowEnd:'18:00'});
  assert.equal(db.getMonthlyGoal().directorEnabled,false);
  assert.ok(db.getAutonomousRunReport().run);
  assert.equal(db.getCampaigns().filter(c=>db.campaignInActiveRun(c.id)).length,1);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
