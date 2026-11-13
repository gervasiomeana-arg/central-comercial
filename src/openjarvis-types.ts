export interface JarvisContext {
  app: { id: string; name: string; description: string; audience: string; website: string; features: string[] };
  country: string;
  goal: { month: string; targetClients: number; remainingClients: number; dailyEmailLimit: number; dailyResearchLimit: number };
}
export interface JarvisStrategy {
  segments: { name: string; reason: string }[];
  searchQueries: string[];
  campaignAngle: string;
  nextSteps: string[];
  ownerQuestions: string[];
}
export interface JarvisPlan {
  id: string;
  context: JarvisContext;
  state: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  model?: string;
  strategy?: JarvisStrategy;
  error?: string;
}
export interface JarvisStatus {
  configured: boolean;
  online: boolean;
  ready: boolean;
  model: string;
  detail: string;
  plans: JarvisPlan[];
}
