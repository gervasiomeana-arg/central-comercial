import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { americanMarkets, mexicoRegions } from '../server/campaign-markets.js';
import { accountingDay } from '../src/ledger.js';
import { createFuneralShiftPilot, defaultGoal, goalProgress, goalCampaigns, validateGoal } from '../server/sales-director.js';
import { commercialCatalog } from '../server/commercial-catalog.js';
import { extractContact, searchLinks, publicAddress, publicUrl, contactLinks } from '../server/public-web.js';
import type { Client, Contact, PaymentRecord } from '../src/types.js';
const apps = commercialCatalog(), now = new Date('2026-11-12T15:00:00Z');

test('November defaults to five clients; future months remain editable and inactive',()=>{
  assert.equal(defaultGoal('2026-11').targetClients,5);assert.equal(defaultGoal('2026-12').enabled,false);
  assert.throws(()=>validateGoal({...defaultGoal('2026-11'),targetClients:2.5}));
  assert.throws(()=>validateGoal({...defaultGoal('2026-11'),dailyEmailLimit:1000}));
});
test('goal counts unique first paying clients; renewals, pending, duplicates and development apps do not count',()=>{
  const payment=(id:string,clientId:string,date:string,changes:any={})=>({id,clientId,appId:apps[0].id,paymentDate:date,amount:20,status:'confirmado',reviewedAt:now.toISOString(),...changes} as PaymentRecord);
  const payments=[payment('old','a','2026-10-10'),payment('renew','a','2026-11-01'),payment('new','b','2026-11-02'),payment('secondapp','b','2026-11-04',{appId:apps[1].id}),payment('pending','c','2026-11-03',{status:'pendiente_confirmacion_manual'}),payment('future','c','2026-12-01'),payment('dev','d','2026-11-03',{appId:apps[3].id}),payment('unreviewed','e','2026-11-03',{reviewedAt:undefined})];
  const report=goalProgress(defaultGoal('2026-11'),apps.map((a,i)=>i===3?{...a,status:'en_desarrollo',campaignsAllowed:false}:a),payments,['a','b','c','d','e'].map(id=>({id} as Client)),now);
  assert.equal(report.achieved,1);assert.equal(report.remaining,4);assert.equal(report.daysRemaining,19);assert.equal(report.apps.find(a=>a.id===apps[1].id)?.clients,1);
});
test('director creates only ready apps, deduplicates, stops outside month and separates countries/languages',()=>{
  const goal={...defaultGoal('2026-11'),countries:['Argentina','Brasil','México']};const campaigns=goalCampaigns(goal,apps,[],now);
  assert.equal(campaigns.length,10);assert.ok(campaigns.every(c=>c.channels.join()==='email'));
  assert.ok(campaigns.filter(c=>c.country==='Brasil').every(c=>c.language==='pt-BR'&&c.messageTemplate.includes('Olá')));
  assert.equal(goalCampaigns(goal,apps,campaigns,now).length,0);assert.equal(goalCampaigns(goal,apps,[],new Date('2026-12-01T15:00:00Z')).length,0);
});
test('el alcance cubre América y reserva Funeraria Control exclusivamente para México', () => {
  const goal = { ...defaultGoal('2026-11'), countries: americanMarkets };
  validateGoal(goal);
  assert.equal(new Set(americanMarkets).size, 35);
  assert.equal(new Set(mexicoRegions).size, 32);
  const campaigns = goalCampaigns(goal, apps, [], now);
  assert.equal(campaigns.length, 106);
  for (const app of apps) {
    const countries = campaigns.filter(c => c.appId === app.id).map(c => c.country);
    assert.deepEqual(countries, app.slug === 'funeraria' ? ['México'] : americanMarkets);
  }
  const canada = campaigns.find(c => c.appId === apps[0].id && c.country === 'Canadá')!;
  assert.equal(canada.language, 'en');
  assert.ok(canada.researchQueries?.every(query => query.includes('Canada')));
  const funeraria = apps.find(app => app.slug === 'funeraria')!;
  assert.equal(extractContact('<h1>Funeraria en New Mexico</h1>info@fixture.test', 'https://fixture.test', funeraria, 'México', now), null);
  assert.equal(extractContact('<h1>Funeraria en Sonora</h1>info@fixture.mx', 'https://fixture.mx', funeraria, 'México', now)?.country, 'México');
});
test('public fetch rejects local networks, credentials and insecure URLs',()=>{
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.2','192.168.1.2','100.64.0.1','::1'])assert.equal(publicAddress(address),false);
  assert.equal(publicAddress('8.8.8.8'),true);
  for(const url of ['http://club.org','https://localhost/','https://127.0.0.1/','https://name:pass@club.org/','https://club.org:8080/'])assert.throws(()=>publicUrl(url));
});
test('research records only published contacts with relevant audience and country evidence',()=>{
  const html='<title>Club del Sur</title><h1>Club de voleibol Argentina</h1><a href="mailto:info@clubdelsur.org">Email</a><a href="https://wa.me/5492215550101">WhatsApp</a><script>fake@private.org</script>';
  const c=extractContact(html,'https://clubdelsur.org/contacto',apps[0],'Argentina',now)!;
  assert.equal(c.email,'info@clubdelsur.org');assert.equal(c.phone,'5492215550101');assert.equal(c.permission,'desconocido');assert.equal(c.outreachBasis,'public_business_contact');assert.equal(c.source,'https://clubdelsur.org/contacto');
  assert.equal(extractContact(html,'https://clubdelsur.org',apps[0],'Brasil',now),null);
  assert.equal(extractContact(html.replace('Club de voleibol','Restaurante'),'https://clubdelsur.org',apps[0],'Argentina',now),null);
  assert.deepEqual(searchLinks('<rss><item><link>https://clubdelsur.org/</link></item><item><link>http://localhost/</link></item></rss>'),['https://clubdelsur.org/']);
  assert.deepEqual(contactLinks('<a href="/contacto">Contacto</a><a href="https://other.org/contact">Otro</a>','https://clubdelsur.org'),['https://clubdelsur.org/contacto']);
});

