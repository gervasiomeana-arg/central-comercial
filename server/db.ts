import { campaignStrategyReady, defaultGoal, goalProgress, goalCampaigns, validateGoal, playbook, operationalSummary, researchQueriesFor } from './sales-director.js';
import { accountingDay, generateCharges, validateLedgerSubscription, clientLedger, cents, validDay } from '../src/ledger.js';
import { commercialCatalog, mergeCommercialCatalog } from './commercial-catalog.js';
import { DATA_DIR } from './data-directory.js';
import fs from 'fs';
import { prepareCampaign } from './campaign-preparation.js';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Application,
  MonthlySalesGoal,
  AutonomousRun,
  StartAutonomousInput,
  ResearchState,
  AccountCharge,
  Contact,
  Campaign,
  Conversation,
  Client,
  ClientSubscription,
  PaymentRecord,
  CommercialTask,
  ConnectorInfo,
  AuditLog,
  SchedulerState,
  PersistenceStatus,
  AutomationPipelineStatus,
  ExecutiveSummary,
  EmailSandboxRunResponse,
  SandboxStepResult
} from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'central_comercial_db.json');

export interface DatabaseSchema {
  localMigration?:{at:string};
  localMigrationPending?:{paused:boolean};
  version: number;
  updatedAt: string;
  scheduler: SchedulerState;
  applications: Application[];
  accountCharges: AccountCharge[];
  monthlySalesGoals: MonthlySalesGoal[];
  autonomousRun?: AutonomousRun;
  commercialEmailWorker?: { id: string; at: number; send: boolean; read: boolean; sender: string };
  researchState: ResearchState;
  contacts: Contact[];
  campaigns: Campaign[];
  conversations: Conversation[];
  clients: Client[];
  subscriptions: ClientSubscription[];
  payments: PaymentRecord[];
  tasks: CommercialTask[];
  connectors: ConnectorInfo[];
  logs: AuditLog[];
}

