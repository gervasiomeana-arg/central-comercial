import { db } from './db.js';
import { accountingDay } from '../src/ledger.js';
import { normalize, researchQueriesFor } from './sales-director.js';
import { diagnosticMode } from './execution-role.js';
import { whatsappStatus } from './commercial-whatsapp.js';
import type { Campaign } from '../src/types.js';
import type { AssistantReport, CampaignChatProposal } from '../src/assistant-types.js';

export const campaignChatEnabled = () => process.env.CENTRAL_LOCAL_MODE === 'true' && !diagnosticMode();

export function attachCampaignScope(report: AssistantReport, selectedId: unknown) {
  if (!campaignChatEnabled() || report.appId === 'all') return;
  const selected = typeof selectedId === 'string' ? db.getCampaignById(selectedId) : undefined;
  if (selectedId && (!selected || selected.appId !== report.appId)) throw new Error('Elegí una campaña de la aplicación seleccionada.');
  report.campaignScope = { countries: [...db.getMonthlyGoal().countries] };
  if (selected) {
    const { id, name, country, status, objective, messageTemplate, updatedAt } = selected;
    report.campaignScope.campaign = { id, name, country, status, objective, messageTemplate, revision: updatedAt };
  }
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : undefined;
}

export function validateCampaignProposal(value: unknown, report: AssistantReport): CampaignChatProposal | undefined {
  const scope = report.campaignScope;
  if (!scope || !value || typeof value !== 'object') return;
  const raw = value as Record<string, unknown>;
  const name = clean(raw.name, 120), objective = clean(raw.objective, 600);
  const messageTemplate = clean(raw.messageTemplate, 1800);
  if (messageTemplate && [...messageTemplate.matchAll(/\{([^{}]*)\}/g)].some(match =>
    !['nombre','organizacion','cargo','pais','aplicacion','web'].includes(match[1]))) return;
  if (raw.action === 'create') {
    if (scope.campaign) return;
    const country = scope.countries.find(item => normalize(item) === normalize(clean(raw.country, 60) || ''));
    if (country && name && objective && messageTemplate) return { action:'create', name, country, objective, messageTemplate };
    return;
  }
  const campaign = scope.campaign;
  if (!campaign) return;
  const target = { campaignId:campaign.id, revision:campaign.revision };
  if (raw.action === 'update' && (name || objective || messageTemplate)) return { ...target, action:'update', name, objective, messageTemplate };
  if (raw.action === 'prepare' || raw.action === 'activate' || raw.action === 'pause') return { ...target, action:raw.action };
}

export function applyCampaignProposal(entryId: string, appId: string, proposal: CampaignChatProposal) {
  if (!campaignChatEnabled()) throw new Error('Aplicá los cambios desde Central Comercial en tu PC.');
  const app = db.getApplicationById(appId);
  if (!app || (proposal.action !== 'pause' && (app.status !== 'lista' || !app.campaignsAllowed))) throw new Error('La aplicación debe estar lista y habilitada para campañas.');
  const goal = db.getMonthlyGoal();
  const day = accountingDay();
  if (proposal.action === 'create') {
    const id = 'chat-' + entryId;
    if (db.getCampaignById(id)) return 'Campaña guardada como borrador.';
    const { name, country, objective, messageTemplate } = proposal;
    if (!name || !country || !objective || !messageTemplate || !goal.countries.includes(country)) throw new Error('El país debe estar en el objetivo mensual vigente.');
    const end = new Date(day + 'T12:00:00Z');
    end.setUTCMonth(end.getUTCMonth()+1, 0);
    const campaign: Campaign = {
      id, appId, name, country, objective, messageTemplate, chatManaged:true, goalMonth:goal.month,
      language:normalize(country)==='brasil'?'pt-BR':'es', segment:'', channels:['email'], researchQueries:researchQueriesFor(app,country),
      researchQueryVersion:2, researchDiscoveryVersion:3, followUpTemplates:[], timezone:'America/Argentina/Buenos_Aires',
      sendWindowStart:'09:00', sendWindowEnd:'18:00', dailyLimit:goal.dailyEmailLimit, startDate:day, endDate:end.toISOString().slice(0,10),
      maxFollowUps:0, followUpIntervalDays:4, stopCriteria:['respuesta_recibida','solicitud_baja'],
      mode:'revision_previa', status:'borrador', allowPublicEmail:false, autoPrepare:false, autoSendEmail:false,
      stats:{contactsCount:0,messagesPending:0,messagesSent:0,messagesFailed:0,messagesUnknown:0,responsesReceived:0},
      createdAt:'', updatedAt:'',
    };
    db.saveCampaign(campaign);
    return 'Campaña guardada como borrador. Podés seguir ajustándola o pedir que se active.';
  }

  const existing = proposal.campaignId && db.getCampaignById(proposal.campaignId);
  if (!existing || existing.appId !== appId || existing.updatedAt !== proposal.revision) throw new Error('La campaña cambió desde que se hizo la propuesta. Pedí una nueva.');
  const campaign = { ...existing };
  if (proposal.action === 'prepare') {
    const { created, blockedReason } = db.prepareCampaignDrafts(campaign.id);
    if (blockedReason) throw new Error(blockedReason);
    return created ? `Se prepararon ${created} mensajes en la campaña.` : 'No se prepararon mensajes nuevos para los contactos elegibles.';
  }
  if (proposal.action === 'update') {
    if (proposal.name) campaign.name = proposal.name;
    if (proposal.objective) campaign.objective = proposal.objective;
    if (proposal.messageTemplate) campaign.messageTemplate = proposal.messageTemplate;
  }
  if (proposal.action === 'pause') campaign.status='pausada';
  if (proposal.action === 'activate') {
    if (!goal.enabled || db.getSchedulerState().automationsPaused) throw new Error('El objetivo mensual debe estar activo y las automatizaciones habilitadas.');
    if (!db.campaignInActiveRun(campaign.id)) throw new Error('La campaña está fuera del objetivo comercial vigente.');
    if (day < campaign.startDate || day > campaign.endDate || campaign.status === 'finalizada') throw new Error('La campaña está fuera de su período vigente.');
    campaign.status='activa';
    if (campaign.chatManaged) { campaign.autoPrepare=true; campaign.autoSendEmail=true; }
  }
  const result = db.saveCampaign(campaign, whatsappStatus().ready);
  if (result.error) throw new Error(result.error);
  if (proposal.action === 'activate') return result.campaign.status==='activa'
    ? 'Campaña activada. Los canales procesarán los mensajes elegibles según la configuración de la campaña.'
    : (result.campaign.blockingReason || 'La campaña quedó bloqueada por configuración.');
  return proposal.action==='pause' ? 'Campaña pausada.' : 'Cambios guardados en la campaña. Los mensajes ya preparados conservan su texto.';
}