test('el iniciador retoma la cola con una base que ya consumió las 24 consultas', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-unlimited-research-'));
  const settings = { CENTRAL_LOCAL_MODE: 'true', CENTRAL_DATA_DIR: dir, CENTRAL_DIAGNOSTIC_MODE: 'false' };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const day = accountingDay();
  const month = day.slice(0, 7);
  const goal = { ...defaultGoal(month), enabled: true, directorEnabled: true, targetClients: 5, dailyResearchLimit: 24 };
  const campaign = goalCampaigns(goal, [apps[0]], [])[0];
  const queued = 'https://club-prueba.test/contacto';
  const funeralOutsideMexico = { ...campaign, id:'historical-funeral', appId:'app-funeraria', status:'activa', updatedAt:'2000-01-01' };
  campaign.researchQueue = [{ url: queued }];
  campaign.researchDay = day;
  campaign.researchCount = 24;
  fs.writeFileSync(path.join(dir, 'central_comercial_db.json'), JSON.stringify({
    applications: apps, contacts: [], clients: [], conversations: [], payments: [], subscriptions: [],
    campaigns: [campaign, funeralOutsideMexico], monthlySalesGoals: [goal],
    researchState: { month, day, requests: 24, visited: [], status: 'quota', detail: 'Cupo diario alcanzado.' },
  }));

  const { db } = await import('../server/db.js');
  const { researchGoalProspects } = await import('../server/prospect-research.js');
  assert.deepEqual(db.getMonthlyGoal().countries, americanMarkets);
  assert.equal(db.getCampaignById(funeralOutsideMexico.id)?.status, 'pausada');
  assert.equal(db.campaignInActiveRun(funeralOutsideMexico.id), false);
  assert.equal(db.getMonthlyGoal().dailyResearchLimit, 0);
  assert.equal(db.getMonthlyGoal().dailyEmailLimit, goal.dailyEmailLimit);
  assert.equal(db.getResearchState().status, 'pending');
  assert.equal(db.getResearchState().requests, 24);
  assert.equal(db.getCampaigns()[0].dailyLimit, campaign.dailyLimit);
  const existing: Contact = {
    id: 'existing-club', orgName: 'Club de prueba', email: 'info@club-prueba.test', phone: '',
    website: 'https://club-prueba.test', source: 'https://club-prueba.test',
    interestedAppIds: [campaign.appId], permission: 'desconocido', status: 'prospecto', history: [],
    contactPerson: '', role: '', orgType: 'Club', country: campaign.country, language: campaign.language,
    timezone: campaign.timezone, sourceReviewDate: day, assignedTo: '', notes: '',
    preferredChannel: 'email', nextFollowUpDate: null, createdAt: day, updatedAt: day,
  };
  db.getContacts().push(existing);
  await researchGoalProspects(async url => {
    assert.equal(url, queued);
    return { url, text: '<h1>Club de voleibol Argentina</h1><a href="https://wa.me/5491100000001">WhatsApp</a>' };
  });
  assert.equal(db.getContacts().length, 1);
  assert.equal(existing.email, 'info@club-prueba.test');
  assert.equal(existing.phone, '5491100000001');
  assert.equal(existing.whatsappConsent, undefined);
  assert.match(existing.history[0].description, /club-prueba\.test\/contacto/);
  assert.equal(db.getResearchState().requests, 25);
  assert.equal(db.getCampaigns()[0].researchCount, 25);
  assert.notEqual(db.getResearchState().status, 'quota');
  db.processSalesDirector();
  const scheduled = db.getCampaigns().filter(item => db.campaignInActiveRun(item.id));
  assert.equal(scheduled.length, 107);
  assert.deepEqual(scheduled.filter(item => item.appId === 'app-funeraria').map(item => item.country), ['México', 'México']);
  assert.equal(db.getCampaignById(funeralOutsideMexico.id)?.status, 'pausada');

  // Model the workload reported by the PC without contacting any providers.
  for (const [i, item] of scheduled.entries()) {
    db.getContacts().push({
      id: `load-${i}`, orgName: `Institución ${i}`, email: `contact-${i}@example.org`,
      country: item.country, language: item.language, interestedAppIds: [item.appId],
      source: 'https://organization.test', sourceReviewDate: day,
      permission: 'autorizado', status: 'prospecto', preferredChannel: 'email',
    } as ReturnType<typeof db.getContacts>[number]);
  }
  db.getResearchState().blocked = true;
  db.getResearchState().lastError = 'Fuente bloqueada en esta prueba.';
  const {scheduler} = await import('../server/scheduler.js');
  const saves = t.mock.method(db, 'save');
  assert.equal(await scheduler.tick(), true);
  assert.equal(scheduled.filter(item => item.lastPreparation?.at).length, scheduled.length);
  assert.ok(saves.mock.callCount() <= 3, `${saves.mock.callCount()} escrituras en un ciclo`);
  const persisted = JSON.parse(fs.readFileSync(path.join(dir, 'central_comercial_db.json'), 'utf8'));
  assert.equal(persisted.campaigns.filter((item: typeof campaign) => item.lastPreparation?.at).length, scheduled.length);
});