// Initial applications: Notice all unverified plans and FAQs are explicitly marked verified: false!
const INITIAL_APPLICATIONS: Application[] = commercialCatalog();

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp-open-voley-brasil-clubes',
    appId: 'app-open-voley',
    name: 'Open Voley — Clubes de Brasil',
    objective: 'Presentar la plataforma Open Voley a comisiones técnicas de clubes de voleibol de Brasil.',
    country: 'Brasil',
    language: 'pt-BR',
    segment: 'Clubes federados de voleibol e colégios esportivos.',
    channels: ['email', 'whatsapp'],
    messageTemplate: 'Olá {nombre}, acompanhamos o trabalho da comissão técnica do {organizacion}.\n\nGostaria de apresentar o Open Voley (https://openvoley.com), plataforma de scouting e análise tática desenvolvida para treinadores e clubes.\n\nSeria interessante agendarmos uma conversa rápida esta semana?',
    followUpTemplates: [
      'Olá {nombre}, tudo bem? Queria verificar se você teve oportunidade de ver a mensagem anterior sobre o Open Voley para o {organizacion}.'
    ],
    timezone: 'America/Sao_Paulo',
    sendWindowStart: '09:00',
    sendWindowEnd: '18:00',
    dailyLimit: 25,
    startDate: '2026-11-15',
    endDate: '2026-12-31',
    maxFollowUps: 2,
    followUpIntervalDays: 4,
    stopCriteria: ['respuesta_recibida', 'solicitud_baja'],
    mode: 'revision_previa',
    status: 'bloqueada_por_configuracion',
    blockingReason: 'Conectores de salida (Email SMTP y WhatsApp API) en estado Pendiente de conexión. Configure las credenciales antes de activar envíos reales.',
    stats: {
      contactsCount: 0,
      messagesPending: 0,
      messagesSent: 0,
      messagesFailed: 0,
      messagesUnknown: 0,
      responsesReceived: 0
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const INITIAL_CONNECTORS: ConnectorInfo[] = [
  {
    id: 'conn-email-smtp',
    name: 'Servidor de Correo Saliente (SMTP / Resend)',
    type: 'email_smtp',
    status: 'pendiente_conexion',
    statusDescription: 'Pendiente de conexión. Requiere host, puerto y credenciales reales verificadas.',
    missingRequirements: [
      'Servidor SMTP real (Host y Puerto accesible por TCP)',
      'Usuario y Contraseña / API Key de envío verificada',
      'Dirección remitente con registros SPF/DKIM activos'
    ],
    configSummary: {
      host: 'No configurado',
      port: '587',
      fromEmail: 'No configurado',
      authConfigured: 'No'
    },
    documentationUrl: 'https://central-comercial.local/docs/conectores/smtp'
  },
  {
    id: 'conn-whatsapp-cloud',
    name: 'WhatsApp Business Cloud API (Meta)',
    type: 'whatsapp_cloud',
    status: 'pendiente_conexion',
    statusDescription: 'Pendiente de conexión. Requiere Phone Number ID y System User Token validados en Meta.',
    missingRequirements: [
      'Phone Number ID de Meta Business validado',
      'System User Permanent Access Token activo',
      'Plantillas de mensaje aprobadas por Meta'
    ],
    configSummary: {
      phoneNumberId: 'No configurado',
      wabaId: 'No configurado',
      tokenConfigured: 'No'
    },
    documentationUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api'
  },
  {
    id: 'conn-telegram-bot',
    name: 'Telegram Bot API',
    type: 'telegram',
    status: 'pendiente_conexion',
    statusDescription: 'Pendiente de conexión. Opcional para alertas de intervención al administrador.',
    missingRequirements: [
      'Bot Token (@BotFather) verificado vía getMe'
    ],
    configSummary: {
      botUsername: 'No configurado',
      tokenConfigured: 'No'
    }
  },
  {
    id: 'conn-webhooks',
    name: 'Webhooks de Entrada',
    type: 'webhook',
    status: 'pendiente_conexion',
    statusDescription: 'Pendiente de conexión. Requiere endpoint público HTTPS accesible.',
    missingRequirements: [
      'Endpoint público con HTTPS para recepción',
      'Firma secreta de validación de payload'
    ],
    configSummary: {
      webhookUrl: 'No configurado',
      secretConfigured: 'No'
    }
  }
];

const INITIAL_SCHEDULER: SchedulerState = {
  isRunning: false,
  automationsPaused: false,
  lastRunAt: null,
  nextRunAt: null,
  activeJobsCount: 0,
  environmentNote: 'El motor programado del backend procesa tareas periódicas mientras el proceso Node.js esté activo.',
  windowsExecutionGuide: 'Para ejecutar en Windows de forma autónoma sin depender del navegador:\n1. Instalar Node.js v20+ en Windows.\n2. Ejecutar scripts\\run-scheduler-windows.bat o usar PM2 (pm2 start server.ts --name central-comercial).'
};

class DatabaseManager {
  private data: DatabaseSchema;
  private lastBackupTime: string | null = null;

  constructor() {
    this.ensureDirectory();
    this.data = this.loadAndMigrate();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
  }

  // DATA MIGRATION: Crucial step to fix unverified/invented information in existing persistent database!
  private migrateData(schema: DatabaseSchema): boolean {
    let changed = false;

    // Preserve the confirmed fixture for audit, but never count it as revenue.
    for (const payment of schema.payments) {
      if (payment.id === 'pay-1794435057839' &&
          payment.reference === 'TRANSFER-TEST-9988' &&
          payment.amount === 150 && payment.currency === 'USD' &&
          payment.status === 'confirmado') {
        payment.status = 'rechazado';
        payment.auditorNote = 'Registro de prueba identificado por el propietario: no corresponde a un cobro real. Se conserva importe y referencia para auditoría.';
        payment.reviewedBy = 'Migración: corrección de datos de prueba';
        payment.reviewedAt = new Date().toISOString();
        schema.logs.push({
          id: 'audit-fixture-payment-150',
          timestamp: new Date().toISOString(),
          level: 'warning',
          module: 'pagos',
          message: 'Excluido de ingresos el registro de prueba TRANSFER-TEST-9988 (USD 150). No se eliminó el registro.'
        });
        changed = true;
      }
    }

    for (const app of schema.applications) {
      // 1. Unverified plans: Mark verified = false and add clear verification notice
      if (app.plans) {
        for (const plan of app.plans) {
          if (plan.verified !== true) {
            plan.verified = false;
            if (!plan.verificationNotes) {
              plan.verificationNotes = 'Plan inicial no verificado por la dirección. Conservado para revisión administrativa; excluido de automatizaciones.';
              changed = true;
            }
          }
        }
      }

      // 2. Unverified FAQs: Mark approved = false, verified = false, unless explicit disclaimer
      if (app.faqs) {
        for (const faq of app.faqs) {
          const isMedicalDisclaimer = faq.question.includes('médica') || faq.question.includes('diagnóstic') || faq.question.includes('tratamiento');
          if (!isMedicalDisclaimer && faq.verified !== true) {
            faq.approved = false;
            faq.verified = false;
            if (!faq.verificationNotes) {
              faq.verificationNotes = 'Respuesta no verificada oficialmente. Conservada para revisión; excluida de respuestas automáticas y de IA.';
              changed = true;
            }
          }
        }
      }

      // 3. Unverified trial periods: Mark trialVerified = false
      if (app.trialVerified === undefined) {
        app.trialVerified = false;
        changed = true;
      }
    }

    const catalog = mergeCommercialCatalog(schema.applications);
    if (catalog.changed) { schema.applications = catalog.applications; changed = true; }
    return changed;
  }

  private loadAndMigrate(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const schema: DatabaseSchema = {
          version: parsed.version || 1,
          localMigration:parsed.localMigration,
          localMigrationPending:parsed.localMigrationPending,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          scheduler: parsed.scheduler || INITIAL_SCHEDULER,
          applications: parsed.applications || INITIAL_APPLICATIONS,
          accountCharges: parsed.accountCharges || [],
          monthlySalesGoals: parsed.monthlySalesGoals || [defaultGoal('2026-11')],
          commercialEmailWorker: parsed.commercialEmailWorker,
          autonomousRun: parsed.autonomousRun,
          researchState: parsed.researchState || { month: '', day: '', requests: 0, visited: [] },
          contacts: parsed.contacts || [],
          campaigns: parsed.campaigns || INITIAL_CAMPAIGNS,
          conversations: parsed.conversations || [],
          clients: parsed.clients || [],
          subscriptions: parsed.subscriptions || [],
          payments: parsed.payments || [],
          tasks: parsed.tasks || [],
          connectors: parsed.connectors || INITIAL_CONNECTORS,
          logs: parsed.logs || []
        };

        // Apply strict migration to persist corrected verification states
        const hadCorrections = this.migrateData(schema);
        if (hadCorrections) {
          this.saveDirect(schema);
          console.log('[Central Comercial] Migración aplicada: datos no verificados marcados y excluidos de automatizaciones.');
        }

        return schema;
      }
    } catch (err) {
      throw new Error('No se pudo leer la base comercial. Se conservó el archivo y se detuvo el arranque para evitar reemplazar datos por ejemplos. Revisar los respaldos.', { cause: err });
    }

    const initial: DatabaseSchema = {
      version: 1,
      updatedAt: new Date().toISOString(),
      scheduler: INITIAL_SCHEDULER,
      applications: INITIAL_APPLICATIONS,
      accountCharges: [],
      monthlySalesGoals: [defaultGoal('2026-11')],
      researchState: { month: '', day: '', requests: 0, visited: [] },
      contacts: [],
      campaigns: INITIAL_CAMPAIGNS,
      conversations: [],
      clients: [],
      subscriptions: [],
      payments: [],
      tasks: [
        {
          id: 'task-initial-1',
          title: 'Revisar y aprobar planes y precios oficiales',
          description: 'Los planes iniciales se conservaron pero están marcados como "No verificados" y excluidos de automatizaciones. Cargue o apruebe los precios reales.',
          priority: 'alta',
          category: 'general',
          dueDate: null,
          status: 'pendiente',
          createdAt: new Date().toISOString()
        }
      ],
      connectors: INITIAL_CONNECTORS,
      logs: [
        {
          id: `log-init-${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: 'info',
          module: 'sistema',
          message: 'Central Comercial inicializada con protección de persistencia y datos comerciales en revisión.'
        }
      ]
    };

    this.saveDirect(initial);
    return initial;
  }

  private performRotatingBackup() {
    try {
      if (!fs.existsSync(DB_FILE)) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUPS_DIR, `db_backup_${timestamp}.json`);

      fs.copyFileSync(DB_FILE, backupPath);
      this.lastBackupTime = new Date().toISOString();

      // Keep max 10 backups
      const files = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith('db_backup_') && f.endsWith('.json'))
        .sort();

      if (files.length > 10) {
        for (let i = 0; i < files.length - 10; i++) {
          try {
            fs.unlinkSync(path.join(BACKUPS_DIR, files[i]));
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      console.error('Error al crear copia de respaldo:', err);
    }
  }

  private saveDirect(data: DatabaseSchema) {
    this.ensureDirectory();
    this.performRotatingBackup();

    data.updatedAt = new Date().toISOString();
    const tempFile = `${DB_FILE}.tmp`;
    const fd = fs.openSync(tempFile, 'w');
    fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tempFile, DB_FILE);
  }

  public save() {
    this.saveDirect(this.data);
  }

  public getRaw(): DatabaseSchema {
    return this.data;
  }

  public getPersistenceStatus(): PersistenceStatus {
    let sizeBytes = 0;
    try {
      if (fs.existsSync(DB_FILE)) {
        sizeBytes = fs.statSync(DB_FILE).size;
      }
    } catch {
      // ignore
    }

    let backupCount = 0;
    try {
      if (fs.existsSync(BACKUPS_DIR)) {
        backupCount = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json')).length;
      }
    } catch {
      // ignore
    }

    return {
      storageType: 'local_json_db',
      filePath: DB_FILE,
      fileSizeBytes: sizeBytes,
      backupCount,
      lastBackupAt: this.lastBackupTime,
      environmentDurabilityNotice: 'Almacenamiento activo: JSON local con respaldos por escritura. CENTRAL_DATA_DIR permite ubicar la base y las colas en una carpeta absoluta de un disco persistente montado. Escribir una ruta no convierte un contenedor efímero en almacenamiento duradero. El inicio único conserva además copias locales de los registros mientras la PC está conectada; restaurar copias antiguas requiere revisión para no retroceder registros o repetir envíos. La variable DATABASE_URL por sí sola no conecta PostgreSQL en esta versión.',
      postgresConfigured: false,
      postgresUriFormat: 'postgresql://USUARIO:PASSWORD@HOST:PUERTO/NOMBRE_BD?sslmode=require'
    };
  }

  // Pipeline status explicitly distinguishing each stage
  public getAutomationPipelineStatus(): AutomationPipelineStatus {
    const emailConn = this.data.connectors.find(c => c.type === 'email_smtp');
    const whatsappConn = this.data.connectors.find(c => c.type === 'whatsapp_cloud');

    const mailWorker = this.getCommercialEmailStatus();
    const outboundConnected = mailWorker.send || emailConn?.status === 'conectado' || whatsappConn?.status === 'conectado';
    const webhookConn = this.data.connectors.find(c => c.type === 'webhook');

    return {
      internalTaskScheduler: {
        status: this.data.scheduler.automationsPaused ? 'pausado' : (this.data.scheduler.isRunning ? 'activo' : 'detenido'),
        description: 'Genera tareas de seguimiento interno en el backend y verifica reglas comerciales.',
        lastTick: this.data.scheduler.lastRunAt
      },
      autonomousContactSearch: {
        status: this.data.researchState.blocked ? 'error' : this.data.researchState.lastSuccess ? 'conectado' : 'pendiente_conexion',
        description: 'Consulta de páginas públicas y verificación de contactos institucionales.',
        details: this.data.researchState.detail || this.data.researchState.lastError || (this.data.researchState.lastSuccess ? 'Última consulta real: ' + this.data.researchState.lastSuccess : 'Esperando la primera consulta del objetivo mensual.')
      },
      outboundMessaging: {
        status: outboundConnected ? 'conectado' : 'pendiente_conexion',
        description: 'Envío automatizado de mensajes de campañas.',
        details: outboundConnected
          ? 'Conector de salida verificado con el proveedor.'
          : 'Bloqueado: Servidores SMTP o WhatsApp Cloud API pendientes de conexión real.'
      },
      inboundResponseListening: {
        status: mailWorker.read || webhookConn?.status === 'conectado' ? 'conectado' : 'pendiente_conexion',
        description: 'Recepción y lectura autónoma de respuestas de prospectos.',
        details: mailWorker.read ? 'Ejecutor de correo conectado al buzón para leer respuestas vinculadas.' : webhookConn?.status === 'conectado'
          ? 'Webhook activo recibiendo eventos.'
          : 'Pendiente de conexión de webhook público o polling de buzón.'
      }
    };
  }

  // --- Audit Log Helper ---
  public addLog(
    level: 'info' | 'warning' | 'error',
    module: AuditLog['module'],
    message: string,
    details?: Record<string, any>
  ): AuditLog {
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      details
    };
    this.data.logs.unshift(log);
    if (this.data.logs.length > 500) {
      this.data.logs = this.data.logs.slice(0, 500);
    }
    this.save();
    return log;
  }

  // --- Applications ---
  public getApplications(): Application[] {
    return this.data.applications;
  }

  public getApplicationById(id: string): Application | undefined {
    return this.data.applications.find(a => a.id === id || a.slug === id);
  }

  public saveApplication(app: Application): Application {
    const index = this.data.applications.findIndex(a => a.id === app.id);
    app.updatedAt = new Date().toISOString();

    // Guardrail: Funeraria in development cannot have campaigns allowed
    if (app.id === 'app-funeraria' || app.slug === 'funeraria') {
      if (app.status === 'en_desarrollo') {
        app.campaignsAllowed = false;
      }
    }

    if (index >= 0) {
      this.data.applications[index] = app;
      this.addLog('info', 'sistema', `Ficha de aplicación actualizada: ${app.name}`);
    } else {
      app.createdAt = new Date().toISOString();
      this.data.applications.push(app);
      this.addLog('info', 'sistema', `Nueva aplicación agregada: ${app.name}`);
    }
    this.save();
    return app;
  }

  // Approve / verify an existing plan
  public verifyPlan(appId: string, planId: string, verified: boolean): Application {
    const app = this.getApplicationById(appId);
    if (!app) throw new Error('Aplicación no encontrada');
    const plan = app.plans.find(p => p.id === planId);
    if (!plan) throw new Error('Plan no encontrado');

    plan.verified = verified;
    plan.verificationNotes = verified ? 'Aprobado oficialmente por el administrador.' : 'No verificado. Excluido de automatizaciones.';
    this.save();
    this.addLog('info', 'sistema', `Plan "${plan.name}" de ${app.name} marcado como ${verified ? 'VERIFICADO' : 'NO VERIFICADO'}`);
    return app;
  }

  // Approve / verify an existing FAQ
  public verifyFaq(appId: string, faqId: string, approved: boolean): Application {
    const app = this.getApplicationById(appId);
    if (!app) throw new Error('Aplicación no encontrada');
    const faq = app.faqs.find(f => f.id === faqId);
    if (!faq) throw new Error('FAQ no encontrada');

    faq.approved = approved;
    faq.verified = approved;
    faq.verificationNotes = approved ? 'Aprobada formalmente por el administrador.' : 'No verificada. Excluida de IA.';
    this.save();
    this.addLog('info', 'sistema', `Pregunta FAQ "${faq.question.substring(0, 30)}..." marcada como ${approved ? 'APROBADA' : 'NO APROBADA'}`);
    return app;
  }

  // --- Contacts ---
  public getContacts(): Contact[] {
    return this.data.contacts;
  }

  public getContactById(id: string): Contact | undefined {
    return this.data.contacts.find(c => c.id === id);
  }

  public findDuplicateContacts(contactData: Partial<Contact>, excludeId?: string): {
    matchedByEmail: Contact[];
    matchedByPhone: Contact[];
    matchedByDomain: Contact[];
  } {
    const emailNorm = contactData.email ? contactData.email.trim().toLowerCase() : '';
    const phoneNorm = contactData.phone ? contactData.phone.replace(/[^0-9]/g, '') : '';
    let domainNorm = '';
    if (contactData.website) {
      try {
        const u = contactData.website.startsWith('http') ? new URL(contactData.website) : new URL(`http://${contactData.website}`);
        domainNorm = u.hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        domainNorm = contactData.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      }
    }

    const pool = this.data.contacts.filter(c => c.id !== excludeId);

    const matchedByEmail = emailNorm ? pool.filter(c => c.email && c.email.trim().toLowerCase() === emailNorm) : [];
    const matchedByPhone = phoneNorm.length >= 7 ? pool.filter(c => {
      const p = c.phone ? c.phone.replace(/[^0-9]/g, '') : '';
      return p.length >= 7 && (p.includes(phoneNorm) || phoneNorm.includes(p));
    }) : [];
    const matchedByDomain = domainNorm ? pool.filter(c => {
      if (!c.website) return false;
      try {
        const u = c.website.startsWith('http') ? new URL(c.website) : new URL(`http://${c.website}`);
        return u.hostname.replace(/^www\./, '').toLowerCase() === domainNorm;
      } catch {
        return c.website.toLowerCase().includes(domainNorm);
      }
    }) : [];

    return { matchedByEmail, matchedByPhone, matchedByDomain };
  }

  public saveContact(contact: Contact): Contact {
    const index = this.data.contacts.findIndex(c => c.id === contact.id);
    contact.updatedAt = new Date().toISOString();
    if (index >= 0) {
      this.data.contacts[index] = contact;
      this.addLog('info', 'contactos', `Contacto actualizado: ${contact.orgName}`);
    } else {
      contact.createdAt = new Date().toISOString();
      if (!contact.history) contact.history = [];
      contact.history.push({
        id: `hist-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'creacion',
        description: `Contacto registrado desde fuente: ${contact.source || 'Manual'}`,
        author: 'Administrador'
      });
      this.data.contacts.unshift(contact);
      this.addLog('info', 'contactos', `Nuevo contacto registrado: ${contact.orgName}`);
    }
    this.save();
    return contact;
  }

  public mergeContacts(targetId: string, sourceId: string): Contact {
    if (targetId === sourceId) {
      throw new Error('Seleccione dos contactos distintos para fusionar.');
    }
    const target = this.getContactById(targetId);
    const source = this.getContactById(sourceId);
    if (!target || !source) {
      throw new Error('Contacto de destino o fuente no encontrado');
    }

    if (!target.contactPerson && source.contactPerson) target.contactPerson = source.contactPerson;
    if (!target.email && source.email) target.email = source.email;
    if (!target.phone && source.phone) target.phone = source.phone;
    if (!target.website && source.website) target.website = source.website;
    if (!target.role && source.role) target.role = source.role;

    target.interestedAppIds = Array.from(new Set([...target.interestedAppIds, ...source.interestedAppIds]));
    target.history.push({
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'fusion_duplicado',
      description: `Fusionado con registro duplicado ID ${source.id} (${source.orgName})`,
      author: 'Administrador'
    });
    if (source.history && source.history.length > 0) {
      target.history.push(...source.history);
    }
    if (source.notes) {
      target.notes = `${target.notes ? target.notes + '\n\n' : ''}[Notas del duplicado fusionado ${source.id}]:\n${source.notes}`;
    }

    for (const conv of this.data.conversations) {
      if (conv.contactId === source.id) {
        conv.contactId = target.id;
      }
    }

    this.data.contacts = this.data.contacts.filter(c => c.id !== source.id);
    this.save();
    this.addLog('info', 'contactos', `Fusión de contactos completada: ${source.orgName} integrado en ${target.orgName}`);
    return target;
  }

  public deleteContact(id: string): boolean {
    const before = this.data.contacts.length;
    this.data.contacts = this.data.contacts.filter(c => c.id !== id);
    const removed = this.data.contacts.length < before;
    if (removed) {
      this.save();
      this.addLog('info', 'contactos', `Contacto eliminado ID: ${id}`);
    }
    return removed;
  }

  public getMonthlyGoal(month = accountingDay().slice(0, 7)) { return this.data.monthlySalesGoals.find(g => g.month === month) || defaultGoal(month); }
  public getSalesGoalReport(month = accountingDay().slice(0, 7)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes no válido.');
    const goal = this.getMonthlyGoal(month);
    const progress = goalProgress(goal, this.data.applications, this.data.payments, this.data.clients);
    const apps = progress.apps.map(app => ({ ...app, operations: operationalSummary(this.getApplicationById(app.id)!, month, this.data.contacts, this.data.campaigns, this.data.conversations, this.data.payments, this.data.tasks) }));
    return { ...progress, apps, worker: this.getCommercialEmailStatus(), research: { ...this.data.researchState, visited: this.data.researchState.visited.length }, paused: this.data.scheduler.automationsPaused };
  }
  public saveMonthlyGoal(input: MonthlySalesGoal) {
    validateGoal(input);
    const previous = this.getMonthlyGoal(input.month);
    const goal: MonthlySalesGoal = { directorEnabled: previous.directorEnabled, directorChannels: previous.directorChannels, month: input.month, targetClients: input.targetClients, enabled: input.enabled, discoverContacts: input.discoverContacts, sendEmail: input.sendEmail, answerEmail: input.answerEmail, countries: [...new Set(input.countries.map(c => c.trim()))], dailyEmailLimit: input.dailyEmailLimit, dailyResearchLimit: input.dailyResearchLimit, updatedAt: new Date().toISOString() };
    const index = this.data.monthlySalesGoals.findIndex(g => g.month === goal.month);
    if (index < 0) this.data.monthlySalesGoals.push(goal); else this.data.monthlySalesGoals[index] = goal;
    this.addLog('info', 'campañas', `Objetivo ${goal.month}: ${goal.targetClients} clientes nuevos con primer pago confirmado.`, { enabled: goal.enabled });
    for (const campaign of this.data.campaigns.filter(c => c.goalMonth === goal.month)) {
      campaign.autoSendEmail = goal.sendEmail;
      const app = this.getApplicationById(campaign.appId);
      if (app&&!campaign.intelligencePlanId) { campaign.researchQueries = researchQueriesFor(app,campaign.country); campaign.researchQueryVersion=2; }
      campaign.dailyLimit = Math.max(1, Math.floor(goal.dailyEmailLimit / Math.max(1, this.data.applications.filter(a => a.status === 'lista' && a.campaignsAllowed).length)));
    }
    this.processSalesDirector(); this.save(); return this.getSalesGoalReport(goal.month);
  }
  public startMonthlyDirector() {
    const current = this.getMonthlyGoal();
    validateGoal(current);
    if (current.targetClients < 1) throw new Error('Definí primero el objetivo mensual de clientes.');
    if (!this.data.applications.some(a => a.status === 'lista' && a.campaignsAllowed)) throw new Error('No hay aplicaciones habilitadas para vender.');
    const goal: MonthlySalesGoal = { ...current, enabled: true, directorEnabled: true,
      directorChannels: ['email', 'whatsapp'], updatedAt: new Date().toISOString() };
    const i = this.data.monthlySalesGoals.findIndex(g => g.month === goal.month);
    if (i < 0) this.data.monthlySalesGoals.push(goal); else this.data.monthlySalesGoals[i] = goal;
    delete this.data.autonomousRun;
    this.data.scheduler.automationsPaused = false;
    this.addLog('info', 'campañas', `Director mensual activado: ${goal.targetClients} clientes; campañas y públicos seleccionados por Central dentro de ${goal.countries.join(', ')}. Los límites guardados siguen vigentes.`);
    this.processSalesDirector(); this.save();
  }
  public processSalesDirector() {
    const report = this.getSalesGoalReport();
    if (!report.goal.enabled || report.goal.targetClients <= 0 || report.remaining === 0 || this.data.scheduler.automationsPaused) return;
    const created = goalCampaigns(report.goal, this.data.applications, this.data.campaigns);
    this.data.campaigns.push(...created);
    let changed = created.length > 0;
    if (report.goal.directorEnabled) {
      const channels = report.goal.directorChannels || ['email'];
      for (const c of this.data.campaigns.filter(c => this.campaignInActiveRun(c.id))) {
        const app = this.getApplicationById(c.appId);
        if (!c.intelligencePlanId && app && !campaignStrategyReady({...c,intelligenceEnabled:true},app)) {
          const queries = researchQueriesFor(app,c.country);
          if (queries.length) {
            Object.assign(c,{catalogStrategy:{version:1,appId:app.id,country:c.country},researchQueries:queries,researchQueryVersion:2,researchQueryIndex:0,researchSegment:playbook(app).audience});
            this.addLog('info','campañas',`Base comercial del catálogo verificado aplicada a ${app.name} · ${c.country}. La búsqueda no depende de una respuesta del modelo.`,{campaignId:c.id});
            changed=true;
          }
        }
        if (!c.intelligenceEnabled || c.channels.join(',') !== channels.join(',') || c.autoSendEmail !== (report.goal.sendEmail && channels.includes('email')) || c.autoSendWhatsApp !== channels.includes('whatsapp')) {
          Object.assign(c, { intelligenceEnabled: true, channels: [...channels], autoPrepare: true,
            autoSendEmail: report.goal.sendEmail && channels.includes('email'), autoSendWhatsApp: channels.includes('whatsapp'), updatedAt: new Date().toISOString() });
          changed = true;
        }
      }
    }
    if (created.length) this.addLog('info', 'campañas', `${created.length} campañas creadas por Central para el objetivo ${report.goal.month}.`);
    if (changed) this.save();
  }
  public getResearchState() { return this.data.researchState; }
  public commercialEmailHeartbeat(id: string, send: boolean, read: boolean, sender: string) {
    const previous = this.data.commercialEmailWorker;
    if (previous && Date.now() - previous.at < 90000 && previous.id !== id) throw new Error('Ya hay otro ejecutor comercial de correo activo.');
    if (typeof id !== 'string' || id.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender || '')) throw new Error('Identidad del ejecutor no válida.');
    this.data.commercialEmailWorker = { id, at: Date.now(), send, read, sender }; this.save();
  }
  public getCommercialEmailStatus() {
    const worker = this.data.commercialEmailWorker;
    const online = Boolean(worker && Date.now() - worker.at < 90000);
    return { online, send: online && Boolean(worker?.send), read: online && Boolean(worker?.read), sender: online ? worker?.sender : undefined };
  }

  public campaignInActiveRun(id: string) {
    const goal = this.getMonthlyGoal();
    if (goal.directorEnabled) {
      const campaign = this.getCampaignById(id), app = campaign && this.getApplicationById(campaign.appId);
      return Boolean(campaign && campaign.id.startsWith(`goal-${goal.month}-`) && campaign.goalMonth === goal.month && goal.countries.includes(campaign.country) && app?.status === 'lista' && app.campaignsAllowed);
    }
    return !this.data.autonomousRun || this.data.autonomousRun.campaignId === id;
  }
  public getAutonomousRun() { return this.data.autonomousRun; }
  public startAutonomousRun(input: StartAutonomousInput) {
    const channels=input.channels||['email'];if(!channels.length||channels.some(c=>!['email','whatsapp'].includes(c)))throw new Error('Elegí email o WhatsApp.');
    const app = this.getApplicationById(input.appId);
    if (!app || app.status !== 'lista' || !app.campaignsAllowed) throw new Error('Elegí una aplicación lista para vender.');
    const country = typeof input.country === 'string' ? input.country.trim() : '';
    if (!country || country.length > 60 || !Number.isInteger(input.maxContacts) || input.maxContacts < 1 || input.maxContacts > 20) throw new Error('Indicá un país y un máximo total de 1 a 20 contactos.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendWindowStart || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendWindowEnd || '') || input.sendWindowStart >= input.sendWindowEnd) throw new Error('Revisá el horario de envío.');
    const day = accountingDay(), month = day.slice(0,7);
    const goal = { ...this.getMonthlyGoal(month), directorEnabled:false, targetClients:input.targetClients, enabled:true, discoverContacts:true, sendEmail:true, answerEmail:true, countries:[country], dailyEmailLimit:input.maxContacts, dailyResearchLimit:20, updatedAt:new Date().toISOString() };
    validateGoal(goal);
    if(goal.targetClients<1)throw new Error('El objetivo mensual debe ser de al menos un cliente.');
    const template = goalCampaigns(goal, [app], [])[0];
    if (!template) throw new Error('Esta aplicación todavía no tiene una estrategia comercial definida.');
    const campaignId = `autonomous-${month}-${app.id}-${country.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
    const campaign = this.getCampaignById(campaignId) || { ...template, id:campaignId, name:`Piloto autónomo · ${app.name} · ${country}`, createdAt:new Date().toISOString() };
    Object.assign(campaign, { channels,intelligenceEnabled:input.useLocalIntelligence!==false,maxContacts:input.maxContacts, dailyLimit:input.maxContacts, status:'activa', autoPrepare:true, autoSendEmail:channels.includes('email'),autoSendWhatsApp:channels.includes('whatsapp'), sendWindowStart:input.sendWindowStart, sendWindowEnd:input.sendWindowEnd, updatedAt:new Date().toISOString() });
    if(!this.getCampaignById(campaignId)) this.data.campaigns.push(campaign);
    const existingGoal = this.data.monthlySalesGoals.findIndex(g=>g.month===month);
    if(existingGoal<0)this.data.monthlySalesGoals.push(goal);else this.data.monthlySalesGoals[existingGoal]=goal;
    this.data.autonomousRun = {id:campaignId,campaignId,appId:app.id,country,maxContacts:input.maxContacts,startedAt:new Date().toISOString()};
    this.data.scheduler.automationsPaused = false;
    this.addLog('info','campañas',`Inicio autónomo: ${app.name}, ${country}, hasta ${input.maxContacts} contactos en total.`,{campaignId});
    this.save(); return this.getAutonomousRunReport();
  }
  public getAutonomousRunReport(whatsappReady=false) {
    const run = this.data.autonomousRun, worker = this.getCommercialEmailStatus();
    if (!run) {
      const report = this.getSalesGoalReport();
      if (!report.goal.directorEnabled) return {run:null,paused:this.data.scheduler.automationsPaused,worker,stages:[],blockers:[]};
      const campaigns = this.getCampaigns().filter(c => this.campaignInActiveRun(c.id));
      const blockers: string[] = [];
      if (this.data.scheduler.automationsPaused) blockers.push('El director está pausado.');
      if (report.goal.sendEmail && !worker.send) blockers.push('Falta la conexión de envío de correo.');
      if (report.goal.answerEmail && !worker.read) blockers.push('Falta la conexión del buzón de respuestas.');
      if (campaigns.some(c => !campaignStrategyReady(c,this.getApplicationById(c.appId)))) blockers.push('Falta una estrategia comercial válida del catálogo o de OpenJarvis.');
      if (this.data.researchState.lastError) blockers.push(`Búsqueda: ${this.data.researchState.lastError}`);
      return {run:null,director:{month:report.goal.month,target:report.goal.targetClients,achieved:report.achieved,remaining:report.remaining,
        countries:report.goal.countries,dailyLimit:report.goal.dailyEmailLimit,channels:report.goal.directorChannels,
        campaigns:campaigns.map(c=>({id:c.id,app:this.getApplicationById(c.appId)?.name,country:c.country,status:c.status,
          audience:c.researchSegment,strategyReady:campaignStrategyReady(c,this.getApplicationById(c.appId)),strategySource:c.intelligencePlanId?'OpenJarvis':c.catalogStrategy?'Catálogo verificado':'Pendiente',error:campaignStrategyReady(c,this.getApplicationById(c.appId))?undefined:c.intelligenceError,intelligenceNote:c.intelligenceError})),
        apps:report.apps.filter(a=>a.ready)},paused:this.data.scheduler.automationsPaused,worker,stages:[],blockers,
        research:{status:this.data.researchState.status,detail:this.data.researchState.detail,blocked:this.data.researchState.blocked,requests:this.data.researchState.day===accountingDay()?this.data.researchState.requests:0,limit:report.goal.dailyResearchLimit,lastError:this.data.researchState.lastError,nextAttemptAt:campaigns.map(c=>c.researchNextAttemptAt).filter((n):n is number=>typeof n==='number'&&n>Date.now()).sort((a,b)=>a-b)[0]},lastCycleAt:this.data.scheduler.lastRunAt};
    }
    const campaign=this.getCampaignById(run.campaignId), app=this.getApplicationById(run.appId);
    const threads=this.data.conversations.filter(c=>c.campaignId===run.campaignId);
    const messages=threads.flatMap(c=>c.messages);
    const contacted=new Set(threads.map(c=>c.contactId));
    const contacts=this.data.contacts.filter(c=>c.interestedAppIds?.includes(run.appId)&&c.country?.trim().toLowerCase()===run.country.toLowerCase()&&!['cliente','descartado','baja_solicitada'].includes(c.status)&&c.permission!=='revocado'&&c.email&&c.source&&Number.isFinite(Date.parse(c.sourceReviewDate)));
    const prepared=messages.filter(m=>m.direction==='outbound'&&m.status==='preparado'&&m.reviewStatus!=='rejected').length;
    const accepted=messages.filter(m=>m.direction==='outbound'&&['aceptado_proveedor','entrega_confirmada'].includes(m.status)&&m.serviceConfirmationId).length;
    const received=messages.filter(m=>m.direction==='inbound'&&m.providerMessageId).length;
    const answered=messages.filter(m=>m.direction==='outbound'&&m.replyToProviderId&&['aceptado_proveedor','entrega_confirmada'].includes(m.status)&&m.serviceConfirmationId).length;
    const clients=this.data.clients.filter(c=>contacted.has(c.contactId || ''));
    const paid=clients.filter(c=>this.data.payments.some(p=>p.clientId===c.id&&p.appId===run.appId&&p.status==='confirmado'&&p.reviewedAt&&p.amount>0));
    const blockers:string[]=[];
    if(this.data.scheduler.automationsPaused)blockers.push('La operación está pausada.');
    if(app?.status!=='lista'||!app?.campaignsAllowed)blockers.push('La aplicación no está habilitada para vender.');
    if(campaign?.channels.includes('email')&&!worker.send)blockers.push('Envío bloqueado: el ejecutor de correo no está conectado.');
    if(campaign?.channels.includes('email')&&!worker.read)blockers.push('Recepción bloqueada: falta conectar el buzón de respuestas.');
    if(campaign?.channels.includes('whatsapp')&&!whatsappReady)blockers.push('WhatsApp pendiente de vincular.');
    if(campaign?.intelligenceEnabled&&!campaign.intelligencePlanId)blockers.push(campaign.intelligenceError||'Esperando una estrategia válida de OpenJarvis.');
    if(this.data.researchState.day===accountingDay() && this.data.researchState.requests>=this.getMonthlyGoal().dailyResearchLimit)blockers.push('Se alcanzó el cupo de páginas de investigación de hoy; se retoma el próximo día.');
    if(this.data.researchState.lastError && this.data.researchState.lastError!=='Cupo diario de investigación alcanzado.')blockers.push(`Búsqueda: ${this.data.researchState.lastError}`);
    if(campaign?.lastPreparation?.blockedReason)blockers.push(`Preparación: ${campaign.lastPreparation.blockedReason}`);
    const unknown=messages.filter(m=>m.status==='resultado_desconocido').length;
    if(unknown)blockers.push(`${unknown} resultado(s) de envío incierto(s), sin reintento automático.`);
    const stages=[
      {name:'Buscar y verificar contactos',count:contacts.length,state:contacts.length?'con_resultados':this.data.researchState.status==='quota'?'cupo':this.data.researchState.blocked||this.data.researchState.status==='error'?'bloqueado':'pendiente'},
      {name:'Preparar notas',count:prepared,state:prepared||accepted?'con_resultados':'pendiente'},
      {name:'Enviar por canales elegidos',count:accepted,state:accepted?'con_resultados':worker.send||whatsappReady?'pendiente':'bloqueado'},
      {name:'Recibir consultas',count:received,state:received?'con_resultados':worker.read||whatsappReady?'pendiente':'bloqueado'},
      {name:'Responder consultas',count:answered,state:answered?'con_resultados':'pendiente'},
      {name:'Crear ficha de cliente',count:clients.length,state:clients.length?'con_resultados':'pendiente'},
      {name:'Registrar cuenta corriente',count:this.data.subscriptions.filter(s=>clients.some(c=>c.id===s.clientId)&&s.appId===run.appId&&s.ledgerEnabled).length,state:this.data.subscriptions.some(s=>clients.some(c=>c.id===s.clientId)&&s.appId===run.appId&&s.ledgerEnabled)?'con_resultados':'pendiente'},
      {name:'Confirmar primer pago',count:paid.length,state:paid.length?'con_resultados':'revision_manual'}
    ];
    return {channels:campaign?.channels,research:{status:this.data.researchState.status,detail:this.data.researchState.detail,outcome:campaign?.researchLastOutcome,pendingPages:campaign?.researchQueue?.length||0},run,appName:app?.name,campaignName:campaign?.name,paused:this.data.scheduler.automationsPaused,worker,stages,blockers,lastCycleAt:this.data.scheduler.lastRunAt,contactsInCampaign:contacted.size,humanQuestions:threads.filter(c=>c.requiresHumanIntervention&&c.messages.some(m=>m.direction==='inbound')).length};
  }

  // --- Campaigns ---
  public getCampaigns(): Campaign[] {
    return this.data.campaigns;
  }

  public getCampaignById(id: string): Campaign | undefined {
    return this.data.campaigns.find(c => c.id === id);
  }

  public saveCampaign(campaign: Campaign,whatsappConnected=false): { campaign: Campaign; error?: string } {
    const app = this.getApplicationById(campaign.appId);
    if (!app) {
      return { campaign, error: 'La aplicación asociada a la campaña no existe.' };
    }

    if (app.id === 'app-funeraria' || app.slug === 'funeraria' || app.status === 'en_desarrollo') {
      if (campaign.status === 'activa') {
        campaign.status = 'bloqueada_por_configuracion';
        campaign.blockingReason = `La aplicación ${app.name} se encuentra en desarrollo. Sus campañas están estrictamente bloqueadas hasta autorizar su lanzamiento.`;
      }
    }

    if (campaign.status === 'activa') {
      const needsEmail = campaign.channels.includes('email');
      const needsWhatsapp = campaign.channels.includes('whatsapp');

      const emailConn = this.data.connectors.find(c => c.type === 'email_smtp');
      const whatsappConn = this.data.connectors.find(c => c.type === 'whatsapp_cloud');

      const missing: string[] = [];
      if (needsEmail && emailConn?.status !== 'conectado'&&!this.getCommercialEmailStatus().send) missing.push('Ejecutor de correo');
      if (needsWhatsapp && !whatsappConnected) missing.push('Ejecutor de WhatsApp vinculado');

      if (missing.length > 0) {
        campaign.status = 'bloqueada_por_configuracion';
        campaign.blockingReason = `No se puede activar la campaña: los siguientes conectores requeridos están pendientes de conexión: ${missing.join(', ')}.`;
      }
    }

    campaign.updatedAt = new Date().toISOString();
    const index = this.data.campaigns.findIndex(c => c.id === campaign.id);
    if (index >= 0) {
      this.data.campaigns[index] = campaign;
      this.addLog('info', 'campañas', `Campaña actualizada: ${campaign.name} (Estado: ${campaign.status})`);
    } else {
      campaign.createdAt = new Date().toISOString();
      if (!campaign.stats) {
        campaign.stats = {
          contactsCount: 0,
          messagesPending: 0,
          messagesSent: 0,
          messagesFailed: 0,
          messagesUnknown: 0,
          responsesReceived: 0
        };
      }
      this.data.campaigns.unshift(campaign);
      this.addLog('info', 'campañas', `Nueva campaña creada: ${campaign.name}`);
    }
    this.save();
    return { campaign };
  }

  public prepareCampaignDrafts(id: string) {
    const campaign = this.getCampaignById(id);
    if (!campaign) throw new Error('Campaña no encontrada');
    const result = prepareCampaign(campaign, this.getApplicationById(campaign.appId), this.data.contacts, this.data.conversations);
    this.data.conversations.unshift(...result.drafts);
    campaign.lastPreparation = { at: new Date().toISOString(), created: result.drafts.length, skipped: result.skipped, blockedReason: result.blockedReason };
    const conversations = this.data.conversations.filter(c => c.campaignId === id);
    campaign.stats.contactsCount = new Set(conversations.map(c => c.contactId)).size;
    campaign.stats.messagesPending = conversations.flatMap(c => c.messages).filter(m => m.direction === 'outbound' && ['preparado', 'pendiente'].includes(m.status) && m.reviewStatus !== 'rejected').length;
    if (result.drafts.length) this.addLog('info', 'campañas', `${result.drafts.length} borradores de correo preparados para ${campaign.name}. Sin envíos.`, { campaignId: id });
    this.save();
    return campaign.lastPreparation;
  }

  // --- Conversations & Messages ---
  public getConversations(): Conversation[] {
    return this.data.conversations;
  }

  public getConversationById(id: string): Conversation | undefined {
    return this.data.conversations.find(c => c.id === id);
  }

  public saveConversation(conv: Conversation): Conversation {
    const index = this.data.conversations.findIndex(c => c.id === conv.id);
    if (index >= 0) {
      this.data.conversations[index] = conv;
    } else {
      this.data.conversations.unshift(conv);
    }
    this.save();
    return conv;
  }

  public addMessageToConversation(
    conversationId: string,
    message: Omit<Conversation['messages'][0], 'id' | 'createdAt'>
  ): Conversation['messages'][0] {
    const conv = this.getConversationById(conversationId);
    if (!conv) throw new Error('Conversación no encontrada');

    const newMsg: Conversation['messages'][0] = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };

    conv.messages.push(newMsg);
    conv.lastMessageAt = newMsg.createdAt;

    const contact = this.getContactById(conv.contactId);
    if (contact) {
      contact.history.push({
        id: `hist-${Date.now()}`,
        timestamp: newMsg.createdAt,
        type: newMsg.direction === 'outbound' ? (['enviado','aceptado_proveedor','entrega_confirmada'].includes(newMsg.status) ? 'mensaje_enviado' : 'nota') : 'mensaje_recibido',
        description: `${newMsg.direction === 'outbound' ? 'Mensaje saliente' : 'Mensaje recibido'} (${newMsg.channel}) - Estado: ${newMsg.status}`,
        author: newMsg.direction === 'outbound' ? 'Sistema / Agente' : (contact.contactPerson || contact.orgName)
      });
      contact.updatedAt = new Date().toISOString();

      // COMMERCIAL INTELLIGENCE RULES (Inteligencia comercial):
      if (newMsg.direction === 'inbound') {
        // 1. Automatically halt further scheduled follow-ups once a reply is received
        contact.nextFollowUpDate = null;

        // 2. Check for opt-out / baja
        const lower = newMsg.content.toLowerCase();
        if (
          lower.includes('baja') ||
          lower.includes('desuscrib') ||
          lower.includes('no me interesa') ||
          lower.includes('no enviar') ||
          lower.includes('remover') ||
          lower.includes('cancelar')
        ) {
          conv.classification = 'solicita_baja';
          contact.status = 'baja_solicitada';
          this.addLog('info', 'conversaciones', `Baja solicitada por ${contact.orgName}. Seguimientos cancelados automáticamente.`);
        }
        // 3. Check for out-of-scope negotiations, unauthorized discounts, or complaints
        else if (
          lower.includes('descuento') ||
          lower.includes('rebaja') ||
          lower.includes('más barato') ||
          lower.includes('reclamo') ||
          lower.includes('queja') ||
          lower.includes('estafa')
        ) {
          conv.requiresHumanIntervention = true;
          conv.classification = 'requiere_intervencion';
          conv.adminNote = 'Consulta con solicitud de negociación especial, descuento no catalogado o reclamo.';

          this.saveTask({
            id: `task-intervention-${conv.id}-${Date.now()}`,
            title: `Intervención requerida: Consulta especial de ${contact.orgName}`,
            description: `El prospecto envió una consulta que requiere atención personalizada o negociación fuera de las condiciones aprobadas: "${newMsg.content.substring(0, 100)}..."`,
            priority: 'alta',
            category: 'general',
            relatedType: 'conversacion',
            relatedId: conv.id,
            dueDate: null,
            status: 'pendiente',
            createdAt: new Date().toISOString()
          });

          this.addLog('warning', 'conversaciones', `Intervención requerida asignada al administrador para ${contact.orgName}.`);
        }
        // 4. Positive interest
        else if (
          lower.includes('interes') ||
          lower.includes('precio') ||
          lower.includes('demo') ||
          lower.includes('probar') ||
          lower.includes('reunión') ||
          lower.includes('llamada')
        ) {
          if (contact.status === 'prospecto' || contact.status === 'contactado') {
            contact.status = 'interesado';
          }
          conv.classification = 'interesado';
        }

        // Update campaign stats if linked
        conv.requiresHumanIntervention = conv.classification === 'requiere_intervencion' || this.data.tasks.some(t => t.relatedId === conv.id && t.status === 'pendiente');
        if (conv.campaignId) {
          const camp = this.getCampaignById(conv.campaignId);
          if (camp && camp.stats) {
            camp.stats.responsesReceived = (camp.stats.responsesReceived || 0) + 1;
          }
        }
      }
    }

    this.save();
    return newMsg;
  }

  // --- Clients & Subscriptions & Payments ---
  public getClients(): Client[] {
    return this.data.clients;
  }

  public convertContactToClient(contactId: string): Client {
    const contact = this.getContactById(contactId);
    if (!contact) throw new Error('Contacto no encontrado');

    const existingClient = this.data.clients.find(c => c.contactId === contactId);
    if (existingClient) return existingClient;

    const newClient: Client = {
      id: `client-${Date.now()}`,
      contactId: contact.id,
      orgName: contact.orgName,
      contactPerson: contact.contactPerson,
      email: contact.email,
      phone: contact.phone,
      country: contact.country,
      notes: `Convertido desde prospecto comercial el ${new Date().toLocaleDateString('es')}. ${contact.notes || ''}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.clients.unshift(newClient);
    contact.status = 'cliente';
    contact.convertedToClientId = newClient.id;
    contact.history.push({
      id: `hist-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'conversion_cliente',
      description: `Convertido a Cliente oficial (ID Cliente: ${newClient.id})`,
      author: 'Administrador'
    });

    this.save();
    this.addLog('info', 'contactos', `Contacto ${contact.orgName} convertido exitosamente a cliente.`);
    return newClient;
  }

  public getSubscriptions(): ClientSubscription[] {
    return this.data.subscriptions;
  }

  public saveSubscription(sub: ClientSubscription): ClientSubscription {
    if (!this.data.clients.some(c => c.id === sub.clientId) || !this.getApplicationById(sub.appId)) throw new Error('Cliente o aplicación no encontrados.');
    sub.ledgerEnabled = sub.ledgerEnabled === true;
    if (!['activa', 'en_prueba', 'vencida', 'cancelada'].includes(sub.status) || !['mensual', 'anual', 'trimestral', 'prueba', 'unico'].includes(sub.billingInterval)) throw new Error('Estado o período de suscripción no válido.');
    if (!validDay(sub.startDate) || !validDay(sub.renewalDate) || sub.renewalDate < sub.startDate || !/^[A-Z]{3}$/.test(sub.currency) || cents(sub.agreedAmount) < (sub.billingInterval === 'prueba' ? 0 : 1)) throw new Error('Revisá fechas, moneda e importe de la suscripción.');
    const previous = this.data.subscriptions.find(s => s.id === sub.id);
    if (previous?.ledgerStartDate) {
      for (const field of ['clientId', 'appId', 'currency', 'startDate', 'billingInterval'] as const) if (sub[field] !== previous[field]) throw new Error('Para cambiar cliente, aplicación, moneda o período, registrá otra suscripción. Se conserva la cuenta anterior.');
    }
    if (sub.ledgerEnabled) {
      sub.ledgerStartDate = previous?.ledgerEnabled ? previous.ledgerStartDate : (sub.startDate > accountingDay() ? sub.startDate : accountingDay());
      validateLedgerSubscription(sub);
      if (this.getApplicationById(sub.appId)?.status !== 'lista') throw new Error('La aplicación debe estar lista antes de registrar vencimientos automáticos.');
    } else if (previous?.ledgerStartDate) sub.ledgerStartDate = previous.ledgerStartDate;
    if (previous?.ledgerEnabled) this.processLedger();
    const index = this.data.subscriptions.findIndex(s => s.id === sub.id);
    if (index >= 0) {
      this.data.subscriptions[index] = sub;
      this.addLog('info', 'pagos', `Suscripción actualizada para cliente ID ${sub.clientId}`);
    } else {
      this.data.subscriptions.unshift(sub);
      this.addLog('info', 'pagos', `Nueva suscripción registrada: ${sub.planName} (${sub.currency} ${sub.agreedAmount})`);
    }
    this.save();
    if (sub.ledgerEnabled) this.processLedger();
    return sub;
  }

  public getAccountCharges(): AccountCharge[] { return this.data.accountCharges; }

  public processLedger() {
    const result = generateCharges(this.data.subscriptions.filter(s => this.getApplicationById(s.appId)?.status === 'lista' && this.data.clients.some(c => c.id === s.clientId)), this.data.accountCharges);
    this.data.accountCharges = result.charges;
    let changed = result.created > 0;
    for (const client of this.data.clients) {
      const ledger = clientLedger(client.id, result.charges, this.data.payments, this.data.subscriptions);
      for (const row of ledger.rows) {
        const id = `task-ledger-${row.id}`;
        const task = this.data.tasks.find(t => t.id === id);
        if (row.state === 'vencido' && !task) {
          this.data.tasks.push({ id, title: `Vencimiento: ${client.orgName} · ${row.currency} ${row.remaining}`, description: `Revisar cuenta corriente. Vencimiento ${row.dueDate}. No se realizó ningún cobro ni se envió un aviso.`, priority: 'media', category: 'vencimiento', relatedType: 'pago', relatedId: row.id, dueDate: row.dueDate, status: 'pendiente', createdAt: new Date().toISOString() }); changed = true;
        } else if (task?.status === 'pendiente' && ['pagado', 'anulado'].includes(row.state)) { task.status = 'completada'; changed = true; }
      }
    }
    if (result.created) this.addLog('info', 'pagos', `${result.created} vencimientos registrados en cuenta corriente. Sin cargos bancarios.`);
    if (changed) this.save();
    return { created: result.created, issues: result.issues };
  }

  public voidAccountCharge(id: string, reason: string, actor: string) {
    const charge = this.data.accountCharges.find(c => c.id === id);
    if (!charge) throw new Error('Vencimiento no encontrado.');
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) throw new Error('Indicá el motivo de anulación (3 a 500 caracteres).');
    if (charge.status === 'anulado') return charge;
    charge.status = 'anulado'; charge.voidReason = reason.trim(); charge.voidedAt = new Date().toISOString(); charge.voidedBy = actor;
    this.addLog('warning', 'pagos', 'Vencimiento anulado sin borrar su registro.', { chargeId: id, reason: charge.voidReason, actor });
    this.processLedger(); this.save(); return charge;
  }

  public assignPaymentToSubscription(paymentId: string, subscriptionId: string, actor: string) {
    const payment = this.data.payments.find(p => p.id === paymentId);
    const sub = this.data.subscriptions.find(s => s.id === subscriptionId);
    if (!payment || !sub || payment.status !== 'confirmado') throw new Error('Seleccioná un pago confirmado y una suscripción existente.');
    if (payment.clientId !== sub.clientId || payment.appId !== sub.appId || payment.currency !== sub.currency) throw new Error('El pago y la suscripción deben coincidir en cliente, aplicación y moneda.');
    if (cents(payment.amount) <= 0) throw new Error('El pago debe tener un importe válido mayor que cero.');
    const previousSubscriptionId = payment.subscriptionId;
    payment.subscriptionId = sub.id; payment.ledgerAssignedAt = new Date().toISOString();
    this.addLog('info', 'pagos', 'Pago confirmado asignado a cuenta corriente.', { paymentId, subscriptionId, previousSubscriptionId, actor });
    this.processLedger(); this.save(); return payment;
  }

  public getPayments(): PaymentRecord[] {
    return this.data.payments;
  }

  // FORCE MANUAL PAYMENT STATUS: Requirement 6
  public savePayment(payment: PaymentRecord): PaymentRecord {
    if (typeof payment.amount !== 'number' || !Number.isFinite(payment.amount) || payment.amount <= 0) {
      throw new Error('El importe debe ser un número finito mayor que cero.');
    }
    if (typeof payment.currency !== 'string' || !/^[A-Z]{3}$/.test(payment.currency)) {
      throw new Error('La moneda debe ser un código de tres letras mayúsculas, por ejemplo USD.');
    }
    if (cents(payment.amount) <= 0) throw new Error('El pago debe tener un importe válido mayor que cero.');
    const index = this.data.payments.findIndex(p => p.id === payment.id);
    if (index >= 0) {
      this.data.payments[index] = payment;
      this.addLog('info', 'pagos', `Pago ID ${payment.id} modificado. Estado: ${payment.status}`);
    } else {
      if (payment.subscriptionId) {
        const sub = this.data.subscriptions.find(s => s.id === payment.subscriptionId);
        if (!sub || sub.clientId !== payment.clientId || sub.appId !== payment.appId || sub.currency !== payment.currency) throw new Error('La suscripción del pago debe coincidir en cliente, aplicación y moneda.');
        payment.ledgerAssignedAt = new Date().toISOString();
      } else delete payment.ledgerAssignedAt;
      payment.createdAt = new Date().toISOString();
      // ALWAYS FORCE PENDING MANUAL CONFIRMATION ON NEW PAYMENTS
      payment.status = 'pendiente_confirmacion_manual';
      payment.reviewedBy = undefined;
      payment.reviewedAt = undefined;

      this.data.payments.unshift(payment);
      this.addLog('info', 'pagos', `Nuevo cobro registrado: ${payment.currency} ${payment.amount} (Estado: Pendiente de confirmación manual)`);
    }
    this.save();
    return payment;
  }

  // --- Tasks ---
  public getTasks(): CommercialTask[] {
    return this.data.tasks;
  }

  public saveTask(task: CommercialTask): CommercialTask {
    const index = this.data.tasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      this.data.tasks[index] = task;
    } else {
      task.createdAt = new Date().toISOString();
      this.data.tasks.unshift(task);
      this.addLog('info', 'sistema', `Nueva tarea comercial: ${task.title}`);
    }
    this.save();
    return task;
  }

  // --- Connectors ---
  public getConnectors(): ConnectorInfo[] {
    return this.data.connectors;
  }

  public updateConnector(id: string, updates: Partial<ConnectorInfo>): ConnectorInfo {
    const connector = this.data.connectors.find(c => c.id === id);
    if (!connector) throw new Error('Conector no encontrado');

    Object.assign(connector, updates);
    this.save();
    this.addLog('warning', 'conectores', `Conector ${connector.name} modificado. Estado: ${connector.status}`);
    return connector;
  }

  // --- Scheduler & Automation Pause ---
  public getSchedulerState(): SchedulerState {
    return this.data.scheduler;
  }

  public setAutomationsPaused(paused: boolean): SchedulerState {
    this.data.scheduler.automationsPaused = paused;
    this.save();
    this.addLog(
      paused ? 'warning' : 'info',
      'campañas',
      paused ? 'AUTOMATIZACIONES PAUSADAS GLOBALMENTE POR EL ADMINISTRADOR.' : 'Automatizaciones reanudadas globalmente.'
    );
    return this.data.scheduler;
  }

  // --- Dashboard Metrics ---
  public getDashboardMetrics(appFilter = 'all', period = 'all'): any {
    let contacts = this.data.contacts;
    let campaigns = this.data.campaigns;
    let payments = this.data.payments;
    let subscriptions = this.data.subscriptions;
    let tasks = this.data.tasks;

    if (appFilter !== 'all') {
      contacts = contacts.filter(c => c.interestedAppIds.includes(appFilter));
      campaigns = campaigns.filter(c => c.appId === appFilter);
      payments = payments.filter(p => p.appId === appFilter);
      subscriptions = subscriptions.filter(s => s.appId === appFilter);
    }

    const paymentsByCurrency: Record<string, { confirmedTotal: number; pendingTotal: number }> = {};
    for (const p of payments) {
      const cur = p.currency || 'USD';
      if (!paymentsByCurrency[cur]) {
        paymentsByCurrency[cur] = { confirmedTotal: 0, pendingTotal: 0 };
      }
      if (p.status === 'confirmado') {
        paymentsByCurrency[cur].confirmedTotal += p.amount;
      } else if (p.status === 'pendiente_confirmacion_manual') {
        paymentsByCurrency[cur].pendingTotal += p.amount;
      }
    }

    const currencyArray = Object.keys(paymentsByCurrency).map(cur => ({
      currency: cur,
      confirmedTotal: paymentsByCurrency[cur].confirmedTotal,
      pendingTotal: paymentsByCurrency[cur].pendingTotal
    }));

    let messagesPending = 0;
    let messagesSent = 0;
    let messagesFailed = 0;
    let messagesUnknown = 0;
    let responsesReceived = 0;

    for (const conv of this.data.conversations) {
      if (appFilter !== 'all' && conv.appId !== appFilter) continue;
      for (const m of conv.messages) {
        if (m.direction === 'outbound') {
          if ((m.status === 'pendiente' || m.status === 'preparado') && m.reviewStatus !== 'rejected') messagesPending++;
          else if (m.status === 'enviado' || (m.status === 'aceptado_proveedor' && m.acceptedAt && m.serviceConfirmationId)) messagesSent++;
          else if (m.status === 'fallido') messagesFailed++;
          else if (m.status === 'resultado_desconocido') messagesUnknown++;
        } else if (m.direction === 'inbound') {
          responsesReceived++;
        }
      }
    }

    const connectorsNeedingAttention = this.data.connectors.filter(c => c.status !== 'conectado').length;

    return {
      period,
      appFilter,
      contactsTotal: contacts.length,
      contactsVerified: contacts.filter(c => c.permission === 'autorizado' || (c.source && c.source.length > 3)).length,
      messagesPending,
      messagesSent,
      messagesFailed,
      messagesUnknown,
      responsesReceived,
      interestedCount: contacts.filter(c => c.status === 'interesado').length,
      trialClientsCount: contacts.filter(c => c.status === 'en_prueba').length + subscriptions.filter(s => s.status === 'en_prueba').length,
      activeSubscriptionsCount: subscriptions.filter(s => s.status === 'activa').length,
      expiredSubscriptionsCount: subscriptions.filter(s => s.status === 'vencida').length,
      paymentsByCurrency: currencyArray,
      pendingPaymentsCount: payments.filter(p => p.status === 'pendiente_confirmacion_manual').length,
      pendingTasksCount: tasks.filter(t => t.status === 'pendiente').length,
      connectorsNeedingAttention,
      automationsPaused: this.data.scheduler.automationsPaused
    };
  }

  // --- Executive Summary: Answering What is it doing, what did it achieve, what does it need from me ---
  public getExecutiveSummary(appFilter = 'all', period = 'all'): ExecutiveSummary {
    const daemonRunning = this.data.scheduler.isRunning;
    const automationsPaused = this.data.scheduler.automationsPaused;
    const activeCampaigns = this.data.campaigns.filter(c => c.status === 'activa');

    const byApplication = this.data.applications.map(app => {
      const contacts = this.data.contacts.filter(c => c.interestedAppIds.includes(app.id));
      const contactsVerified = contacts.filter(c => c.permission === 'autorizado' || (c.source && c.source.length > 3)).length;
      const appConvs = this.data.conversations.filter(c => c.appId === app.id);
      let messagesSent = 0;
      let responsesReceived = 0;
      for (const conv of appConvs) {
        for (const m of conv.messages) {
          if (m.direction === 'outbound' && (m.status === 'enviado' || m.status === 'aceptado_proveedor' || m.status === 'entrega_confirmada')) {
            messagesSent++;
          } else if (m.direction === 'inbound') {
            responsesReceived++;
          }
        }
      }
      const interestedCount = contacts.filter(c => c.status === 'interesado').length;
      const trialCount = contacts.filter(c => c.status === 'en_prueba').length + this.data.subscriptions.filter(s => s.appId === app.id && s.status === 'en_prueba').length;
      const clientsCount = new Set(this.data.subscriptions.filter(s => s.appId === app.id && s.status === 'activa').map(s => s.clientId)).size;

      return {
        appId: app.id,
        appName: app.name,
        status: app.status === 'en_desarrollo' ? 'En desarrollo' : 'Lista',
        contactsVerified,
        messagesSent,
        responsesReceived,
        interestedCount,
        trialCount,
        clientsCount
      };
    });

    const paymentsByCurrency: Record<string, number> = {};
    for (const p of this.data.payments) {
      if (p.status === 'confirmado') {
        const cur = p.currency || 'USD';
        paymentsByCurrency[cur] = (paymentsByCurrency[cur] || 0) + p.amount;
      }
    }
    const totalConfirmedPayments = Object.keys(paymentsByCurrency).map(cur => ({
      currency: cur,
      amount: paymentsByCurrency[cur]
    }));

    const totalVerifiedContacts = this.data.contacts.filter(c => c.permission === 'autorizado' || (c.source && c.source.length > 3)).length;
    let totalMessagesSent = 0;
    let totalResponsesReceived = 0;
    for (const conv of this.data.conversations) {
      for (const m of conv.messages) {
        if (m.direction === 'outbound' && (m.status === 'enviado' || m.status === 'aceptado_proveedor' || m.status === 'entrega_confirmada')) {
          totalMessagesSent++;
        } else if (m.direction === 'inbound') {
          totalResponsesReceived++;
        }
      }
    }

    const pendingManualPayments = this.data.payments
      .filter(p => p.status === 'pendiente_confirmacion_manual')
      .map(p => {
        const client = this.data.clients.find(c => c.id === p.clientId);
        const app = this.data.applications.find(a => a.id === p.appId);
        return {
          id: p.id,
          clientName: p.clientName || client?.orgName || 'Cliente registrado',
          appName: app?.name || p.appId,
          amount: p.amount,
          currency: p.currency,
          channel: p.channel || p.method,
          createdAt: p.createdAt,
          reference: p.reference || p.referenceNumber
        };
      });

    const humanInterventionConversations = this.data.conversations
      .filter(c => c.requiresHumanIntervention)
      .map(c => {
        const contact = this.data.contacts.find(ct => ct.id === c.contactId);
        const app = this.data.applications.find(a => a.id === c.appId);
        const lastMsg = c.messages[c.messages.length - 1];
        return {
          id: c.id,
          contactName: contact?.orgName || contact?.contactPerson || 'Contacto',
          appName: app?.name || c.appId,
          lastMessageSnippet: lastMsg ? lastMsg.content.substring(0, 80) : '',
          reason: c.adminNote || 'Consulta no catalogada en FAQ oficial o solicitud de negociación especial.'
        };
      });

    const unconfiguredConnectors = this.data.connectors
      .filter(c => c.status !== 'conectado')
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        missingRequirements: c.missingRequirements
      }));

    const blockedCampaigns = this.data.campaigns
      .filter(c => c.status === 'bloqueada_por_configuracion')
      .map(c => {
        const app = this.data.applications.find(a => a.id === c.appId);
        return {
          id: c.id,
          name: c.name,
          appName: app?.name || c.appId,
          reason: c.blockingReason || 'Bloqueada por requisitos pendientes'
        };
      });

    let currentStage = 'Monitoreo de tareas y calendario en segundo plano';
    let currentStageDescription = 'Proceso de backend desacoplado del navegador ejecutando ciclos de verificación cada 30 segundos.';

    if (automationsPaused) {
      currentStage = 'Automatizaciones pausadas por el administrador';
      currentStageDescription = 'Todos los envíos y tareas desatendidas se encuentran temporalmente suspendidos.';
    } else if (activeCampaigns.length > 0) {
      currentStage = `Ejecución autónoma de ${activeCampaigns.length} campaña(s) activa(s)`;
      currentStageDescription = 'Comprobando límites diarios, ventanas de envío y reglas de seguimiento.';
    }

    return {
      whatIsDoingNow: {
        daemonStatus: automationsPaused ? 'pausado' : (daemonRunning ? 'activo' : 'detenido'),
        lastHeartbeat: this.data.scheduler.lastRunAt,
        activeCampaignsCount: activeCampaigns.length,
        activeJobsCount: this.data.scheduler.activeJobsCount,
        currentStage,
        currentStageDescription,
        automationsPaused
      },
      whatItAchieved: {
        totalVerifiedContacts,
        totalMessagesSent,
        totalResponsesReceived,
        totalInterested: this.data.contacts.filter(c => c.status === 'interesado').length,
        totalTrialClients: this.data.contacts.filter(c => c.status === 'en_prueba').length + this.data.subscriptions.filter(s => s.status === 'en_prueba').length,
        totalActiveClients: this.data.clients.length + this.data.subscriptions.filter(s => s.status === 'activa').length,
        totalConfirmedPayments,
        byApplication
      },
      whatItNeedsFromMe: {
        pendingManualPayments,
        humanInterventionConversations,
        unconfiguredConnectors,
        blockedCampaigns
      }
    };
  }

  // --- Próximo Hito: Validación de Recorrido Completo por Email (Sandbox de Prueba Controlada) ---
  public async executeEmailSandboxRun(params: {
    appId: string;
    testEmail: string;
    testOrgName: string;
    contactPerson?: string;
  }): Promise<EmailSandboxRunResponse> {
    // The previous walkthrough fabricated dispatch IDs and incoming replies.
    // Keep this endpoint fail-closed until an actual transport and inbox exist.
    throw new Error(
      'Prueba deshabilitada: el recorrido anterior simulaba envíos y respuestas. ' +
      'Todavía no hay un transporte de correo e ingreso de respuestas implementados. ' +
      'No se envió ningún email ni se creó un contacto o pago.'
    );
  }
}

export const db = new DatabaseManager();

