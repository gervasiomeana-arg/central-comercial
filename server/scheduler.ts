import { normalize } from './sales-director.js';
import { researchGoalProspects } from './prospect-research.js';
import { db } from './db.js';
import {intelligenceCycle} from './intelligence-cycle.js';
import {cloudBatchesEnabled,diagnosticMode} from './execution-role.js';
import { batchWindow, type CommercialBatch } from './batch-window.js';
const batchWindowActive = (phase: CommercialBatch) => batchWindow() === phase;

class CommercialScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  public start(intervalMs = 30000) {
    if (diagnosticMode() || cloudBatchesEnabled()) {
      if (cloudBatchesEnabled() && db.getSchedulerState().isRunning) {
        db.getSchedulerState().isRunning = false;
        db.save();
      }
      return;
    }
    if (this.timer) return;
    const state = db.getSchedulerState();
    state.isRunning = true;
    db.save();
    db.addLog('info', 'sistema', 'Motor de tareas programadas del backend iniciado.', { intervalMs });

    this.timer = setInterval(() => {
      this.tick();
    }, intervalMs);

    // Initial tick after 3s
    setTimeout(() => this.tick(), 3000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const state = db.getSchedulerState();
    state.isRunning = false;
    db.save();
    db.addLog('info', 'sistema', 'Motor de tareas programadas del backend detenido.');
  }

  public async tick(phase?: CommercialBatch) {
    if (diagnosticMode() || db.getSchedulerState().automationsPaused || (!phase && cloudBatchesEnabled())) return false;
    if (this.isProcessing) return false;
    this.isProcessing = true;

    try {
      const state = db.getSchedulerState();
      state.lastRunAt = new Date().toISOString();
      state.nextRunAt = phase ? null : new Date(Date.now() + 30000).toISOString();

      if (state.automationsPaused) {
        // Paused globally by admin
        this.isProcessing = false;
        return;
      }

      if (!phase || phase === 'revisar') db.processLedger();
      if (!phase || phase === 'buscar') db.processSalesDirector();
      for(const campaign of db.getCampaigns()){
        const app=db.getApplicationById(campaign.appId);
        if(app && /voley/i.test(app.slug+' '+app.name)){
          if(/14\s+d[ií]as/i.test(campaign.objective))campaign.objective=campaign.objective.replace(/14\s+d[ií]as/gi,'7 días');
          if(/14\s+d[ií]as/i.test(campaign.messageTemplate))campaign.messageTemplate=campaign.messageTemplate.replace(/14\s+d[ií]as/gi,'7 días');
        }
      }
      if (!phase || phase === 'buscar') {
        await intelligenceCycle();
        if (!phase || batchWindowActive(phase)) await researchGoalProspects();
      }

      // Check tasks due
      const now = new Date();
      const contacts = db.getContacts();
      for (const contact of !phase || phase === 'revisar' ? contacts : []) {
        if (contact.nextFollowUpDate && !['cliente','baja_solicitada','descartado'].includes(contact.status) && contact.permission !== 'revocado') {
          const followUpDate = new Date(contact.nextFollowUpDate);
          if (followUpDate <= now) {
            // Check if there is already a pending task for this follow-up
            const existing = db.getTasks().find(t => t.relatedId === contact.id && t.status === 'pendiente');
            if (!existing) {
              db.saveTask({
                id: `task-followup-${contact.id}-${Date.now()}`,
                title: `Seguimiento comercial programado: ${contact.orgName}`,
                description: `Venció la fecha de próximo contacto programada (${contact.nextFollowUpDate}). Revisar historial del contacto y enviar mensaje o realizar llamada.`,
                priority: 'media',
                category: 'seguimiento',
                relatedType: 'contacto',
                relatedId: contact.id,
                dueDate: contact.nextFollowUpDate,
                status: 'pendiente',
                createdAt: new Date().toISOString()
              });
              db.addLog('info', 'contactos', `Tarea de seguimiento generada para ${contact.orgName}`);
            }
          }
        }
      }

      // Check campaigns requiring connector setup
      const campaigns = db.getCampaigns();
      for (const camp of campaigns) {
        if (camp.status === 'activa') {
          // Re-validate connector status
          const app = db.getApplicationById(camp.appId);
          if (app?.status === 'en_desarrollo' || !app?.campaignsAllowed) {
            camp.status = 'bloqueada_por_configuracion';
            camp.blockingReason = `Aplicación ${app?.name || ''} en desarrollo. Envíos bloqueados.`;
            db.save();
            db.addLog('warning', 'campañas', `Campaña "${camp.name}" bloqueada automáticamente: aplicación en desarrollo.`);
          }
        }
      }

      const goal = db.getSalesGoalReport();
      const marketsWithContacts = new Set(contacts.flatMap(contact => (contact.interestedAppIds || [])
        .map(appId => JSON.stringify([appId,normalize(contact.country).trim()]))));
      for (const campaign of phase === 'revisar' ? [] : campaigns) {
        if(!db.campaignInActiveRun(campaign.id))continue;
        if(goal.goal.directorEnabled && campaign.goalMonth && !marketsWithContacts.has(JSON.stringify([campaign.appId,normalize(campaign.country).trim()])))continue;
        if (campaign.goalMonth && (campaign.goalMonth !== goal.goal.month || !goal.goal.enabled || !goal.remaining || !goal.goal.countries.includes(campaign.country))) continue;
        if (campaign.autoPrepare === true && ['lista', 'activa', 'bloqueada_por_configuracion'].includes(campaign.status)) {
          try { db.prepareCampaignDrafts(campaign.id); }
          catch (error) { db.addLog('error', 'campañas', `No se pudo preparar la campaña ${campaign.name}`, { error: String(error) }); }
        }
      }

      state.activeJobsCount = campaigns.filter(c => c.status === 'activa').length;
      db.save();
      return true;
    } catch (err: any) {
      db.addLog('error', 'sistema', `Error en ciclo del scheduler: ${err.message}`, { error: String(err) });
      if (phase) throw err;
    } finally {
      this.isProcessing = false;
    }
  }
}

export const scheduler = new CommercialScheduler();

