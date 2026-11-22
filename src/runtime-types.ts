import type { DailyStatistics } from './types.js';

export interface RuntimeActivity {
  paused: boolean;
  lastCycleAt: string | null;
  pendingPromotions: number;
  completedPlans: number;
  campaignsUsingOpenJarvis: number;
  statistics: DailyStatistics;
  overview?: RuntimeOverview[];
}

export interface OwnerReportStatus {
  day: string;
  status: 'sin_intento' | 'aceptado_proveedor' | 'entrega_confirmada' | 'rechazado' | 'resultado_desconocido' | 'registro_no_disponible';
  at?: string;
}

export type LocalComponentState = 'running' | 'missing' | 'stopped';
export interface LocalRuntimeState {
  online: boolean;
  activity?: RuntimeActivity;
  overviewRequiresAuth?: boolean;
  ownerReport?: OwnerReportStatus;
  startedAt?: number;
  ramGB?: number;
  model?: string;
  backupAt?: number;
  receivedAt?: number;
  diagnosticMode?: boolean;
  connections?: {email:boolean;whatsapp:boolean;intelligence:boolean};
  sourceFingerprint?: string;
  components?: { email: LocalComponentState; whatsapp: LocalComponentState; intelligence: LocalComponentState };
  issues: string[];
}

export const overviewCountKeys = [
  'contactsTotal', 'contactsVerified', 'messagesSent', 'messagesPending',
  'responsesReceived', 'interestedCount', 'activeSubscriptionsCount', 'trialClientsCount', 'activeCampaigns',
] as const;

export type RuntimeOverview = Record<typeof overviewCountKeys[number],number> & {
  appId: string;
  dailyMarketActivity: string;
};
