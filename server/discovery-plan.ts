import { isOpenVoley } from './volleyball-outreach.js';
import type {Application,Campaign} from '../src/types.js';
import { marketFor } from './campaign-markets.js';
import {normalize,researchQueriesFor,prospectingTerms} from './sales-director.js';
export function prospectQuery(query:string,app:Application,country:string){
 const q=normalize(query),name=normalize(app.slug+' '+app.name);
 const audience=name.includes('voley')?/(entrenador|tecnico|treinador|coach|entraineur|volleyballtrainer|club|federac|asociac|associac|associat|escuela|escola|school|equipe|equipo|team|vereniging)/:name.includes('visibility')?/(agencia|agency|agence|bureau|consult|empresa|business|pyme|hotel)/:name.includes('funer')?/(funer|velator|funebr)/:/(centro|institu|escuela|escola|colegio|fundac|asociac|associac|clinica|consultorio|educativ|jardin|center|school|foundation|clinic|education|stichting|onderwijs|fondation|ecole|clinique)/;
 return (marketFor(country)?.aliases || [country]).some(alias=>q.includes(normalize(alias)))&&
   (audience.test(q) || researchQueriesFor(app,country).some(candidate=>normalize(candidate)===q))&&prospectingTerms(app,country).some(t=>q.includes(normalize(t)))&&!q.includes(normalize(app.name));
}
export function repairDiscoveryPlan(c:Campaign,app:Application){
 if(c.researchDiscoveryVersion===3){
  if (!isOpenVoley(app)) return false;
  const canonical = researchQueriesFor(app, c.country);
  const queries = [...new Set([canonical[0], ...(c.researchQueries || []), ...canonical])].filter(Boolean);
  if (queries.join('\n') === c.researchQueries?.join('\n')) return false;
  if (c.researchQueries?.[0] !== queries[0]) c.researchQueryIndex = 0;
  c.researchQueries = queries;
  return true;
 }
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
 const markets:Record<string,[string,string]>={argentina:['es-AR','ar-es'],brasil:['pt-BR','br-pt'],mexico:['es-MX','mx-es'],chile:['es-CL','cl-es'],uruguay:['es-UY','ar-es'],paraguay:['es-PY','ar-es'],colombia:['es-CO','co-es'],peru:['es-PE','pe-es'],bolivia:['es-BO','ar-es']};
 const entry=marketFor(country);
 const language=(entry?.language || 'es').split('-')[0];
 const languageMarkets: Record<string,string> = { en:'en-US', fr:'fr-CA', nl:'nl-NL', es:'es-US' };
 const market=markets[normalize(country)]||[entry && ['US','CA','ES'].includes(entry.iso)?language+'-'+entry.iso:languageMarkets[language]||'en-US','wt-wt'];
 const url=new URL(html?'https://html.duckduckgo.com/html/':'https://www.bing.com/search');
 url.searchParams.set('q',query);
 if(html)url.searchParams.set('kl',market[1]);else{url.searchParams.set('format','rss');url.searchParams.set('mkt',market[0]);url.searchParams.set('setlang',market[0]);}
 return url.href;
}
