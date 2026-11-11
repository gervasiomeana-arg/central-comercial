export type AppStatus = 'en_desarrollo' | 'lista' | 'pausada';

export interface PlanItem {
  id: string;
  name: string;
  price: number;
  currency: string; // e.g. 'USD', 'EUR', 'BRL', 'ARS'
  interval: 'mensual' | 'anual' | 'trimestral' | 'unico';
  features: string[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  approved: boolean;
}

export interface PromoMaterial {
  id: string;
  title: string;
  url: string;
  type: 'pdf' | 'link' | 'video' | 'imagen';
}

export interface Application {
  id: string;
  name: string;
  slug: string;
  description: string;
  targetAudience: string;
  countries: string[];
  languages: string[];
  website: string;
  verifiedFeatures: string[];
  trialAvailable: boolean;
  trialDurationDays: number;
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
  id: string;
  orgName: string;
  contactPerson: string;
  role: string;
  orgType: string; // 'club', 'asociacion', 'agencia', 'empresa', 'familia', 'funeraria', 'otro'
  country: string;
  language: string;
  timezone: string;
  website: string;
  email: string;
  phone: string; // International format e.g. +55 11 99999-9999
  source: string; // Verifiable source (e.g. 'Federación Paulista de Voleibol - Directorio oficial')
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

export interface Campaign {
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
  sendWindowStart: string; // '09:00'
  sendWindowEnd: string; // '18:00'
  dailyLimit: number;
  startDate: string;
  endDate: string;
  maxFollowUps: number;
  followUpIntervalDays: number;
  stopCriteria: string[]; // e.g. ['respuesta_recibida', 'solicitud_baja']
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

export type MessageStatus = 'pendiente' | 'enviado' | 'fallido' | 'resultado_desconocido';

export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'whatsapp' | 'telegram';
  content: string;
  status: MessageStatus;
  serviceConfirmationId?: string; // Real connector confirmation id. Never mock if not confirmed!
  serviceError?: string;
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
  id: string;
  clientId: string;
  appId: string;
  planId: string;
  planName: string;
  currency: string;
  agreedAmount: number;
  billingInterval: 'mensual' | 'anual' | 'trimestral' | 'prueba';
  startDate: string;
  renewalDate: string;
  status: SubscriptionStatus;
  notes?: string;
}

export type PaymentStatus = 'pendiente_confirmacion_manual' | 'confirmado' | 'rechazado';

export interface PaymentRecord {
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
  reviewedBy?: string;
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

export interface CommercialTask {
  id: string;
  title: string;
  description: string;
  priority: 'alta' | 'media' | 'baja';
  category: 'seguimiento' | 'revision_pago' | 'intervencion_ia' | 'conector' | 'general';
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
  module: 'campañas' | 'conectores' | 'conversaciones' | 'pagos' | 'ia' | 'contactos' | 'sistema';
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
