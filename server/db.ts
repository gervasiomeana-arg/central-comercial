import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Application,
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
} from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'central_comercial_db.json');

export interface DatabaseSchema {
  version: number;
  updatedAt: string;
  scheduler: SchedulerState;
  applications: Application[];
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

const INITIAL_APPLICATIONS: Application[] = [
  {
    id: 'app-open-voley',
    name: 'Open Voley',
    slug: 'open-voley',
    description: 'Plataforma integral de scouting táctico y análisis estadístico de voleibol para entrenadores, cuerpos técnicos, clubes y asociaciones.',
    targetAudience: 'Entrenadores de voleibol profesional y formativo, analistas de rendimiento, directores deportivos de clubes, asociaciones y federaciones.',
    countries: ['Brasil', 'Argentina', 'España', 'Italia', 'México', 'Colombia'],
    languages: ['pt-BR', 'es', 'it', 'en'],
    website: 'https://openvoley.com',
    verifiedFeatures: [
      'Registro táctico en vivo punto por punto',
      'Scouting de rotaciones y mapas de calor de saques y ataques',
      'Sincronización de video y clips por jugada',
      'Reportes tácticos exportables en PDF para charlas de equipo',
      'Modo offline para partidos sin conexión con sincronización posterior'
    ],
    trialAvailable: true,
    trialDurationDays: 14,
    plans: [
      {
        id: 'ov-plan-club-basico',
        name: 'Club Básico',
        price: 29,
        currency: 'USD',
        interval: 'mensual',
        features: ['1 Equipo', 'Estadísticas esenciales', 'Exportación PDF', 'Soporte vía email']
      },
      {
        id: 'ov-plan-club-pro',
        name: 'Club Pro',
        price: 69,
        currency: 'USD',
        interval: 'mensual',
        features: ['Equipos ilimitados', 'Scouting táctico avanzado', 'Sincronización de video', 'Multi-usuario cuerpo técnico', 'Soporte prioritario']
      },
      {
        id: 'ov-plan-federacion',
        name: 'Federación / Asociación',
        price: 199,
        currency: 'USD',
        interval: 'mensual',
        features: ['Múltiples clubes federados', 'Torneos completos', 'Base de datos unificada', 'Capacitación presencial/remota']
      }
    ],
    registerUrl: 'https://openvoley.com/registro',
    paymentUrl: 'Pendiente de configurar',
    faqs: [
      {
        id: 'ov-faq-1',
        question: '¿Se necesita conexión a internet en la cancha durante el partido?',
        answer: 'No. Open Voley cuenta con modo de toma de datos offline. Podés cargar el partido completo sin conexión y los datos se sincronizan automáticamente cuando el dispositivo vuelve a tener internet.',
        approved: true
      },
      {
        id: 'ov-faq-2',
        question: '¿En qué dispositivos se puede utilizar?',
        answer: 'Funciona en tablets (iPad y tablets Android modernas), laptops y cualquier navegador web actual.',
        approved: true
      },
      {
        id: 'ov-faq-3',
        question: '¿Ofrecen período de prueba para evaluar la plataforma?',
        answer: 'Sí, disponemos de 14 días de prueba gratuita sin compromiso para probar el scouting en tus entrenamientos y partidos de pretemporada.',
        approved: true
      }
    ],
    promotionalMaterials: [
      {
        id: 'ov-mat-1',
        title: 'Ficha Técnica Open Voley (PDF)',
        url: 'https://openvoley.com/docs/ficha-tecnica.pdf',
        type: 'pdf'
      }
    ],
    status: 'lista',
    campaignsAllowed: true,
    internalNotes: 'Priorizar clubes de vóley de Brasil (Superliga y ligas estaduales) y federaciones de Argentina y España.',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z'
  },
  {
    id: 'app-visibility-ai',
    name: 'Visibility AI',
    slug: 'visibility-ai',
    description: 'Auditoría automatizada de sitios web, visibilidad digital orgánica, rendimiento técnico y recomendaciones accionables para empresas y agencias.',
    targetAudience: 'Agencias de marketing digital, consultores de SEO/visibilidad, directores de marketing de PYMES y e-commerce.',
    countries: ['España', 'México', 'Colombia', 'Argentina', 'Chile', 'Estados Unidos'],
    languages: ['es', 'en'],
    website: 'Pendiente de configurar',
    verifiedFeatures: [
      'Auditoría técnica de Core Web Vitals y velocidad móvil',
      'Diagnóstico de indexación y estructura de rastreo',
      'Evaluación de preparación para motores de búsqueda de IA (AI Search Readiness)',
      'Reportes marca blanca para agencias exportables en PDF',
      'Alertas de caídas de rendimiento y enlaces rotos'
    ],
    trialAvailable: true,
    trialDurationDays: 7,
    plans: [
      {
        id: 'vai-plan-starter',
        name: 'Starter PYME',
        price: 49,
        currency: 'USD',
        interval: 'mensual',
        features: ['Hasta 3 dominios', 'Escaneo semanal', 'Reportes estándar', 'Soporte email']
      },
      {
        id: 'vai-plan-agency',
        name: 'Agency Pro',
        price: 149,
        currency: 'USD',
        interval: 'mensual',
        features: ['Dominios ilimitados', 'Escaneos diarios', 'Reportes con marca blanca', 'API de auditorías', 'Soporte prioritario']
      }
    ],
    registerUrl: 'Pendiente de configurar',
    paymentUrl: 'Pendiente de configurar',
    faqs: [
      {
        id: 'vai-faq-1',
        question: '¿Cómo se ejecuta la auditoría del sitio web?',
        answer: 'Se realiza mediante un escaneo externo no invasivo sobre las URLs públicas del sitio. No requiere instalar scripts, plugins ni alterar el código del servidor del cliente.',
        approved: true
      },
      {
        id: 'vai-faq-2',
        question: '¿Las agencias pueden entregar el reporte con su propio logo?',
        answer: 'Sí. El plan Agency Pro permite personalizar el PDF con el logotipo, colores corporativos y datos de contacto de la agencia.',
        approved: true
      }
    ],
    promotionalMaterials: [],
    status: 'lista',
    campaignsAllowed: true,
    internalNotes: 'Enfocar prospección en agencias digitales medianas con cartera activa de clientes que busquen automatizar sus auditorías mensuales.',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z'
  },
  {
    id: 'app-neuroplaneta',
    name: 'NeuroPlaneta',
    slug: 'neuroplaneta',
    description: 'Plataforma lúdica de actividades y juegos interactivos para niños de 4 a 12 años, con módulo de acompañamiento para adultos y registro de tiempo de uso.',
    targetAudience: 'Familias con niños en edad escolar, educadores, centros lúdicos y de estimulación temprana.',
    countries: ['España', 'Argentina', 'México', 'Colombia', 'Chile'],
    languages: ['es'],
    website: 'Pendiente de configurar',
    verifiedFeatures: [
      'Catálogo de juegos interactivos de atención, memoria, lógica y creatividad',
      'Panel de control parental para adultos con configuración de límites de tiempo',
      'Registro de actividades realizadas y evolución lúdica',
      'Actividades guiadas para realizar juntos adultos y niños',
      'Entorno seguro sin publicidad ni compras integradas para menores'
    ],
    trialAvailable: true,
    trialDurationDays: 7,
    plans: [
      {
        id: 'np-plan-familia-mensual',
        name: 'Plan Familia Mensual',
        price: 12,
        currency: 'USD',
        interval: 'mensual',
        features: ['Hasta 3 perfiles de niños', 'Acceso a todos los juegos', 'Panel de registro de uso', 'Cancelación en cualquier momento']
      },
      {
        id: 'np-plan-familia-anual',
        name: 'Plan Familia Anual',
        price: 99,
        currency: 'USD',
        interval: 'anual',
        features: ['Ahorro del 30%', 'Perfiles ilimitados', 'Guías de actividades descargables para imprimir', 'Nuevos juegos mensuales']
      }
    ],
    registerUrl: 'Pendiente de configurar',
    paymentUrl: 'Pendiente de configurar',
    faqs: [
      {
        id: 'np-faq-1',
        question: '¿NeuroPlaneta diagnostica o trata alguna condición médica, TDAH o autismo?',
        answer: 'NO. NeuroPlaneta es estrictamente una herramienta lúdica y educativa de entretenimiento acompañado. No constituye una herramienta de diagnóstico, tratamiento clínico, evaluación psicológica ni intervención médica de ningún tipo. Ante cualquier inquietud sobre la salud o el desarrollo infantil, debe consultarse siempre a profesionales de la salud matriculados.',
        approved: true
      },
      {
        id: 'np-faq-2',
        question: '¿Los niños pueden utilizar la aplicación solos?',
        answer: 'NeuroPlaneta promueve expresamente el acompañamiento y supervisión de un adulto responsable para enriquecer la experiencia compartida.',
        approved: true
      }
    ],
    promotionalMaterials: [],
    status: 'lista',
    campaignsAllowed: true,
    medicalDisclaimer: 'ADVERTENCIA ESTRICTA: NeuroPlaneta no es ni debe presentarse como herramienta de diagnóstico ni tratamiento médico o psicológico.',
    internalNotes: 'Nunca asociar con claims médicos ni diagnósticos en ninguna comunicación o mensaje de prospección.',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z'
  },
  {
    id: 'app-funeraria',
    name: 'Funeraria',
    slug: 'funeraria',
    description: 'Sistema integral de gestión operativa y administrativa para empresas de servicios funerarios, salas velatorias, traslados y cementerios parque. Actualmente en desarrollo activo.',
    targetAudience: 'Empresas de servicios fúnebres, salas velatorias independientes, mutuales y cooperativas de previsión social funeraria.',
    countries: ['Argentina', 'Uruguay', 'Chile', 'España'],
    languages: ['es'],
    website: 'Pendiente de configurar (En desarrollo)',
    verifiedFeatures: [
      'Gestión de expedientes de servicios y actas de defunción (en desarrollo)',
      'Control de inventario de ataúdes, urnas y suministros (en desarrollo)',
      'Agenda de salas velatorias y coordinación de traslados (en desarrollo)'
    ],
    trialAvailable: false,
    trialDurationDays: 0,
    plans: [],
    registerUrl: 'Pendiente de configurar',
    paymentUrl: 'Pendiente de configurar',
    faqs: [
      {
        id: 'fun-faq-1',
        question: '¿El software Funeraria ya se encuentra disponible para su contratación comercial?',
        answer: 'Actualmente el software se encuentra en etapa activa de desarrollo y homologación técnica. Las campañas comerciales permanecen expresamente suspendidas hasta concluir la versión 1.0 y recibir autorización de lanzamiento.',
        approved: true
      }
    ],
    promotionalMaterials: [],
    status: 'en_desarrollo',
    campaignsAllowed: false,
    internalNotes: 'BLOQUEO ACTIVO: Mantener sus campañas desactivadas hasta completar su información técnica y autorizar formalmente su lanzamiento.',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z'
  }
];

const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp-open-voley-brasil-clubes',
    appId: 'app-open-voley',
    name: 'Open Voley — Clubes de Brasil',
    objective: 'Prospección directa a directores deportivos y entrenadores de clubes de voleibol de Brasil para presentar la prueba gratuita de 14 días.',
    country: 'Brasil',
    language: 'pt-BR',
    segment: 'Clubes federados de voleibol (Superliga A, B e campeonatos estaduais) e colégios esportivos.',
    channels: ['email', 'whatsapp'],
    messageTemplate: 'Olá {nombre}, acompanhamos o excelente trabalho da comissão técnica do {organizacion}.\n\nGostaria de apresentar o Open Voley (https://openvoley.com), plataforma de scouting e análise tática desenvolvida especialmente para treinadores e clubes.\n\nDisponibilizamos 14 dias de teste gratuito sem compromisso para os seus próximos jogos.\n\nSeria interessante agendarmos uma demonstração rápida de 10 minutos esta semana?',
    followUpTemplates: [
      'Olá {nombre}, tudo bem? Queria verificar se você teve oportunidade de ver a mensagem anterior sobre o teste gratuito do Open Voley para o {organizacion}. Podemos liberar o acesso em 5 minutos.',
      'Olá {nombre}, compreendo que a rotina de treinos e jogos seja intensa. Se fizer sentido mais adiante no campeonato, ficamos à disposição pelo site https://openvoley.com. Um abraço!'
    ],
    timezone: 'America/Sao_Paulo',
    sendWindowStart: '09:00',
    sendWindowEnd: '18:00',
    dailyLimit: 25,
    startDate: '2026-11-15',
    endDate: '2026-12-31',
    maxFollowUps: 2,
    followUpIntervalDays: 4,
    stopCriteria: ['respuesta_recibida', 'solicitud_baja', 'contacto_convertido'],
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
    statusDescription: 'Pendiente de conexión. No se realizarán envíos por correo hasta contar con credenciales verificadas.',
    missingRequirements: [
      'Servidor SMTP (Host, Puerto, TLS)',
      'Usuario y Contraseña / API Key de envío (ej. Resend / SendGrid / Postmark / Brevo)',
      'Dirección de correo remitente verificada (From Email con SPF/DKIM)'
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
    statusDescription: 'Pendiente de conexión. Requiere aplicación en Meta for Developers y número comercial validado.',
    missingRequirements: [
      'Phone Number ID de Meta Business',
      'System User Permanent Access Token',
      'WhatsApp Business Account ID (WABA)',
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
    statusDescription: 'Pendiente de conexión. Opcional para alertas internas al administrador o atención comercial.',
    missingRequirements: [
      'Bot Token (@BotFather)',
      'Chat ID del administrador para alertas de intervención'
    ],
    configSummary: {
      botUsername: 'No configurado',
      tokenConfigured: 'No'
    }
  },
  {
    id: 'conn-webhooks',
    name: 'Webhooks de Entrada y Pasarelas de Pago',
    type: 'webhook',
    status: 'pendiente_conexion',
    statusDescription: 'Pendiente de conexión. En esta etapa los pagos se verifican manualmente.',
    missingRequirements: [
      'Endpoint público con HTTPS para recepción de webhooks',
      'Clave secreta de firma de webhook (Webhook Signing Secret)'
    ],
    configSummary: {
      webhookUrl: '/api/webhooks/incoming',
      secretConfigured: 'No'
    }
  }
];

const INITIAL_LOGS: AuditLog[] = [
  {
    id: 'log-init-1',
    timestamp: new Date().toISOString(),
    level: 'info',
    module: 'sistema',
    message: 'Central Comercial inicializada con 4 aplicaciones (Open Voley, Visibility AI, NeuroPlaneta, Funeraria).',
    details: { version: '1.0.0', storage: 'local_json_db' }
  },
  {
    id: 'log-init-2',
    timestamp: new Date().toISOString(),
    level: 'warning',
    module: 'conectores',
    message: 'Conectores de correo y WhatsApp marcados como "Pendiente de conexión". Todo envío permanece deshabilitado hasta verificación.',
    details: { pendingConnectors: ['conn-email-smtp', 'conn-whatsapp-cloud'] }
  },
  {
    id: 'log-init-3',
    timestamp: new Date().toISOString(),
    level: 'info',
    module: 'campañas',
    message: 'Campaña "Open Voley — Clubes de Brasil" cargada como borrador editable sin destinatarios inventados.',
    details: { campaignId: 'camp-open-voley-brasil-clubes' }
  }
];

const INITIAL_SCHEDULER: SchedulerState = {
  isRunning: false,
  automationsPaused: false,
  lastRunAt: null,
  nextRunAt: null,
  activeJobsCount: 0,
  environmentNote: 'El motor programado del backend procesará tareas cuando el proceso Node.js esté activo. Mantener abierta la pestaña del navegador no es necesario si se ejecuta como servicio o tarea en segundo plano.',
  windowsExecutionGuide: 'Para ejecutar en Windows de forma autónoma sin depender del navegador:\n1. Instalar Node.js v20+ en Windows.\n2. Abrir PowerShell o CMD en la carpeta del proyecto y ejecutar "npm run start" o instalar PM2 con "npm install -g pm2" y "pm2 start server.ts --name central-comercial".\n3. Alternativamente, configurar el script scripts/run-scheduler-windows.bat en el Programador de Tareas de Windows (Task Scheduler) para que se ejecute al iniciar sesión.'
};

class DatabaseManager {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirectory();
    this.data = this.load();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Ensure all required collections exist
        return {
          version: parsed.version || 1,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          scheduler: parsed.scheduler || INITIAL_SCHEDULER,
          applications: parsed.applications || INITIAL_APPLICATIONS,
          contacts: parsed.contacts || [],
          campaigns: parsed.campaigns || INITIAL_CAMPAIGNS,
          conversations: parsed.conversations || [],
          clients: parsed.clients || [],
          subscriptions: parsed.subscriptions || [],
          payments: parsed.payments || [],
          tasks: parsed.tasks || [],
          connectors: parsed.connectors || INITIAL_CONNECTORS,
          logs: parsed.logs || INITIAL_LOGS
        };
      }
    } catch (err) {
      console.error('Error reading database file, using defaults:', err);
    }

    const initial: DatabaseSchema = {
      version: 1,
      updatedAt: new Date().toISOString(),
      scheduler: INITIAL_SCHEDULER,
      applications: INITIAL_APPLICATIONS,
      contacts: [],
      campaigns: INITIAL_CAMPAIGNS,
      conversations: [],
      clients: [],
      subscriptions: [],
      payments: [],
      tasks: [
        {
          id: 'task-initial-1',
          title: 'Configurar credenciales del conector SMTP para Open Voley',
          description: 'Cargar servidor de correo saliente para habilitar el envío de invitaciones de prueba de Open Voley a clubes de Brasil.',
          priority: 'alta',
          category: 'conector',
          relatedType: 'conector',
          relatedId: 'conn-email-smtp',
          dueDate: null,
          status: 'pendiente',
          createdAt: new Date().toISOString()
        },
        {
          id: 'task-initial-2',
          title: 'Definir enlaces de pago y registro para Visibility AI y NeuroPlaneta',
          description: 'Cargar las URLs oficiales de registro y cobro en las fichas de Visibility AI y NeuroPlaneta.',
          priority: 'media',
          category: 'general',
          relatedType: 'campaña',
          dueDate: null,
          status: 'pendiente',
          createdAt: new Date().toISOString()
        }
      ],
      connectors: INITIAL_CONNECTORS,
      logs: INITIAL_LOGS
    };

    this.saveDirect(initial);
    return initial;
  }

  private saveDirect(data: DatabaseSchema) {
    this.ensureDirectory();
    data.updatedAt = new Date().toISOString();
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  }

  public save() {
    this.saveDirect(this.data);
  }

  public getRaw(): DatabaseSchema {
    return this.data;
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
    // Keep max 500 logs in storage
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
    
    // Funeraria guardrail: campaigns must remain blocked if app is en_desarrollo
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
      this.addLog('info', 'contactos', `Contacto actualizado: ${contact.orgName} (${contact.contactPerson || 'Sin contacto directo'})`);
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
    const target = this.getContactById(targetId);
    const source = this.getContactById(sourceId);
    if (!target || !source) {
      throw new Error('Contacto de destino o fuente no encontrado');
    }

    // Merge non-empty fields
    if (!target.contactPerson && source.contactPerson) target.contactPerson = source.contactPerson;
    if (!target.email && source.email) target.email = source.email;
    if (!target.phone && source.phone) target.phone = source.phone;
    if (!target.website && source.website) target.website = source.website;
    if (!target.role && source.role) target.role = source.role;

    // Merge interested apps
    target.interestedAppIds = Array.from(new Set([...target.interestedAppIds, ...source.interestedAppIds]));

    // Merge history
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

    // Append notes
    if (source.notes) {
      target.notes = `${target.notes ? target.notes + '\n\n' : ''}[Notas del duplicado fusionado ${source.id}]:\n${source.notes}`;
    }

    // Re-link conversations
    for (const conv of this.data.conversations) {
      if (conv.contactId === source.id) {
        conv.contactId = target.id;
      }
    }

    // Remove source
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

  // --- Campaigns ---
  public getCampaigns(): Campaign[] {
    return this.data.campaigns;
  }

  public getCampaignById(id: string): Campaign | undefined {
    return this.data.campaigns.find(c => c.id === id);
  }

  public saveCampaign(campaign: Campaign): { campaign: Campaign; error?: string } {
    const app = this.getApplicationById(campaign.appId);
    if (!app) {
      return { campaign, error: 'La aplicación asociada a la campaña no existe.' };
    }

    // Strict guardrail 1: Funeraria in development cannot have active campaigns
    if (app.id === 'app-funeraria' || app.slug === 'funeraria' || app.status === 'en_desarrollo') {
      if (campaign.status === 'activa') {
        campaign.status = 'bloqueada_por_configuracion';
        campaign.blockingReason = `La aplicación ${app.name} se encuentra en desarrollo. Sus campañas están estrictamente bloqueadas hasta autorizar su lanzamiento.`;
      }
    }

    // Strict guardrail 2: Connectors must be connected before activating campaigns
    if (campaign.status === 'activa') {
      const needsEmail = campaign.channels.includes('email');
      const needsWhatsapp = campaign.channels.includes('whatsapp');
      
      const emailConn = this.data.connectors.find(c => c.type === 'email_smtp');
      const whatsappConn = this.data.connectors.find(c => c.type === 'whatsapp_cloud');

      const missing: string[] = [];
      if (needsEmail && emailConn?.status !== 'conectado') missing.push('Servidor de Correo (SMTP)');
      if (needsWhatsapp && whatsappConn?.status !== 'conectado') missing.push('WhatsApp Business API');

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

    // Update contact history if outbound or inbound
    const contact = this.getContactById(conv.contactId);
    if (contact) {
      contact.history.push({
        id: `hist-${Date.now()}`,
        timestamp: newMsg.createdAt,
        type: newMsg.direction === 'outbound' ? 'mensaje_enviado' : 'mensaje_recibido',
        description: `${newMsg.direction === 'outbound' ? 'Mensaje saliente' : 'Mensaje recibido'} (${newMsg.channel}) - Estado: ${newMsg.status}`,
        author: newMsg.direction === 'outbound' ? 'Sistema / Agente' : (contact.contactPerson || contact.orgName)
      });
      contact.updatedAt = new Date().toISOString();
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
    const index = this.data.subscriptions.findIndex(s => s.id === sub.id);
    if (index >= 0) {
      this.data.subscriptions[index] = sub;
      this.addLog('info', 'pagos', `Suscripción actualizada para cliente ID ${sub.clientId}`);
    } else {
      this.data.subscriptions.unshift(sub);
      this.addLog('info', 'pagos', `Nueva suscripción registrada: ${sub.planName} (${sub.currency} ${sub.agreedAmount})`);
    }
    this.save();
    return sub;
  }

  public getPayments(): PaymentRecord[] {
    return this.data.payments;
  }

  public savePayment(payment: PaymentRecord): PaymentRecord {
    const index = this.data.payments.findIndex(p => p.id === payment.id);
    if (index >= 0) {
      this.data.payments[index] = payment;
      this.addLog('info', 'pagos', `Pago ID ${payment.id} modificado. Estado: ${payment.status}`);
    } else {
      payment.createdAt = new Date().toISOString();
      this.data.payments.unshift(payment);
      this.addLog('info', 'pagos', `Nuevo cobro registrado: ${payment.currency} ${payment.amount} (Ref: ${payment.referenceNumber || 'S/N'})`);
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
    this.addLog('warning', 'conectores', `Conector ${connector.name} actualizado. Estado: ${connector.status}`);
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

    // Currency totals breakdown WITHOUT mixing
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

    // Messages counts from conversations
    let messagesPending = 0;
    let messagesSent = 0;
    let messagesFailed = 0;
    let messagesUnknown = 0;
    let responsesReceived = 0;

    for (const conv of this.data.conversations) {
      if (appFilter !== 'all' && conv.appId !== appFilter) continue;
      for (const m of conv.messages) {
        if (m.direction === 'outbound') {
          if (m.status === 'pendiente') messagesPending++;
          else if (m.status === 'enviado') messagesSent++;
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
}

export const db = new DatabaseManager();
