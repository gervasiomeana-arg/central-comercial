import {searchRequest} from './discovery-plan.js';
import {campaignStrategyReady} from './sales-director.js';
import { db } from './db.js';
import { accountingDay } from '../src/ledger.js';
import { fetchPublicText, relevantSearchLinks, contactLinks, reviewContactPage, publicUrl } from './public-web.js';
import { normalize, researchQueriesFor } from './sales-director.js';
import type { ResearchCandidate, ResearchOutcome } from '../src/types.js';

let running=false;
class ResearchQuota extends Error {}
const host=(url:string)=>new URL(url).hostname.toLowerCase().replace(/^www\./,'');
const candidateKey=(candidate:ResearchCandidate)=>`${candidate.url}|${candidate.context?.topicVerified?'topic':''}|${candidate.context?.countryVerified?'country':''}`;
const reason=(outcome:ResearchOutcome,label:string)=>{outcome.reasons[label]=(outcome.reasons[label]||0)+1;};

export async function researchGoalProspects(fetcher:typeof fetchPublicText=fetchPublicText) {
  if(running)return;
  running=true;
  try {
    const report=db.getSalesGoalReport(), goal=report.goal, state=db.getResearchState(), day=accountingDay();
    if(!goal.enabled||!goal.discoverContacts||report.paused)return;
    if(state.month!==goal.month)Object.assign(state,{month:goal.month,day,requests:0,visited:[],status:'pending',detail:undefined,lastError:undefined});
    if(state.day!==day)Object.assign(state,{day,requests:0,status:'pending',detail:undefined});
    // A spent quota is a scheduling condition, never a network failure.
    if(state.lastError==='Cupo diario de investigación alcanzado.')delete state.lastError;
    if(state.blocked){state.status='error';state.detail=state.lastError||'El proveedor requiere revisión antes de continuar.';db.save();return;}
    
    const campaigns=db.getCampaigns().filter(c=>db.campaignInActiveRun(c.id)&&c.goalMonth===goal.month&&goal.countries.some(country=>normalize(country)===normalize(c.country))&&['lista','activa','bloqueada_por_configuracion'].includes(c.status)&&db.getApplicationById(c.appId)?.status==='lista'&&db.getApplicationById(c.appId)?.campaignsAllowed);
    const cap=Number.POSITIVE_INFINITY;
    const eligible=campaigns.filter(c=>{
      if(!campaignStrategyReady(c,db.getApplicationById(c.appId)))return false;
      if(c.researchDay!==day){c.researchDay=day;c.researchCount=0;c.researchQueriesToday=0;}
      if((c.researchNextAttemptAt||0)>Date.now())return false;
      const used=new Set(db.getConversations().filter(thread=>thread.campaignId===c.id).map(thread=>thread.contactId));
      const needed=Number.POSITIVE_INFINITY; // Max contacts governs outreach, not discovery.
      if(!needed)return false;
      const available=db.getContacts().filter(contact=>!used.has(contact.id)&&contact.interestedAppIds?.includes(c.appId)&&normalize(contact.country||'')===normalize(c.country)&&normalize(contact.language||'')===normalize(c.language)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email||'')&&contact.source&&Number.isFinite(Date.parse(contact.sourceReviewDate))&&(contact.permission==='autorizado'||(contact.permission==='desconocido'&&c.allowPublicEmail&&contact.outreachBasis==='public_business_contact'))&&Date.parse(contact.sourceReviewDate)<=Date.now()&&!['cliente','descartado','baja_solicitada'].includes(contact.status));
      return true; // Research continues independently of existing outreach-ready contacts.
    }).sort((a,b)=>(a.lastResearchAt||'').localeCompare(b.lastResearchAt||''));
    const campaign=eligible[0];
    if(!campaign){state.status='waiting';state.detail=`Sin tarea elegible: ${campaigns.filter(c=>(c.researchNextAttemptAt||0)>Date.now()).length} campañas en espera. Páginas revisadas hoy: ${state.requests}, sin límite interno.`;db.save();return;}
    const app=db.getApplicationById(campaign.appId)!, country=campaign.country;
    // Only generated goal campaigns are migrated. Custom campaign queries stay intact.
    if(campaign.researchQueryVersion!==2){campaign.researchQueries=researchQueriesFor(app,country);campaign.researchQueryVersion=2;campaign.researchQueryIndex=0;}
    const queries=campaign.researchQueries||[];
    if(!queries.length){state.status='error';state.lastError='No hay consultas comerciales definidas para esta aplicación.';db.save();return;}
    campaign.researchQueue ||= [];
    campaign.researchSeenUrls ||= [];
    const queue=campaign.researchQueue, seen=campaign.researchSeenUrls;
    const remaining=()=>Number.POSITIVE_INFINITY;
    const fetchPage=async(url:string)=>{
      if(remaining()<=0)throw new ResearchQuota('Cupo de páginas alcanzado.');
      state.requests++;campaign.researchCount=(campaign.researchCount||0)+1;campaign.lastResearchAt=new Date().toISOString();state.status='running';db.save();
      return fetcher(url);
    };
    const outcome:ResearchOutcome={at:new Date().toISOString(),query:'',created:0,reused:0,checked:0,reasons:{}};
    const enqueue=(candidate:ResearchCandidate,priority=false)=>{
      try{candidate.url=publicUrl(candidate.url).href;}catch{return;}
      const key=candidateKey(candidate);
      if(!seen.includes(key)&&!queue.some(item=>candidateKey(item)===key)){if(priority)queue.unshift(candidate);else queue.push(candidate);}
    };
    let index=queue.findIndex(item=>(item.retryAt||0)<=Date.now());
    if(index<0){
      if(remaining()<1){state.status='waiting';state.detail='Consultas de hoy terminadas; se conserva la cola para continuar sin repetir búsquedas.';campaign.researchNextAttemptAt=Date.now()+60*1000;db.save();return;}
      const fallback=campaign.researchSearchFallbackQuery;
      const searchIndex=campaign.researchQueryIndex||0;
      const base=queries[searchIndex%queries.length];
      // Rotate geography and search intent after exhausting the initial fixed query set.
      const regions=normalize(country)==='argentina'?['Córdoba','Rosario','Mendoza','Tucumán','Mar del Plata','La Plata','Salta','Neuquén','Bahía Blanca','Santa Fe']:normalize(country)==='brasil'?['São Paulo','Rio de Janeiro','Campinas','Curitiba','Belo Horizonte','Porto Alegre','Recife','Santos']:normalize(country)==='mexico'?['Ciudad de México','Guadalajara','Monterrey','Puebla','Mérida','Querétaro']:[];
      const round=Math.floor(searchIndex/queries.length);
      const region=round>0&&regions.length?regions[(round-1)%regions.length]:'';
      const intent=round>regions.length+1?['contacto institucional','email comercial','sitio oficial','asociación regional'][Math.floor(round/Math.max(1,regions.length))%4]:'';
      const query=fallback||[base,region,intent].filter(Boolean).join(' ');outcome.query=query;
      // Advance once per search, including failures; never repeat a single daily query forever.
      if(!fallback){campaign.researchQueryIndex=(campaign.researchQueryIndex||0)+1;campaign.researchQueriesToday=(campaign.researchQueriesToday||0)+1;}db.save();
      try{
        const rss=await fetchPage(searchRequest(query,country,Boolean(fallback)));
        if(!fallback&&!/<rss|<feed/i.test(rss.text)){state.blocked=true;throw new Error('El buscador no devolvió un listado público compatible. Requiere revisión.');}
        if(fallback&&/captcha|anomaly-modal|challenge-form/i.test(rss.text)){state.blocked=true;throw new Error('El buscador requiere verificación humana. No se eludirá.');}
        const links=relevantSearchLinks(rss.text,app,country,Boolean(fallback));const previous=queue.length;links.forEach(url=>enqueue({url}));const added=queue.length-previous;
        if(!fallback&&!links.length)campaign.researchSearchFallbackQuery=query;else delete campaign.researchSearchFallbackQuery;
        // A search that returns only previously seen URLs is also exhausted.
        if(!added && !fallback && links.length){campaign.researchSearchFallbackQuery=query;}
        db.addLog('info','contactos',`Consulta pública para ${app.name}: ${links.length} resultados, ${added} enlaces nuevos para revisar; ${links.length-added} repetidos.`,{campaignId:campaign.id,query,provider:fallback?'DuckDuckGo HTML':'Bing RSS'});
        state.lastSuccess=new Date().toISOString();delete state.lastError;
        reason(outcome,added?'Enlaces nuevos pendientes de verificación':links.length?'Resultados repetidos, sin enlaces nuevos':'Consulta sin páginas nuevas de organizaciones');
      }catch(error:any){state.status='error';state.lastError=String(error.message);if(/bloqueado|requiere revisión/i.test(error.message))state.blocked=true;campaign.researchNextAttemptAt=Date.now()+30*60*1000;db.addLog('warning','contactos','La consulta pública no pudo completarse.',{campaignId:campaign.id,query,reason:error.message});db.save();return;}
      index=queue.findIndex(item=>(item.retryAt||0)<=Date.now());
    }
    // One page per cycle: queued contact pages survive quota exhaustion and restarts.
    if(index>=0&&remaining()>0){
      const candidate=queue[index];
      try{
        const page=await fetchPage(candidate.url);outcome.checked++;
        const reviewed=reviewContactPage(page.text,page.url,app,country,new Date(),candidate.context);
        db.addLog('info','contactos',`Página pública revisada para ${app.name}: ${reviewed.reason}`,{campaignId:campaign.id,url:page.url});
        if(!db.campaignInActiveRun(campaign.id)||db.getSchedulerState().automationsPaused)return;
        queue.splice(index,1);seen.push(candidateKey(candidate));campaign.researchSeenUrls=seen.slice(-1000);
        reason(outcome,reviewed.reason);
        if(reviewed.contact){
          const contact=reviewed.contact;
          const existing=db.getContacts().find(c=>(contact.email&&c.email?.trim().toLowerCase()===contact.email)||(c.website&&(()=>{try{return host(c.website)===host(page.url);}catch{return false;}})()));
          if(existing){
            // Keep all prior contact evidence when filling a newly published address.
            if(!existing.email && contact.email && existing.permission!=='revocado' && !['baja_solicitada','descartado'].includes(existing.status)) {
              existing.history ||= [];
              existing.history.push({id:`research-${Date.now()}`,timestamp:new Date().toISOString(),type:'nota',description:`Email publicado verificado en ${contact.source}. Fuente anterior conservada: ${existing.source||'sin fuente'}.`,author:'Central Comercial'});
              existing.email=contact.email;existing.source=contact.source;existing.sourceReviewDate=contact.sourceReviewDate;existing.outreachBasis='public_business_contact';
            }
            // Never promote a revoked contact or change its source/permission implicitly.
            if(existing.permission!=='revocado'&&!['baja_solicitada','descartado'].includes(existing.status)&&!existing.interestedAppIds.includes(app.id))existing.interestedAppIds.push(app.id);
            outcome.reused++;
          }else{db.saveContact(contact);outcome.created++;}
        }
        if(!reviewed.contact?.email){
          const context=reviewed.evidence;
          if(!context.topicVerified && !candidate.context && new URL(page.url).pathname!=='/') {enqueue({url:new URL('/',page.url).href,context,returnTo:page.url},true);}
          if(context.topicVerified){
          for(const url of contactLinks(page.text,page.url).reverse())if(url!==page.url)enqueue({url,context},true);
          const root=new URL('/',page.url).href;
          if(page.url!==root && !candidate.context)enqueue({url:root,context,returnTo:page.url},true);
          if(candidate.returnTo&&context.topicVerified&&context.countryVerified)enqueue({url:candidate.returnTo,context},true);
          }
        }
        if(!state.blocked){state.status=outcome.created||outcome.reused?'ready':'waiting';state.detail=`${outcome.checked} página revisada; ${outcome.created} contactos nuevos. Pendientes: ${queue.length}.`;}
      }catch(error:any){
        if(error instanceof ResearchQuota){state.status='quota';state.detail='Cupo alcanzado. La página pendiente no se descarta.';}
        else{
          outcome.checked++;reason(outcome,`Página no accesible: ${String(error.message).slice(0,180)}`);queue.splice(index,1);
          if(!/bloqueado/i.test(error.message)&&(candidate.attempts||0)<1)queue.push({...candidate,attempts:1,retryAt:Date.now()+6*60*60*1000});
          else{seen.push(candidateKey(candidate));campaign.researchSeenUrls=seen.slice(-1000);}
          state.status='waiting';state.detail='Una página no pudo verificarse; se continúa con las demás sin inventar contactos.';
        }
      }
    }
    if(index<0){state.status='waiting';state.detail=campaign.researchSearchFallbackQuery?'Los resultados RSS no verificaron actividad y país; se programó una consulta HTML pública alternativa.':'No hubo resultados pertinentes; se continuará con otra consulta dentro del cupo.';}
    if(!outcome.created&&!outcome.reused&&outcome.checked===0)reason(outcome,'Sin contactos nuevos: buscar otro segmento');
    campaign.researchLastOutcome=outcome;
    db.addLog('info','contactos',`Investigación ${app.name}: ${outcome.created} contactos nuevos, ${outcome.checked} páginas revisadas.`,{campaignId:campaign.id,...outcome,pendingPages:queue.length,requestsToday:state.requests});
    db.save();
  }finally{running=false;}
}
