export type AppStatus = 'en_desarrollo' | 'lista' | 'pausada';

export interface PlanItem {
  archived?: boolean;
  sourceUrl?: string;
  verifiedAt?: string;
  market?: string;
  id: string;
  name: string;
  price: number | null; // null if unverified / not yet set
  currency: string; // e.g. 'USD', 'EUR', 'BRL', 'ARS'
  interval: 'mensual' | 'anual' | 'trimestral' | 'unico' | 'por_definir';
  features: string[];
  verified: boolean; // Must be verified by admin to be used in AI responses or campaigns
  verificationNotes?: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  approved: boolean; // Must be approved by admin
  verified: boolean; // Verified against official sources
  verificationNotes?: string;
}

export interface PromoMaterial {
  id: string;
  title: string;
  url: string;
  type: 'pdf' | 'link' | 'video' | 'imagen';
}

export interface FeatureItem {
  id: string;
  name: string;
  verified: boolean;
  notes?: string;
}

export interface Application {
  commercialCatalogVersion?: string;
  commercialNotes?: string;
  id: string;
  name: string;
  slug: string;
  description: string;
  targetAudience: string;
  countries: string[];
  languages: string[];
  website: string;
  verifiedFeatures: string[]; // List of confirmed features
  unverifiedFeatures?: string[]; // Held for admin review
  trialAvailable: boolean;
  trialVerified: boolean; // Must be verified by admin
  trialDurationDays: number | null;
  plans: PlanItem[];
  registerUrl: string;
  paymentUrl: string;
  faqs: FaqItem[];
  promotionalMaterials: PromoMaterial[];
  status: AppStatus;
  campaignsAllowed: boolean;
  medicalDisclaimer?: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
}

export type ContactPermission = 'desconocido' | 'autorizado' | 'revocado';

export type CommercialStatus =
  | 'prospecto'
  | 'contactado'
  | 'interesado'
  | 'en_prueba'
  | 'cliente'
  | 'descartado'
  | 'baja_solicitada';

export interface ContactHistoryItem {
  id: string;
  timestamp: string;
  type: 'creacion' | 'mensaje_enviado' | 'mensaje_recibido' | 'cambio_estado' | 'nota' | 'conversion_cliente' | 'fusion_duplicado';
  description: string;
  author: string;
}

