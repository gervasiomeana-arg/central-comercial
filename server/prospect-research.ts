import { isOpenVoley, volleyballMediaDomain, volleyballRecipientAllowed } from './volleyball-outreach.js';
import { Resolver } from 'node:dns/promises';
import { emailDomainsWithDeliveryProblems, recoverableEmailFailure, normalizeContactEmail, ownerEmailCorrection, publishedCampaignRecipients } from '../src/email-policy.js';
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
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  try {
    const records = await resolver.resolveMx(email.split('@')[1]);
    return records.some(record => record.exchange && record.exchange !== '.');
  } catch { return false; }
}

async function recoverBouncedContacts(fetcher: typeof fetchPublicText) {
  const now = new Date();
  const threads = db.getConversations();
  const blockedDomains = emailDomainsWithDeliveryProblems(threads.flatMap(thread => thread.messages), now.getTime());
  let reviewedCount = 0;
  const invalid = new Set(threads.flatMap(thread => thread.messages
    .filter(m => m.channel === 'email' && m.status === 'fallido' && m.approvedRecipient &&
      recoverableEmailFailure(m.serviceError || '', m.emailDeliveryStatus))
    .map(m => normalizeContactEmail(m.approvedRecipient!))));
  for (const thread of threads) {
    if (reviewedCount >= 3 || db.getSchedulerState().automationsPaused) break;
    const contact = db.getContactById(thread.contactId);
    const campaign = thread.campaignId && db.getCampaignById(thread.campaignId);
    const app = db.getApplicationById(thread.appId);
    if (!contact || !campaign || !app || !campaign.autoSendEmail || !campaign.channels.includes('email') ||
        !['lista','activa','bloqueada_por_configuracion'].includes(campaign.status) ||
        !campaignStrategyReady(campaign, app) || !db.campaignInActiveRun(campaign.id) || contact.outreachBasis !== 'public_business_contact' ||
        contact.permission === 'revocado' || ['baja_solicitada','descartado','cliente'].includes(contact.status) ||
        (contact.emailRecoveryCheckedAt && Date.parse(contact.emailRecoveryCheckedAt) > now.getTime() - 86400000)) continue;
    const original = normalizeContactEmail(contact.email || '');
    const related = threads.filter(other => other.contactId === contact.id && other.appId === thread.appId);
    const activeMessages = related.filter(other => other.campaignId === campaign.id).flatMap(other => other.messages);
    const failedRecipient = thread.messages.find(message => message.channel === 'email' && message.direction === 'outbound' &&
      message.status === 'fallido' && !message.replyToProviderId && !message.replacementMessageId &&
      message.approvedRecipient && invalid.has(normalizeContactEmail(message.approvedRecipient)) &&
      (message.emailFailureAt || message.attemptedAt))?.approvedRecipient;
    if (!failedRecipient || related.some(other => other.messages.some(message => message.direction === 'inbound')) ||
        activeMessages.some(message => message.status !== 'fallido' && message.reviewStatus !== 'rejected')) continue;
    const excluded = new Set(invalid);
    for (const message of related.flatMap(other => other.messages)) {
      if (message.channel === 'email' && message.approvedRecipient) excluded.add(normalizeContactEmail(message.approvedRecipient));
    }
    if (original && !excluded.has(original) && !blockedDomains.has(original.split('@')[1]) &&
        publishedCampaignRecipients(contact).includes(original)) continue;

    let site: URL;
    let source: URL;
    try {
      site = publicUrl(contact.website);
      source = publicUrl(contact.source);
      if (host(site.href) !== host(source.href)) continue;
    } catch { continue; }
    reviewedCount++;
    db.saveContact({ ...contact, emailRecoveryCheckedAt: now.toISOString() });
    const queue = [...new Set([source.href, new URL('/', site).href])];
    let context: ResearchCandidate['context'];
    const publications = new Map<string, { url: string; email: string }>();
    for (let index = 0; index < Math.min(queue.length, 5); index++) {
      const url = queue[index];
      try {
        const page = await fetcher(url);
        if (host(page.url) !== host(site.href)) continue;
        if (db.getSchedulerState().automationsPaused) return;
        const result = reviewContactPage(page.text, page.url, app, contact.country, now, context, excluded, blockedDomains);
        context = result.evidence;
        for (const link of contactLinks(page.text, page.url, isOpenVoley(app))) if (!queue.includes(link)) queue.push(link);
        const entry = result.contact?.emailPublications?.[0];
        if (!entry || !result.contact) continue;
        const pageKey = new URL(entry.url).pathname.replace(/\/+$/, '') || '/';
        publications.set(pageKey, entry);
        if ([...publications.values()].filter(publication => publication.email === entry.email).length >= 2 &&
            await saveRecoveredAddress(contact.id, original, normalizeContactEmail(failedRecipient), result.contact, [...publications.values()])) break;
      } catch { /* An unavailable page can be reviewed on the next day. */ }
    }
  }
}

