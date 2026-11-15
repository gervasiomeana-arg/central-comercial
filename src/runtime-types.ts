export type LocalComponentState = 'running' | 'missing' | 'stopped';
export interface LocalRuntimeState {
  online: boolean;
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
