export type LocalComponentState = 'running' | 'missing' | 'stopped';
export interface LocalRuntimeState {
  online: boolean;
  startedAt?: number;
  ramGB?: number;
  model?: string;
  backupAt?: number;
  components?: { email: LocalComponentState; whatsapp: LocalComponentState; intelligence: LocalComponentState };
  issues: string[];
}