async function saveRecoveredAddress(id: string, original: string, rejected: string, found: Contact, publications: NonNullable<Contact['emailPublications']>) {
  const nextEmail = found.email;
  if (!nextEmail || !await domainReceivesEmail(nextEmail)) return false;
  const latest = db.getContactById(id);
  if (!latest || db.getSchedulerState().automationsPaused || normalizeContactEmail(latest.email || '') !== original ||
      latest.permission === 'revocado' || ['baja_solicitada','descartado','cliente'].includes(latest.status)) return false;
  db.saveContact({
    ...latest, email: nextEmail,
    emailPublications: publications.filter(entry => entry.email === nextEmail),
    undeliverableEmail: rejected, source: found.source, sourceReviewDate: found.sourceReviewDate,
    history: [...(latest.history || []), { id: `recovered-${Date.now()}`, type: 'nota', timestamp: new Date().toISOString(),
      description: `Dirección alternativa encontrada en dos páginas de la organización después de un rebote definitivo.`,
      author: 'Central Comercial' }],
  });
  return true;
}

async function verifyQueuedEmailPublications(fetcher: typeof fetchPublicText) {
  const now = Date.now();
  const pending = new Set(db.getConversations().filter(c => c.campaignId &&
    db.campaignInActiveRun(c.campaignId) && c.messages.some(m =>
      m.channel === 'email' && m.direction === 'outbound' && ['preparado', 'pendiente'].includes(m.status) && !m.replyToProviderId && !m.attemptedAt && m.reviewStatus !== 'rejected')).map(c => c.contactId));
  const contacts = db.getContacts().filter(c => pending.has(c.id) && c.outreachBasis === 'public_business_contact' &&
    !publishedCampaignRecipients(c).some(email => email !== c.undeliverableEmail) && c.permission !== 'revocado' &&
    !['descartado', 'baja_solicitada', 'cliente'].includes(c.status) &&
    (!c.emailPublicationCheckedAt || Date.parse(c.emailPublicationCheckedAt) < now - 86400000));
  contacts.sort((a, b) => (a.emailPublicationCheckedAt || '').localeCompare(b.emailPublicationCheckedAt || '') || a.createdAt.localeCompare(b.createdAt));
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
      for (const link of contactLinks(page.text,page.url,isOpenVoley(app))) if (!pages.includes(link)) pages.push(link);
      const latest = db.getContactById(contact.id);
      const entry = result.contact?.emailPublications?.[0];
      if (!latest || host(latest.website) !== host(site.href) || !entry ||
          (latest.volleyballCoach && entry.email !== normalizeContactEmail(latest.email))) continue;
      latest.emailPublications = [...(latest.emailPublications || []).filter(item => item.url !== entry.url), entry].slice(-12);
      db.save();
      if (publishedCampaignRecipients(latest).some(email => email !== latest.undeliverableEmail)) return;
    }
  } catch { /* Keep the draft pending when there is insufficient evidence. */ }
}

