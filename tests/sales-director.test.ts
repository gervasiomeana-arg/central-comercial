import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultGoal, goalProgress, goalCampaigns, validateGoal } from '../server/sales-director.js';
import { commercialCatalog } from '../server/commercial-catalog.js';
import { extractContact, searchLinks, publicAddress, publicUrl, contactLinks } from '../server/public-web.js';
import type { Client, PaymentRecord } from '../src/types.js';
const apps = commercialCatalog(), now = new Date('2026-11-12T15:00:00Z');

test('November defaults to five clients; future months remain editable and inactive',()=>{
  assert.equal(defaultGoal('2026-11').targetClients,5);assert.equal(defaultGoal('2026-12').enabled,false);
  assert.throws(()=>validateGoal({...defaultGoal('2026-11'),targetClients:2.5}));
  assert.throws(()=>validateGoal({...defaultGoal('2026-11'),dailyEmailLimit:1000}));
});
test('goal counts unique first paying clients; renewals, pending, duplicates and development apps do not count',()=>{
  const payment=(id:string,clientId:string,date:string,changes:any={})=>({id,clientId,appId:apps[0].id,paymentDate:date,amount:20,status:'confirmado',reviewedAt:now.toISOString(),...changes} as PaymentRecord);
  const payments=[payment('old','a','2026-10-10'),payment('renew','a','2026-11-01'),payment('new','b','2026-11-02'),payment('secondapp','b','2026-11-04',{appId:apps[1].id}),payment('pending','c','2026-11-03',{status:'pendiente_confirmacion_manual'}),payment('future','c','2026-12-01'),payment('dev','d','2026-11-03',{appId:apps[3].id}),payment('unreviewed','e','2026-11-03',{reviewedAt:undefined})];
  const report=goalProgress(defaultGoal('2026-11'),apps,payments,['a','b','c','d','e'].map(id=>({id} as Client)),now);
  assert.equal(report.achieved,1);assert.equal(report.remaining,4);assert.equal(report.daysRemaining,19);assert.equal(report.apps.find(a=>a.id===apps[1].id)?.clients,1);
});
test('director creates only ready apps, deduplicates, stops outside month and separates countries/languages',()=>{
  const goal={...defaultGoal('2026-11'),countries:['Argentina','Brasil']};const campaigns=goalCampaigns(goal,apps,[],now);
  assert.equal(campaigns.length,6);assert.ok(campaigns.every(c=>c.channels.join()==='email'));
  assert.ok(campaigns.filter(c=>c.country==='Brasil').every(c=>c.language==='pt-BR'&&c.messageTemplate.includes('Olá')));
  assert.equal(goalCampaigns(goal,apps,campaigns,now).length,0);assert.equal(goalCampaigns(goal,apps,[],new Date('2026-12-01T15:00:00Z')).length,0);
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
