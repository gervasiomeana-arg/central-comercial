import type { DailyStatistics } from './types.js';

export interface RuntimeActivity {
  paused: boolean;
  lastCycleAt: string | null;
  pendingPromotions: number;
  completedPlans: number;
  campaignsUsingOpenJarvis: number;
  campaignsAwaitingOpenJarvis?: number;
  statistics: DailyStatistics;
  overview?: RuntimeOverview[];
  delivery?: RuntimeDelivery;
}

export const deliveryCountKeys = [
  'emailBounces', 'pendingRetries', 'acceptedEmailRetries', 'acceptedWhatsAppRetries', 'failedRetries',
] as const;
export type RuntimeDelivery = Record<typeof deliveryCountKeys[number], number>;

export const pcUpdateStates = ['current', 'preparing', 'ready_for_restart', 'activated', 'error', 'activation_failed'] as const;
export interface PcUpdateStatus {
  status: typeof pcUpdateStates[number];
  at: string;
  targetCommit?: string;
  installedCommit?: string;
}

export interface OwnerReportStatus {
  day: string;
  status: 'sin_intento' | 'aceptado_proveedor' | 'entrega_confirmada' | 'rechazado' | 'resultado_desconocido' | 'registro_no_disponible';
  at?: string;
}

export const whatsappStages = ['starting', 'qr', 'pairing_required', 'loading', 'verifying', 'identity_unavailable', 'connected', 'server_rejected', 'auth_failed', 'restarting',
  'profile_busy', 'browser_access', 'browser_transport', 'web_unavailable', 'browser_launch', 'web_startup', 'session_timeout', 'phone_link', 'phone_link_failed'] as const;
export type WhatsAppStage = typeof whatsappStages[number];

export type LocalComponentState = 'running' | 'missing' | 'stopped';
export interface LocalRuntimeState {
  online: boolean;
  activity?: RuntimeActivity;
  update?: PcUpdateStatus;
  overviewRequiresAuth?: boolean;
  ownerReport?: OwnerReportStatus;
  startedAt?: number;
  ramGB?: number;
  model?: string;
  backupAt?: number;
  receivedAt?: number;
  lastSeenAt?: number;
  reportAt?: number;
  reportUnavailable?: boolean;
  diagnosticMode?: boolean;
  connections?: {email:boolean;whatsapp:boolean;intelligence:boolean};
  sourceFingerprint?: string;
  whatsappStage?: WhatsAppStage;
  components?: { email: LocalComponentState; whatsapp: LocalComponentState; intelligence: LocalComponentState };
  issues: string[];
}

export const overviewCountKeys = [
  'contactsTotal', 'contactsVerified', 'messagesSent', 'messagesPending',
  'responsesReceived', 'interestedCount', 'activeSubscriptionsCount', 'trialClientsCount', 'activeCampaigns',
] as const;

export type RuntimeOverview = Record<typeof overviewCountKeys[number],number> & {
  appId: string;
  contactsAccepted?: number;
  contactsAttempted?: number;
  dailyMarketActivity: string;
};