async function reviewExistingVolleyballContact(fetcher: typeof fetchPublicText) {
  const app = db.getApplications().find(isOpenVoley);
  if (!app?.campaignsAllowed) return;
  const contacts = db.getContacts();
  const candidate = contacts.filter(contact => contact.interestedAppIds.includes(app.id) && contact.website &&
    contact.permission !== 'revocado' && !['cliente', 'baja_solicitada', 'descartado'].includes(contact.status) &&
    !volleyballMediaDomain(contact.email?.split('@').pop() || '') && !volleyballRecipientAllowed(app, contact) &&
    (!contact.volleyballCheckedAt || Date.parse(contact.volleyballCheckedAt) <= Date.now() - 7 * 86400000))
    .sort((a, b) => (a.volleyballCheckedAt || '').localeCompare(b.volleyballCheckedAt || ''))[0];
  if (!candidate) return;
  candidate.volleyballCheckedAt = new Date().toISOString();
  db.save();
  try {
    const site = publicUrl(candidate.website);
    const pages = [new URL('/', site).href];
    if (candidate.source && host(candidate.source) === host(site.href) && !pages.includes(candidate.source)) pages.unshift(candidate.source);
    let context: ResearchCandidate['context'];
    for (let i = 0; i < pages.length && i < 3; i++) {
      if (db.getSchedulerState().automationsPaused) return;
      const page = await fetcher(pages[i]).catch(() => undefined);
      if (!page || host(page.url) !== host(site.href)) continue;
      const reviewed = reviewContactPage(page.text, page.url, app, candidate.country, new Date(), context);
      context = reviewed.evidence;
      for (const link of contactLinks(page.text, page.url, true)) if (!pages.includes(link)) pages.push(link);
      const verified = reviewed.contact;
      const latest = db.getContactById(candidate.id);
      if (!verified?.volleyballSource || !latest || latest.website !== candidate.website || db.getSchedulerState().automationsPaused) continue;
      const sameEmail = verified.email && normalizeContactEmail(latest.email || '') === verified.email;
      const samePhone = verified.phone && whatsappPhone(latest.phone || '') === verified.phone;
      if (!(sameEmail || samePhone) || (latest.email && !sameEmail) || (latest.phone && !samePhone)) continue;
      latest.volleyballSource = verified.volleyballSource;
      latest.volleyballCoach = verified.volleyballCoach;
      db.save();
      return;
    }
  } catch { /* Keep the contact out of promotions until the source can be verified. */ }
}

export async function researchGoalProspects(fetcher:typeof fetchPublicText=fetchPublicText) {
  if(running)return;
  running=true;
  try {
    const report=db.getSalesGoalProgress(), goal=report.goal, state=db.getResearchState(), day=accountingDay();
    if (!goal.enabled || report.paused) return;
    if (goal.sendEmail && report.remaining && fetcher === fetchPublicText) {
      await verifyQueuedEmailPublications(fetcher);
      await recoverBouncedContacts(fetcher);
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
    if (report.remaining && remaining() > 1 && fetcher === fetchPublicText) {
      await reviewExistingVolleyballContact(async url => {
        if (remaining() <= 1) throw new ResearchQuota('Cupo de páginas alcanzado.');
        state.requests++;
        db.save();
        return fetcher(url);
      });
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
          const foundEmail = ownerEmailCorrection(contact.email) || normalizeContactEmail(contact.email);
          const existing = db.getContacts().find(c => contact.volleyballCoach || c.volleyballCoach
            ? Boolean(contact.volleyballCoach && c.volleyballCoach && c.source === contact.source)
            : Boolean((foundEmail && normalizeContactEmail(c.email || '') === foundEmail) || sameWebsite(c)));
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
            if (canUpdate && sameWebsite(existing) && contact.volleyballSource &&
                ((!existing.email || normalizeContactEmail(existing.email) === contact.email) &&
                 (!existing.phone || whatsappPhone(existing.phone) === contact.phone))) {
              existing.volleyballSource = contact.volleyballSource;
            }
            if (canUpdate && sameWebsite(existing) && contact.funeralShiftEvidence) {
              existing.funeralShiftEvidence = contact.funeralShiftEvidence;
            }
            // Never promote a revoked contact or change its source/permission implicitly.
            if (canUpdate && !existing.interestedAppIds.includes(app.id)) existing.interestedAppIds.push(app.id);
            if (ownerEmailCorrection(existing.email)) db.saveContact(existing);
            outcome.reused++;
          }else{db.saveContact(contact);outcome.created++;}
        }
        if (!reviewed.contact?.email || !reviewed.contact.phone || reviewed.contact.emailPublications?.length === 1) {
          const context=reviewed.evidence;
          if(!context.topicVerified && !candidate.context && new URL(page.url).pathname!=='/') {enqueue({url:new URL('/',page.url).href,context,returnTo:page.url},true);}
          if(context.topicVerified && !reviewed.contact?.volleyballCoach){
          for(const url of contactLinks(page.text,page.url,isOpenVoley(app)).reverse())if(url!==page.url)enqueue({url,context},true);
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
