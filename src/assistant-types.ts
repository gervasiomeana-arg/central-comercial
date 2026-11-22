export interface AssistantReport {
  createdAt: string;
  appId: string;
  appName: string;
  text: string;
  dailyMarketActivity?: string;
  campaignScope?: CampaignChatScope;
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
  campaignProposal?: CampaignChatProposal;
}
export interface AssistantState {
  entries: AssistantEntry[];
  monitor?: boolean;
  campaignActions?: boolean;
  campaignJarvisReady?: boolean;
  ready: boolean;
  model: string;
}

export type CampaignChatAction = 'create' | 'update' | 'prepare' | 'activate' | 'pause';

export interface CampaignChatScope {
  countries: string[];
  campaign?: { id: string; name: string; country: string; status: string; objective: string; messageTemplate: string; revision: string };
}

export interface CampaignChatProposal {
  action: CampaignChatAction;
  campaignId?: string;
  revision?: string;
  name?: string;
  country?: string;
  objective?: string;
  messageTemplate?: string;
  applied?: string;
}
