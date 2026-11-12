import { db } from './db.js';
import { accountingDay } from '../src/ledger.js';
import { fetchPublicText, searchLinks, contactLinks, extractContact } from './public-web.js';

let running = false;
export async function researchGoalProspects() {
  if (running) return;
  running = true;
  try {
    const report = db.getSalesGoalReport(), goal = report.goal;
    if (!goal.enabled || !goal.discoverContacts || goal.targetClients < 1 || report.remaining === 0 || report.paused) return;
    const state = db.getResearchState(), day = accountingDay();
    if (state.month !== goal.month) Object.assign(state, { month: goal.month, day, requests: 0, visited: [], blocked: false, lastError: undefined });
    if (state.day !== day) Object.assign(state, { day, requests: 0 });
    if (state.blocked || state.requests >= goal.dailyResearchLimit) return;
    const campaigns = db.getCampaigns().filter(c => db.campaignInActiveRun(c.id) && (c.maxContacts === undefined || db.getConversations().filter(conv=>conv.campaignId===c.id).length<c.maxContacts) && c.goalMonth === goal.month && goal.countries.includes(c.country) && ['lista', 'activa', 'bloqueada_por_configuracion'].includes(c.status) && c.researchQueries?.length && db.getApplicationById(c.appId)?.status === 'lista');
    const cap = Math.max(3, Math.ceil(goal.dailyResearchLimit / Math.max(1, campaigns.length)));
    const campaign = campaigns.filter(c => c.researchDay !== day || (c.researchCount || 0) < cap).sort((a, b) => (a.lastResearchAt || '').localeCompare(b.lastResearchAt || ''))[0];
    if (!campaign) return;
    if (campaign.researchDay !== day) { campaign.researchDay = day; campaign.researchCount = 0; }
    const app = db.getApplicationById(campaign.appId)!;
    const queries = campaign.researchQueries!;
    const query = queries[(Number(day.slice(-2)) - 1) % queries.length];
    const country = goal.countries.find(c => query.endsWith(c)) || goal.countries[0];
    const fetchPage = async (url: string) => {
      if (state.requests >= goal.dailyResearchLimit || (campaign.researchCount || 0) >= cap) throw new Error('Cupo diario de investigación alcanzado.');
      state.requests++; campaign.researchCount = (campaign.researchCount || 0) + 1; campaign.lastResearchAt = new Date().toISOString(); db.save();
      return fetchPublicText(url);
    };
    let rss;
    try { rss = await fetchPage(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`); }
    catch (error: any) { state.lastError = error.message; if (/bloqueado/.test(error.message)) state.blocked = true; db.addLog('warning', 'contactos', 'La búsqueda pública no pudo completarse.', { reason: error.message }); db.save(); return; }
    const links = searchLinks(rss.text);
    if (!/<rss|<feed/i.test(rss.text)) { state.lastError = 'El buscador no devolvió un listado público compatible. La búsqueda queda detenida para revisión.'; state.blocked = true; db.save(); return; }
    state.lastSuccess = new Date().toISOString(); delete state.lastError;
    let created = 0;
    for (const link of links) {
      const host = new URL(link).hostname.replace(/^www\./, '');
      if (state.visited.includes(host)) continue;
      if (state.requests >= goal.dailyResearchLimit || (campaign.researchCount || 0) >= cap) break;
      state.visited.push(host); state.visited = state.visited.slice(-1000); db.save();
      try {
        const homepage = await fetchPage(link);
        let contact = extractContact(homepage.text, homepage.url, app, country);
        if (!contact && state.requests < goal.dailyResearchLimit && (campaign.researchCount || 0) < cap) {
          for (const page of contactLinks(homepage.text, homepage.url)) {
            const result = await fetchPage(page); contact = extractContact(result.text, result.url, app, country); if (contact) break;
          }
        }
        if (!contact) continue;
        const existing = db.getContacts().find(c => (contact!.email && c.email.trim().toLowerCase() === contact!.email) || (c.website && (() => { try { return new URL(c.website).hostname.replace(/^www\./, '') === host; } catch { return false; } })()));
        if (existing) {
          if (!existing.interestedAppIds.includes(app.id)) { existing.interestedAppIds.push(app.id); db.save(); }
          continue;
        }
        db.saveContact(contact); created++;
      } catch (error: any) { state.lastError = error.message; }
    }
    db.addLog('info', 'contactos', `Investigación ${app.name}: ${created} contactos públicos nuevos verificados.`, { campaignId: campaign.id, query, country, requests: campaign.researchCount });
    db.save();
  } finally { running = false; }
}
