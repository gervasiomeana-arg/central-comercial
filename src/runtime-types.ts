import type { DailyStatistics } from './types.js';

export interface RuntimeActivity {
  paused: boolean;
  lastCycleAt: string | null;
  pendingPromotions: number;
  completedPlans: number;
  campaignsUsingOpenJarvis: number;
  statistics: DailyStatistics;
}

export interface OwnerReportStatus {
  day: string;
  status: 'sin_intento' | 'aceptado_proveedor' | 'rechazado' | 'resultado_desconocido' | 'registro_no_disponible';
  at?: string;
}

export type LocalComponentState = 'running' | 'missing' | 'stopped';
export interface LocalRuntimeState {
  online: boolean;
  activity?: RuntimeActivity;
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
