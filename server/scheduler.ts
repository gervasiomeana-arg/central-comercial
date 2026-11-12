import { db } from './db.js';

class CommercialScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  public start(intervalMs = 30000) {
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

  public async tick() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const state = db.getSchedulerState();
      state.lastRunAt = new Date().toISOString();
      state.nextRunAt = new Date(Date.now() + 30000).toISOString();

      if (state.automationsPaused) {
        // Paused globally by admin
        this.isProcessing = false;
        return;
      }

      // Check tasks due
      const now = new Date();
      const contacts = db.getContacts();
      for (const contact of contacts) {
        if (contact.nextFollowUpDate && contact.status !== 'cliente' && contact.status !== 'baja_solicitada') {
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

      for (const campaign of campaigns) {
        if (campaign.autoPrepare === true && ['lista', 'activa', 'bloqueada_por_configuracion'].includes(campaign.status)) {
          try { db.prepareCampaignDrafts(campaign.id); }
          catch (error) { db.addLog('error', 'campañas', `No se pudo preparar la campaña ${campaign.name}`, { error: String(error) }); }
        }
      }

      state.activeJobsCount = campaigns.filter(c => c.status === 'activa').length;
      db.save();
    } catch (err: any) {
      db.addLog('error', 'sistema', `Error en ciclo del scheduler: ${err.message}`, { error: String(err) });
    } finally {
      this.isProcessing = false;
    }
  }
}

export const scheduler = new CommercialScheduler();

