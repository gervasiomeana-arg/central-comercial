export interface AssistantReport {
  createdAt: string;
  appId: string;
  appName: string;
  text: string;
  catalog?: { name: string; status: string; description: string; website: string; features: string[];
    plans: { name: string; price: number | null; currency: string; interval: string; market: string }[] }[];
}
export interface AssistantEntry {
  id: string;
  question: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  appId: string;
  appName: string;
  source: 'records' | 'openjarvis';
  answer?: string;
  error?: string;
  model?: string;
}
export interface AssistantState {
  entries: AssistantEntry[];
  ready: boolean;
  model: string;
}
