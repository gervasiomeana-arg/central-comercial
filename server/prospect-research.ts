import { resolve4, resolve6, resolveMx } from 'node:dns/promises';
import { invalidEmailDestination, publishedCampaignRecipients } from '../src/email-policy.js';
import { whatsappPhone } from '../src/whatsapp-policy.js';
import { campaignCountryAllowed, mexicoRegions } from './campaign-markets.js';
import {searchRequest} from './discovery-plan.js';
import {campaignStrategyReady} from './sales-director.js';
import { db } from './db.js';
import { accountingDay } from '../src/ledger.js';
import { fetchPublicText, relevantSearchLinks, contactLinks, reviewContactPage, publicUrl } from './public-web.js';
import { normalize, researchQueriesFor } from './sales-director.js';
import type { Contact, ResearchCandidate, ResearchOutcome } from '../src/types.js';

let running=false;
class ResearchQuota extends Error {}
const host=(url:string)=>new URL(url).hostname.toLowerCase().replace(/^www\./,'');
const candidateKey=(candidate:ResearchCandidate)=>{const u=new URL(candidate.url);return `${u.hostname.toLowerCase().replace(/^www\./,'')}${u.pathname.replace(/\/$/,'')||'/'}${u.search}`;};
const reason=(outcome:ResearchOutcome,label:string)=>{outcome.reasons[label]=(outcome.reasons[label]||0)+1;};

async function domainReceivesEmail(email: string) {
  const domain = email.split('@')[1];
  try {
    const records = await resolveMx(domain);
    if (records.length) return records.some(record => record.exchange && record.exchange !== '.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENODATA') return false;
  }
  // SMTP allows delivery to address records when a domain has no MX records.
  const results = await Promise.allSettled([resolve4(domain), resolve6(domain)]);
  return results.some(result => result.status === 'fulfilled' && result.value.length > 0);
}

async function recoverBouncedContact(fetcher: typeof fetchPublicText) {
  const now = new Date();
  const cutoff = now.getTime() - 7 * 86400000;
  const threads = db.getConversations();
  const invalid = new Set(threads.flatMap(thread => thread.messages
    .filter(m => m.channel === 'email' && m.status === 'fallido' && m.approvedRecipient &&
      invalidEmailDestination(m.serviceError || ''))
    .map(m => m.approvedRecipient!.toLowerCase())));
  for (const thread of threads) {
    const contact = db.getContactById(thread.contactId);
    const campaign = thread.campaignId && db.getCampaignById(thread.campaignId);
    const app = db.getApplicationById(thread.appId);
    if (!contact || !campaign || !app || !campaign.autoSendEmail || !campaign.channels.includes('email') ||
        !['lista','activa','bloqueada_por_configuracion'].includes(campaign.status) ||
        !campaignStrategyReady(campaign, app) || !db.campaignInActiveRun(campaign.id) || contact.outreachBasis !== 'public_business_contact' ||
        contact.permission === 'revocado' || ['baja_solicitada','descartado','cliente'].includes(contact.status) ||
        (contact.emailRecoveryCheckedAt && Date.parse(contact.emailRecoveryCheckedAt) > now.getTime() - 86400000)) continue;
    const email = contact.email?.trim().toLowerCase();
    const [message] = thread.messages;
    const failedAt = Date.parse(message?.emailFailureAt || (message?.serviceError?.startsWith('Dominio descartado antes de enviar:') ? message.attemptedAt || '' : ''));
    if (thread.messages.length !== 1 || message.channel !== 'email' || message.direction !== 'outbound' ||
        message.status !== 'fallido' || message.approvedRecipient !== email || !invalid.has(email) ||
        message.replacementMessageId || !Number.isFinite(failedAt) || failedAt < cutoff || failedAt > now.getTime() ||
        threads.some(other => other.contactId === contact.id && other.appId === thread.appId &&
          (other.messages.some(m => m.direction === 'inbound') ||
            (other.id !== thread.id && other.campaignId === thread.campaignId)))) continue;

    let site: URL;
    let source: URL;
    try {
      site = publicUrl(contact.website);
      source = publicUrl(contact.source);
      if (host(site.href) !== host(source.href)) continue;
    } catch { continue; }
    db.saveContact({ ...contact, emailRecoveryCheckedAt: now.toISOString() });
    const queue = [...new Set([source.href, new URL('/', site).href])];
    let context: ResearchCandidate['context'];
    for (let index = 0; index < Math.min(queue.length, 4); index++) {
      const url = queue[index];
      try {
        const page = await fetcher(url);
        if (host(page.url) !== host(site.href)) continue;
        const result = reviewContactPage(page.text, page.url, app, contact.country, now, context, invalid);
        context = result.evidence;
        for (const link of contactLinks(page.text, page.url)) if (!queue.includes(link)) queue.push(link);
        if (result.contact && await saveRecoveredAddress(contact.id, email, result.contact)) return;
      } catch { /* An unavailable page can be reviewed on the next day. */ }
    }
    return;
  }
}