export interface Contact {
  whatsappConsent?:{granted:boolean;at:string;evidence:string};
  outreachBasis?: 'public_business_contact';
  id: string;
  orgName: string;
  contactPerson: string;
  role: string;
  orgType: string;
  country: string;
  language: string;
  timezone: string;
  website: string;
  email: string;
  phone: string;
  source: string;
  sourceReviewDate: string;
  interestedAppIds: string[];
  assignedTo: string;
  notes: string;
  history: ContactHistoryItem[];
  preferredChannel: 'email' | 'whatsapp' | 'telegram' | 'telefono' | 'web';
  permission: ContactPermission;
  status: CommercialStatus;
  nextFollowUpDate: string | null;
  convertedToClientId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus =
  | 'borrador'
  | 'lista'
  | 'activa'
  | 'pausada'
  | 'finalizada'
  | 'bloqueada_por_configuracion';

export type CampaignMode = 'manual' | 'revision_previa' | 'automatico';

export interface ResearchEvidence {
  url: string; title: string; appId: string; country: string;
  topicVerified: boolean; countryVerified: boolean;
}
export interface ResearchCandidate { url: string; context?: ResearchEvidence; returnTo?: string; attempts?: number; retryAt?: number; }
export interface ResearchOutcome { at: string; query: string; created: number; reused: number; checked: number; reasons: Record<string,number>; }
export interface ResearchState {
  month: string; day: string; requests: number; visited: string[];
  blocked?: boolean; lastError?: string; lastSuccess?: string;
  status?: 'pending'|'running'|'ready'|'quota'|'waiting'|'error'; detail?: string;
}
export interface Campaign {
  intelligenceRecoveryVersion?: number;
  autoSendWhatsApp?:boolean;
  intelligenceEnabled?:boolean;
  intelligencePlanId?:string;
  intelligenceRequestId?:string;
  intelligenceError?:string;
  intelligenceNextAttemptAt?:number;
  maxContacts?: number;
  goalMonth?: string;
  autoSendEmail?: boolean;
  allowPublicEmail?: boolean;
  researchQueries?: string[];
  researchSegment?: string;
  lastResearchAt?: string;
  researchCount?: number;
  researchDay?: string;
  researchQueryVersion?: number;
  researchQueryIndex?: number;
  researchQueriesToday?: number;
  researchQueue?: ResearchCandidate[];
  researchSeenUrls?: string[];
  researchLastOutcome?: ResearchOutcome;
  researchNextAttemptAt?: number;
  autoPrepare?: boolean;
  lastPreparation?: { at: string; created: number; skipped: Record<string, number>; blockedReason?: string };
  id: string;
  appId: string;
  name: string;
  objective: string;
  country: string;
  language: string;
  segment: string;
  channels: ('email' | 'whatsapp' | 'telegram')[];
  messageTemplate: string;
  followUpTemplates: string[];
  timezone: string;
  sendWindowStart: string;
  sendWindowEnd: string;
  dailyLimit: number;
  startDate: string;
  endDate: string;
  maxFollowUps: number;
  followUpIntervalDays: number;
  stopCriteria: string[];
  mode: CampaignMode;
  status: CampaignStatus;
  blockingReason?: string;
  stats: {
    contactsCount: number;
    messagesPending: number;
    messagesSent: number;
    messagesFailed: number;
    messagesUnknown: number;
    responsesReceived: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type MessageClassification =
  | 'interesado'
  | 'solicita_informacion'
  | 'solicita_demostracion'
  | 'consulta_precio'
  | 'quiere_suscribirse'
  | 'informa_pago'
  | 'no_interesado'
  | 'solicita_baja'
  | 'requiere_intervencion'
  | 'sin_clasificar';

export type MessageStatus =
  | 'preparado'
  | 'envio_intentado'
  | 'aceptado_proveedor'
  | 'entrega_confirmada'
  | 'respuesta_recibida'
  | 'fallido'
  | 'resultado_desconocido'
  | 'pendiente'
  | 'enviado';

export interface Message {
  providerChatId?:string;
  providerMessageId?: string;
  replyToProviderId?: string;
  emailSubject?: string;
  sendLease?: string;
  sendWorker?: string;
  sendDeadline?: number;
  draftRevision?: number;
  approvedRecipient?: string;
  reviewStatus?: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
  reviewedBy?: string;
  editedAt?: string;
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'whatsapp' | 'telegram';
  content: string;
  status: MessageStatus;
  serviceConfirmationId?: string;
  serviceError?: string;
  providerEvidence?: string;
  attemptedAt?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  sentAt?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  appId: string;
  campaignId?: string | null;
  channel: 'email' | 'whatsapp' | 'telegram';
  classification: MessageClassification;
  requiresHumanIntervention: boolean;
  adminNote?: string;
  messages: Message[];
  lastMessageAt: string;
  createdAt: string;
}

export type SubscriptionStatus = 'en_prueba' | 'activa' | 'vencida' | 'cancelada';

export interface ClientSubscription {
  ledgerEnabled?: boolean;
  ledgerStartDate?: string;
  id: string;
  clientId: string;
  appId: string;
  planId: string;
  planName: string;
  currency: string;
  agreedAmount: number;
  billingInterval: 'mensual' | 'anual' | 'trimestral' | 'prueba' | 'unico';
  startDate: string;
  renewalDate: string;
  status: SubscriptionStatus;
  notes?: string;
}

export type PaymentStatus = 'pendiente_confirmacion_manual' | 'confirmado' | 'rechazado';

export interface MonthlySalesGoal {
  directorEnabled?: boolean; directorChannels?: ('email'|'whatsapp')[];
  month: string; targetClients: number; enabled: boolean;
  discoverContacts: boolean; sendEmail: boolean; answerEmail: boolean;
  countries: string[]; dailyEmailLimit: number; dailyResearchLimit: number;
  updatedAt: string;
}

export interface PaymentRecord {
  ledgerAssignedAt?: string;
  // Compatibility with existing stored records created by earlier versions.
  reference?: string;
  clientName?: string;
  channel?: string;
  id: string;
  clientId: string;
  subscriptionId?: string;
  appId: string;
  amount: number;
  currency: string;
  method: 'transferencia_bancaria' | 'stripe' | 'mercadopago' | 'tarjeta' | 'efectivo' | 'otro';
  referenceNumber: string;
  receiptUrl?: string;
  paymentDate: string;
  status: PaymentStatus;
  auditorNote?: string;
  reviewedBy?: string; // Authenticated admin email
  reviewedAt?: string;
  createdAt: string;
}

export interface Client {
  id: string;
  contactId?: string;
  orgName: string;
  contactPerson: string;
  email: string;
  phone: string;
  country: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountCharge {
  id: string; clientId: string; subscriptionId: string; appId: string;
  currency: string; amount: number; periodStart: string; periodEnd: string; dueDate: string;
  status: 'vigente' | 'anulado'; createdAt: string;
  voidReason?: string; voidedAt?: string; voidedBy?: string;
}

export interface CommercialTask {
  id: string;
  title: string;
  description: string;
  priority: 'alta' | 'media' | 'baja';
  category: 'seguimiento' | 'revision_pago' | 'intervencion_ia' | 'conector' | 'general' | 'vencimiento';
  relatedType?: 'contacto' | 'pago' | 'conversacion' | 'campaña' | 'conector';
  relatedId?: string;
  dueDate: string | null;
  status: 'pendiente' | 'completada' | 'cancelada';
  createdAt: string;
}

export type ConnectorStatus = 'pendiente_conexion' | 'conectado' | 'error';

export interface ConnectorInfo {
  id: string;
  name: string;
  type: 'email_smtp' | 'whatsapp_cloud' | 'telegram' | 'webhook';
  status: ConnectorStatus;
  statusDescription: string;
  missingRequirements: string[];
  configSummary: Record<string, string>;
  lastPingAt?: string;
  lastError?: string;
  documentationUrl?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  module: 'campañas' | 'conectores' | 'conversaciones' | 'pagos' | 'ia' | 'contactos' | 'sistema' | 'seguridad';
  message: string;
  details?: Record<string, any>;
}

export interface SchedulerState {
  isRunning: boolean;
  automationsPaused: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  activeJobsCount: number;
  environmentNote: string;
  windowsExecutionGuide: string;
}

export interface CurrencyTotal {
  currency: string;
  confirmedTotal: number;
  pendingTotal: number;
}

export interface DashboardMetrics {
  period: string;
  appFilter: string;
  contactsTotal: number;
  contactsVerified: number;
  messagesPending: number;
  messagesSent: number;
  messagesFailed: number;
  messagesUnknown: number;
  responsesReceived: number;
  interestedCount: number;
  trialClientsCount: number;
  activeSubscriptionsCount: number;
  expiredSubscriptionsCount: number;
  paymentsByCurrency: CurrencyTotal[];
  pendingPaymentsCount: number;
  pendingTasksCount: number;
  connectorsNeedingAttention: number;
  automationsPaused: boolean;
}

// Security & Authentication Types
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin';
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthStatusResponse {
  configured: boolean;
  authenticated: boolean;
  admin?: { id: string; email: string; name: string };
  setupKeyRequired: boolean;
}

// Real Automation Pipeline Status (Strict separation of capabilities)
export interface AutomationPipelineStatus {
  internalTaskScheduler: {
    status: 'activo' | 'pausado' | 'detenido';
    description: string;
    lastTick: string | null;
  };
  autonomousContactSearch: {
    status: 'pendiente_conexion' | 'conectado' | 'error';
    description: string;
    details: string;
  };
  outboundMessaging: {
    status: 'pendiente_conexion' | 'conectado';
    description: string;
    details: string;
  };
  inboundResponseListening: {
    status: 'pendiente_conexion' | 'conectado';
    description: string;
    details: string;
  };
}

export interface PersistenceStatus {
  storageType: 'local_json_db' | 'postgresql';
  filePath: string;
  fileSizeBytes: number;
  backupCount: number;
  lastBackupAt: string | null;
  environmentDurabilityNotice: string;
  postgresConfigured?: boolean;
  postgresUriFormat?: string;
}

export type CampaignStage =
  | 'buscar'
  | 'verificar'
  | 'preparar'
  | 'enviar'
  | 'recibir'
  | 'responder'
  | 'seguimiento';

export interface SandboxStepResult {
  step: number;
  name: string;
  stage: CampaignStage;
  status: 'completado' | 'bloqueado' | 'atencion_requerida';
  evidence: string;
  nextDependency: string;
  details?: Record<string, any>;
}

export interface EmailSandboxRunResponse {
  success: boolean;
  appId: string;
  appName: string;
  testEmail: string;
  testOrgName: string;
  timestamp: string;
  steps: SandboxStepResult[];
  summary: string;
}

export interface ExecutiveSummary {
  whatIsDoingNow: {
    daemonStatus: 'activo' | 'pausado' | 'detenido';
    lastHeartbeat: string | null;
    activeCampaignsCount: number;
    activeJobsCount: number;
    currentStage: string;
    currentStageDescription: string;
    automationsPaused: boolean;
  };
  whatItAchieved: {
    totalVerifiedContacts: number;
    totalMessagesSent: number;
    totalResponsesReceived: number;
    totalInterested: number;
    totalTrialClients: number;
    totalActiveClients: number;
    totalConfirmedPayments: { currency: string; amount: number }[];
    byApplication: {
      appId: string;
      appName: string;
      status: string;
      contactsVerified: number;
      messagesSent: number;
      responsesReceived: number;
      interestedCount: number;
      trialCount: number;
      clientsCount: number;
    }[];
  };
  whatItNeedsFromMe: {
    pendingManualPayments: {
      id: string;
      clientName: string;
      appName: string;
      amount: number;
      currency: string;
      channel: string;
      createdAt: string;
      reference?: string;
    }[];
    humanInterventionConversations: {
      id: string;
      contactName: string;
      appName: string;
      lastMessageSnippet: string;
      reason: string;
    }[];
    unconfiguredConnectors: {
      id: string;
      name: string;
      type: string;
      missingRequirements: string[];
    }[];
    blockedCampaigns: {
      id: string;
      name: string;
      appName: string;
      reason: string;
    }[];
  };
}


export interface AutonomousRun {
  id: string; campaignId: string; appId: string; country: string;
  maxContacts: number; startedAt: string;
}
export interface StartAutonomousInput {
  channels?:('email'|'whatsapp')[];useLocalIntelligence?:boolean;
  appId: string; country: string; maxContacts: number;
  targetClients: number; sendWindowStart: string; sendWindowEnd: string;
}
