import type {Application,Campaign} from '../src/types.js';
import {normalize,researchQueriesFor,playbook} from './sales-director.js';
export function prospectQuery(query:string,app:Application,country:string){
 const q=normalize(query),name=normalize(app.slug+' '+app.name);
 const audience=name.includes('voley')?/(club|federac|asociac|associac|escuela|escola|equipo)/:name.includes('visibility')?/(agencia|consultor|empresa|pyme|hotel)/:/(centro|institu|escuela|escola|colegio|fundac|asociac|associac|clinica|consultorio|educativ|jardin)/;
 return q.includes(normalize(country))&&audience.test(q)&&playbook(app).terms.some(t=>q.includes(normalize(t)))&&!q.includes(normalize(app.name));
}
export function repairDiscoveryPlan(c:Campaign,app:Application){
 if(c.researchDiscoveryVersion===3)return false;
 c.researchRepairArchive={at:new Date().toISOString(),queries:c.researchQueries||[],queue:c.researchQueue||[],seen:c.researchSeenUrls||[],count:c.researchCount||0,nextAttemptAt:c.researchNextAttemptAt,outcome:c.researchLastOutcome,previousAiPlan:c.intelligencePlanId};
 if(!c.researchQueries?.length||!c.researchQueries.every(q=>prospectQuery(q,app,c.country))){
  c.researchQueries=researchQueriesFor(app,c.country);c.catalogStrategy={version:1,appId:app.id,country:c.country};delete c.intelligencePlanId;
 }
 // Counters below belong to the repaired plan; the global requests already spent
 // remain untouched. Old candidates/counters are retained in the archive.
 c.researchQueue=[];c.researchSeenUrls=[];c.researchCount=0;c.researchQueriesToday=0;c.researchQueryIndex=0;c.researchQueryVersion=2;c.researchDiscoveryVersion=3;
 delete c.researchNextAttemptAt;delete c.researchSearchFallbackQuery;
 return true;
}
export function searchRequest(query:string,country:string,html=false){
 const markets:Record<string,[string,string]>={argentina:['es-AR','ar-es'],brasil:['pt-BR','br-pt'],mexico:['es-MX','mx-es'],chile:['es-CL','cl-es'],uruguay:['es-UY','ar-es']};
 const market=markets[normalize(country)]||['es-ES','es-es'];
 const url=new URL(html?'https://html.duckduckgo.com/html/':'https://www.bing.com/search');
 url.searchParams.set('q',query);
 if(html)url.searchParams.set('kl',market[1]);else{url.searchParams.set('format','rss');url.searchParams.set('mkt',market[0]);url.searchParams.set('setlang',market[0]);}
 return url.href;
}