async function saveRecoveredAddress(id: string, original: string, found: Contact) {
  const nextEmail = found.email;
  if (!nextEmail || !await domainReceivesEmail(nextEmail)) return false;
  const latest = db.getContactById(id);
  if (!latest || db.getSchedulerState().automationsPaused || latest.email.trim().toLowerCase() !== original ||
      latest.permission === 'revocado' || ['baja_solicitada','descartado','cliente'].includes(latest.status)) return false;
  db.saveContact({
    ...latest, email: nextEmail,
    emailPublications: [...(latest.emailPublications || []).filter(p => p.url !== found.source), ...(found.emailPublications || [])].slice(-12),
    undeliverableEmail: original, source: found.source, sourceReviewDate: found.sourceReviewDate,
    history: [...(latest.history || []), { id: `recovered-${Date.now()}`, type: 'nota', timestamp: new Date().toISOString(),
      description: `Dirección alternativa publicada por la organización en ${found.source} después de un rebote definitivo.`,
      author: 'Central Comercial' }],
  });
  return true;
}

async function verifyQueuedEmailPublications(fetcher: typeof fetchPublicText) {
  const now = Date.now();
  const pending = new Set(db.getConversations().filter(c => c.campaignId &&
    db.campaignInActiveRun(c.campaignId) && c.messages.some(m =>
      m.channel === 'email' && m.direction === 'outbound' && m.status === 'preparado' && !m.replyToProviderId)).map(c => c.contactId));
  const contacts = db.getContacts().filter(c => pending.has(c.id) && c.outreachBasis === 'public_business_contact' &&
    !publishedCampaignRecipients(c).length && c.permission !== 'revocado' &&
    !['descartado', 'baja_solicitada', 'cliente'].includes(c.status) &&
    (!c.emailPublicationCheckedAt || Date.parse(c.emailPublicationCheckedAt) < now - 86400000));
  contacts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await Promise.allSettled(contacts.slice(0, 4).map(contact => verifyQueuedContact(contact, now, fetcher)));
}

async function verifyQueuedContact(contact: Contact, now: number, fetcher: typeof fetchPublicText) {
  const app = contact.interestedAppIds.map(id => db.getApplicationById(id)).find(Boolean);
  if (!app) return;
  contact.emailPublicationCheckedAt = new Date(now).toISOString();
  db.save();
  try {
    const site = publicUrl(contact.website), source = publicUrl(contact.source);
    if (host(site.href) !== host(source.href)) return;
    const pages = [...new Set([source.href, new URL('/',site).href])];
    let context: ResearchCandidate['context'];
    for (let i = 0; i < Math.min(pages.length, 5); i++) {
      if (db.getSchedulerState().automationsPaused) return;
      const page = await fetcher(pages[i]).catch(() => undefined);
      if (db.getSchedulerState().automationsPaused) return;
      if (!page || host(page.url) !== host(site.href)) continue;
      const result = reviewContactPage(page.text, page.url, app, contact.country, new Date(now), context);
      context = result.evidence;
      for (const link of contactLinks(page.text,page.url)) if (!pages.includes(link)) pages.push(link);
      const latest = db.getContactById(contact.id);
      const entry = result.contact?.emailPublications?.[0];
      if (!latest || host(latest.website) !== host(site.href) || !entry) continue;
      latest.emailPublications = [...(latest.emailPublications || []).filter(item => item.url !== entry.url), entry].slice(-12);
      db.save();
      if (publishedCampaignRecipients(latest).length) return;
    }
  } catch { /* Keep the draft pending when there is insufficient evidence. */ }
}

