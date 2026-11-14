import test from 'node:test';import assert from 'node:assert/strict';
import {commercialCatalog} from '../server/commercial-catalog.js';
import {defaultGoal,goalCampaigns,researchQueriesFor} from '../server/sales-director.js';
import {prospectQuery,repairDiscoveryPlan,searchRequest} from '../server/discovery-plan.js';
import {relevantSearchLinks} from '../server/public-web.js';
const app=commercialCatalog().find(a=>a.slug==='open-voley')!;
test('archivo de regresión: busca clubes, archiva cola ajena y conserva contadores anteriores',()=>{
 const c=goalCampaigns(defaultGoal('2026-11'),[app],[],new Date('2026-11-14T15:00:00Z'))[0];
 Object.assign(c,{intelligencePlanId:'old-ai',researchQueries:['Open Voley Argentina análisis táctico'],researchCount:4,researchQueriesToday:1,researchQueue:[{url:'https://www.merriam-webster.com/dictionary/club'}],researchNextAttemptAt:Date.now()+3600000});
 assert.equal(prospectQuery(c.researchQueries![0],app,'Argentina'),false);
 assert.equal(repairDiscoveryPlan(c,app),true);assert.equal(c.researchRepairArchive?.count,4);assert.equal(c.researchRepairArchive?.queue.length,1);
 assert.equal(c.researchQueue?.length,0);assert.equal(c.researchNextAttemptAt,undefined);assert.equal(c.intelligencePlanId,undefined);
 assert.ok(c.researchQueries?.every(q=>prospectQuery(q,app,'Argentina')));assert.equal(repairDiscoveryPlan(c,app),false);
});
test('RSS solo selecciona prospectos con indicios de país y actividad; CDATA y HTML alternativo funcionan',()=>{
 const rss='<rss><channel><item><title>Night clubs Fontana</title><link>https://yelp.com/nightclubs</link></item><item><title>club dictionary</title><link>https://merriam-webster.com/dictionary/club</link></item><item><title><![CDATA[Club voleibol Argentina]]></title><link>https://club-ficticio.test/contacto</link></item><item><title>Club voleibol Chile</title><link>https://club-extranjero.test/</link></item></channel></rss>';
 assert.deepEqual(relevantSearchLinks(rss,app,'Argentina'),['https://club-ficticio.test/contacto']);
 const html='<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fclub-ficticio.test%2Fcontacto" class="result__a">Club voleibol</a><a class="result__snippet">Contacto en Argentina</a>';
 assert.deepEqual(relevantSearchLinks(html,app,'Argentina',true),['https://club-ficticio.test/contacto']);
 const u=new URL(searchRequest('club voleibol contacto Argentina','Argentina'));assert.equal(u.searchParams.get('q'),'club voleibol contacto Argentina');assert.equal(u.searchParams.get('mkt'),'es-AR');
});

test("consultas del catálogo son compatibles con actividad y país en Argentina y Brasil",()=>{for(const a of commercialCatalog().filter(a=>a.status==='lista'))for(const country of ['Argentina','Brasil'])assert.ok(researchQueriesFor(a,country).every(q=>prospectQuery(q,a,country)),a.name+' '+country);});