test('el refuerzo de Funeraria requiere el director activo en México y limita el piloto a diez contactos', () => {
  const goal = { ...defaultGoal('2026-11'), directorEnabled: true, countries: ['México', 'Argentina'] };
  const pilot = createFuneralShiftPilot(goal, apps, [], now);
  assert.ok(pilot);
  assert.equal(pilot.country, 'México');
  assert.equal(pilot.maxContacts, 10);
  assert.deepEqual(pilot.channels, ['whatsapp']);
  assert.match(pilot.messageTemplate, /información entre turnos/);
  const funeral = apps.find(app => app.slug === 'funeraria')!;
  const url = 'https://funeraria-local.test/contacto';
  const direct = '<title>Funeraria Local</title>Funeraria en México. Atención 24 horas. <a href="https://wa.me/525555555555">WhatsApp</a>';
  assert.equal(extractContact(direct,url,funeral,'México',now)?.funeralShiftEvidence,url);
  assert.equal(extractContact(direct.replace('Atención 24 horas.', ''),url,funeral,'México',now)?.funeralShiftEvidence,undefined);
  assert.equal(extractContact(direct.replace('Funeraria Local', 'Directorio de funerarias'),url,funeral,'México',now)?.funeralShiftEvidence,undefined);
  assert.equal(createFuneralShiftPilot(goal, apps, [pilot], now), undefined);
  assert.equal(createFuneralShiftPilot({ ...goal, countries: ['Argentina'] }, apps, [], now), undefined);
});