export async function researchGoalProspects(fetcher:typeof fetchPublicText=fetchPublicText) {
  if(running)return;
  running=true;
  try {
    const report=db.getSalesGoalProgress(), goal=report.goal, state=db.getResearchState(), day=accountingDay();
    if (!goal.enabled || report.paused) return;
    if (goal.sendEmail && report.remaining && fetcher === fetchPublicText) {
      await verifyQueuedEmailPublications(fetcher);
      await recoverBouncedContact(fetcher);
    }
    if (!goal.discoverContacts || db.getSchedulerState().automationsPaused) return;
    if(state.month!==goal.month)Object.assign(state,{month:goal.month,day,requests:0,visited:[],status:'pending',detail:undefined,lastError:undefined});
    if(state.day!==day)Object.assign(state,{day,requests:0,status:'pending',detail:undefined});
    // A spent quota is a scheduling condition, never a network failure.
    if(state.lastError==='Cupo diario de investigación alcanzado.')delete state.lastError;
    if(state.blocked&&state.lastError==='El buscador no devolvió un listado público compatible. Requiere revisión.'){
      delete state.blocked;delete state.lastError;
    }
    if(state.blocked){state.status='error';state.detail=state.lastError||'El proveedor requiere revisión antes de continuar.';db.save();return;}
    
    const campaigns = db.getCampaigns().filter(c => {
      const app = db.getApplicationById(c.appId);
      return c.goalMonth === goal.month && app?.status === 'lista' && app.campaignsAllowed &&
        campaignCountryAllowed(app, c.country) && ['lista','activa','bloqueada_por_configuracion'].includes(c.status) &&
        goal.countries.some(country => normalize(country) === normalize(c.country));
    });
    const remaining=()=>goal.dailyResearchLimit===0?Infinity:goal.dailyResearchLimit-state.requests;
    if(remaining()<=0){
      if(state.status!=='quota'){
        state.status='quota';state.detail='Cupo diario alcanzado. La cola se conserva para mañana.';db.save();
      }
      return;
    }
    const lastAppResearch=new Map<string,string>();
    for(const c of campaigns){
      if(c.lastResearchAt && c.lastResearchAt>(lastAppResearch.get(c.appId)||''))lastAppResearch.set(c.appId,c.lastResearchAt);
    }
    const eligible=campaigns.filter(c=>{
      if(!campaignStrategyReady(c,db.getApplicationById(c.appId)))return false;
      if (c.funeralShiftPilot && c.maxContacts && c.stats.contactsCount >= c.maxContacts) return false;
      if(c.researchDay!==day){c.researchDay=day;c.researchCount=0;c.researchQueriesToday=0;}
      if((c.researchNextAttemptAt||0)>Date.now())return false;
      if(c.researchQueue?.some(item=>(item.retryAt||0)<=Date.now()))return true;
      return ((c.researchSearchFallbackQuery?state.fallbackRetryAt:state.primaryRetryAt)||0)<=Date.now();
    }).sort((a,b)=>(lastAppResearch.get(a.appId)||'').localeCompare(lastAppResearch.get(b.appId)||'')
      || (a.lastResearchAt||'').localeCompare(b.lastResearchAt||''));
    const campaign=eligible[0];
    if(!campaign){
      const detail='Sin consultas disponibles en este ciclo. Las páginas pendientes se conservan.';
      if(state.status!=='waiting'||state.detail!==detail){state.status='waiting';state.detail=detail;db.save();}
      return;
    }
    const app=db.getApplicationById(campaign.appId)!, country=campaign.country;
    // Only generated goal campaigns are migrated. Custom campaign queries stay intact.
    if(campaign.researchQueryVersion!==2){campaign.researchQueries=researchQueriesFor(app,country);campaign.researchQueryVersion=2;campaign.researchQueryIndex=0;}
    const queries=campaign.researchQueries||[];
    if(!queries.length){state.status='error';state.lastError='No hay consultas comerciales definidas para esta aplicación.';db.save();return;}
    campaign.researchQueue ||= [];
    campaign.researchSeenUrls ||= [];
    const queue=campaign.researchQueue, seen=campaign.researchSeenUrls;
    // Canonicalize historical duplicates while preserving the first candidate and its evidence.
    const dedup=new Set<string>();for(let i=queue.length-1;i>=0;i--){try{const k=candidateKey(queue[i]);if(dedup.has(k))queue.splice(i,1);else dedup.add(k);}catch{queue.splice(i,1);}}
    const seenCanonical=new Set<string>();
    for(const entry of seen){
      const value=entry.split('|')[0];
      try{seenCanonical.add(candidateKey({url:value.includes('://')?value:'https://'+value}));}catch{/* Ignore invalid historical entries. */}
    }
    campaign.researchSeenUrls=[...seenCanonical];
    const fetchPage=async(url:string)=>{
      if(remaining()<=0)throw new ResearchQuota('Cupo de páginas alcanzado.');
      state.requests++;campaign.researchCount=(campaign.researchCount||0)+1;campaign.lastResearchAt=new Date().toISOString();state.status='running';db.save();
      return fetcher(url);
    };
    const outcome:ResearchOutcome={at:new Date().toISOString(),query:'',created:0,reused:0,checked:0,reasons:{}};
    const enqueue=(candidate:ResearchCandidate,priority=false)=>{
      try{candidate.url=publicUrl(candidate.url).href;}catch{return;}
      const key=candidateKey(candidate);
      if(!seenCanonical.has(key)&&!queue.some(item=>candidateKey(item)===key)){if(priority)queue.unshift(candidate);else queue.push(candidate);}
    };
    let index=queue.findIndex(item=>(item.retryAt||0)<=Date.now());
    if(index<0){
      const fallback=campaign.researchSearchFallbackQuery;
      const searchIndex=campaign.researchQueryIndex||0;
      const base=queries[searchIndex%queries.length];
      // Rotate geography and search intent after exhausting the initial fixed query set.
      const regions=normalize(country)==='argentina'?['Córdoba','Rosario','Mendoza','Tucumán','Mar del Plata','La Plata','Salta','Neuquén','Bahía Blanca','Santa Fe']:normalize(country)==='brasil'?['São Paulo','Rio de Janeiro','Campinas','Curitiba','Belo Horizonte','Porto Alegre','Recife','Santos']:normalize(country)==='mexico'?mexicoRegions:[];
      const round=Math.floor(searchIndex/queries.length);
      const regionIndex = normalize(country)==='mexico' ? searchIndex - queries.length : round - 1;
      const region=round>0&&regions.length?regions[regionIndex%regions.length]:'';
      const intent=round>regions.length+1?['contacto institucional','email comercial','sitio oficial','asociación regional'][Math.floor(round/Math.max(1,regions.length))%4]:'';
      const query=fallback||[base,region,intent].filter(Boolean).join(' ');outcome.query=query;
      // Advance once per search, including failures; never repeat a single daily query forever.
      if(!fallback){campaign.researchQueryIndex=(campaign.researchQueryIndex||0)+1;campaign.researchQueriesToday=(campaign.researchQueriesToday||0)+1;}
      try{
        const rss=await fetchPage(searchRequest(query,country,Boolean(fallback)));
        if(/anomaly-modal|challenge-form|<title>[^<]*captcha/i.test(rss.text)){state.blocked=true;throw new Error('El buscador requiere verificación humana. No se eludirá.');}
        if(!fallback&&!/<rss|<feed/i.test(rss.text))throw new Error('El buscador no devolvió un listado público compatible.');
        const links=relevantSearchLinks(rss.text,app,country,Boolean(fallback));const previous=queue.length;links.forEach(url=>enqueue({url}));const added=queue.length-previous;
        if(!fallback&&!links.length)campaign.researchSearchFallbackQuery=query;else delete campaign.researchSearchFallbackQuery;
        // A search that returns only previously seen URLs is also exhausted.
        if(!added && !fallback && links.length){campaign.researchSearchFallbackQuery=query;}
        db.addLog('info','contactos',`Consulta pública para ${app.name}: ${links.length} resultados, ${added} enlaces nuevos para revisar; ${links.length-added} repetidos.`,{campaignId:campaign.id,query,provider:fallback?'DuckDuckGo HTML':'Bing RSS'}, false);
        state.lastSuccess=new Date().toISOString();delete state.lastError;
        reason(outcome,added?'Enlaces nuevos pendientes de verificación':links.length?'Resultados repetidos, sin enlaces nuevos':'Consulta sin páginas nuevas de organizaciones');
      }catch(error:any){
        state.lastError=String(error.message);
        if(/bloqueado|verificación humana/i.test(state.lastError))state.blocked=true;
        state.status=state.blocked?'error':remaining()<=0?'quota':'waiting';
        state.detail=state.blocked?state.lastError:remaining()<=0?'Cupo diario alcanzado. La cola se conserva para mañana.':'Una fuente no respondió. Se conservan las páginas pendientes.';
        if(!state.blocked && !fallback)campaign.researchSearchFallbackQuery=query;
        if(fallback)delete campaign.researchSearchFallbackQuery;
        // Back off the failed provider across campaigns. Existing candidate pages can still be reviewed.
        const retryField=fallback?'fallbackRetryAt':'primaryRetryAt';
        if(!state.blocked)state[retryField]=Date.now()+30*60*1000;
        db.addLog('warning','contactos','La consulta pública no pudo completarse.',{campaignId:campaign.id,query,reason:state.lastError});
        return;
      }
      index=queue.findIndex(item=>(item.retryAt||0)<=Date.now());
    }
    // Queued contact pages survive restarts. Each tick processes at most one candidate page.
    if(index>=0&&remaining()>0){
      const candidate=queue[index];
      try{
        const page=await fetchPage(candidate.url);outcome.checked++;
        const rejectedAddresses = new Set(db.getContacts().map(c => c.undeliverableEmail).filter((email): email is string => Boolean(email)));
        const reviewed=reviewContactPage(page.text,page.url,app,country,new Date(),candidate.context,rejectedAddresses);
        db.addLog('info','contactos',`Página pública revisada para ${app.name}: ${reviewed.reason}`,{campaignId:campaign.id,url:page.url}, false);
        if(db.getSchedulerState().automationsPaused){ db.save(); return; }
        queue.splice(index,1);seenCanonical.add(candidateKey(candidate));campaign.researchSeenUrls=[...seenCanonical].slice(-5000);
        reason(outcome,reviewed.reason);
        if(reviewed.contact){
          const contact=reviewed.contact;
          const sameWebsite = (record: typeof contact) => {
            try { return host(record.website) === host(page.url); }
            catch { return false; }
          };
          const existing = db.getContacts().find(c => (contact.email && c.email?.trim().toLowerCase() === contact.email) || sameWebsite(c));
          if(existing){
            const canUpdate = existing.permission !== 'revocado' && !['baja_solicitada', 'descartado'].includes(existing.status);
            if (canUpdate && sameWebsite(existing) && contact.emailPublications?.length) {
              const publications = new Map((existing.emailPublications || []).map(entry => [entry.url, entry]));
              for (const entry of contact.emailPublications) publications.set(entry.url, entry);
              existing.emailPublications = [...publications.values()].slice(-12);
            }
            // Keep all prior contact evidence when filling a newly published address.
            if (canUpdate && !existing.email && contact.email) {
              existing.history ||= [];
              existing.history.push({id:`research-${Date.now()}`,timestamp:new Date().toISOString(),type:'nota',description:`Email publicado verificado en ${contact.source}. Fuente anterior conservada: ${existing.source||'sin fuente'}.`,author:'Central Comercial'});
              existing.email=contact.email;existing.source=contact.source;existing.sourceReviewDate=contact.sourceReviewDate;existing.outreachBasis='public_business_contact';
            }
            if (canUpdate && existing.whatsappConsent?.granted !== false && sameWebsite(existing) && contact.publishedWhatsApp &&
                (!existing.phone?.trim() || whatsappPhone(existing.phone) === contact.phone) &&
                existing.publishedWhatsApp?.number !== contact.phone) {
              existing.phone ||= contact.phone;
              existing.publishedWhatsApp = contact.publishedWhatsApp;
              existing.source ||= contact.source;
              existing.sourceReviewDate ||= contact.sourceReviewDate;
              existing.history ||= [];
              existing.history.push({
                id: `research-whatsapp-${Date.now()}`, timestamp: new Date().toISOString(), type: 'nota',
                description: `Enlace institucional de WhatsApp verificado en ${contact.source}.`, author: 'Central Comercial',
              });
            }
            if (canUpdate && sameWebsite(existing) && contact.funeralShiftEvidence) {
              existing.funeralShiftEvidence = contact.funeralShiftEvidence;
            }
            // Never promote a revoked contact or change its source/permission implicitly.
            if (canUpdate && !existing.interestedAppIds.includes(app.id)) existing.interestedAppIds.push(app.id);
            outcome.reused++;
          }else{db.saveContact(contact);outcome.created++;}
        }
        if (!reviewed.contact?.email || !reviewed.contact.phone || reviewed.contact.emailPublications?.length === 1) {
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
          else{seenCanonical.add(candidateKey(candidate));campaign.researchSeenUrls=[...seenCanonical].slice(-5000);}
          state.status='waiting';state.detail='Una página no pudo verificarse; se continúa con las demás sin inventar contactos.';
        }
      }
    }
    if(index<0){state.status='waiting';state.detail=campaign.researchSearchFallbackQuery?'Los resultados RSS no verificaron actividad y país; se programó una consulta HTML pública alternativa.':'No hubo resultados pertinentes; se continuará con otra consulta dentro del cupo.';}
    if(!outcome.created&&!outcome.reused&&outcome.checked===0)reason(outcome,'Sin contactos nuevos: buscar otro segmento');
    if(!state.blocked&&remaining()<=0){state.status='quota';state.detail='Cupo diario alcanzado. La cola se conserva para mañana.';}
    campaign.researchLastOutcome=outcome;
    db.addLog('info','contactos',`Investigación ${app.name}: ${outcome.created} contactos nuevos, ${outcome.checked} páginas revisadas.`,{campaignId:campaign.id,...outcome,pendingPages:queue.length,requestsToday:state.requests});
  }finally{running=false;}
}
