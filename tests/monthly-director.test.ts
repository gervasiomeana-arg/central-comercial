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
  assert.ok(report.blockers.some(b=>b.includes('OpenJarvis')));
  db.startMonthlyDirector();assert.equal(db.getCampaigns().filter(c=>db.campaignInActiveRun(c.id)).length,campaigns.length);
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
