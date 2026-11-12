import type {
  Application,
  Contact,
  Campaign,
  Conversation,
  Client,
  ClientSubscription,
  PaymentRecord,
  CommercialTask,
  ConnectorInfo,
  AuditLog,
  DashboardMetrics,
  SchedulerState,
  AuthStatusResponse,
  AutomationPipelineStatus,
  PersistenceStatus,
  AdminUser,
  ExecutiveSummary,
  EmailSandboxRunResponse
} from './types.js';

const AUTH_TOKEN_KEY = 'central_comercial_auth_token';

export const authStorage = {
  getToken: (): string | null => {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setToken: (token: string) => {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      // ignore
    }
  },
  clearToken: () => {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = authStorage.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401 && !url.includes('/api/auth/')) {
    // Session expired or unauthorized
    authStorage.clearToken();
    window.dispatchEvent(new CustomEvent('auth-unauthorized'));
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `HTTP error ${res.status}`);
  }

  return res.json();
}

export const api = {
  getRealChannelTests: () => fetchJson<any>('/api/channel-tests'),
  startRealChannelTests: (channels: string[]) => fetchJson<any>('/api/channel-tests', {
    method: 'POST', body: JSON.stringify({ channels })
  }),
  // Public Auth & Status
  getStatus: () => fetchJson<{
    appName: string;
    status: string;
    scheduler: SchedulerState;
    persistence: PersistenceStatus;
    pipeline: AutomationPipelineStatus;
    adminConfigured: boolean;
    geminiConfigured: boolean;
  }>('/api/status'),

  getAuthStatus: () => fetchJson<AuthStatusResponse>('/api/auth/status'),

  setupAdmin: async (payload: { email: string; password: string; name: string; setupKey: string }) => {
    const res = await fetchJson<{ success: boolean; sessionToken: string; admin: AdminUser }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.sessionToken) {
      authStorage.setToken(res.sessionToken);
    }
    return res;
  },

  login: async (payload: { email: string; password: string }) => {
    const res = await fetchJson<{ success: boolean; sessionToken: string; admin: AdminUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.sessionToken) {
      authStorage.setToken(res.sessionToken);
    }
    return res;
  },

  logout: () => {
    fetchJson<{ success: boolean }>('/api/auth/logout', { method: 'POST' }).catch(() => {});
    authStorage.clearToken();
  },

  // Automation Pipeline & Persistence
  getPipelineStatus: () => fetchJson<AutomationPipelineStatus>('/api/automation/pipeline'),
  getPersistenceStatus: () => fetchJson<PersistenceStatus>('/api/system/persistence'),

  // Scheduler & Pause
  pauseAutomations: () => fetchJson<{ success: boolean; scheduler: SchedulerState }>('/api/automation/pause', { method: 'POST' }),
  resumeAutomations: () => fetchJson<{ success: boolean; scheduler: SchedulerState }>('/api/automation/resume', { method: 'POST' }),

  // Dashboard
  getDashboardMetrics: (app = 'all', period = 'all') => fetchJson<DashboardMetrics>(`/api/dashboard?app=${app}&period=${period}`),
  getExecutiveSummary: (app = 'all', period = 'all') => fetchJson<ExecutiveSummary>(`/api/dashboard/executive?app=${app}&period=${period}`),

  // Applications
  getApplications: () => fetchJson<Application[]>('/api/applications'),
  getApplication: (id: string) => fetchJson<Application>(`/api/applications/${id}`),
  saveApplication: (app: Application) => fetchJson<Application>('/api/applications', {
    method: 'POST',
    body: JSON.stringify(app)
  }),
  updateApplication: (id: string, app: Application) => fetchJson<Application>(`/api/applications/${id}`, {
    method: 'PUT',
    body: JSON.stringify(app)
  }),
  verifyPlan: (appId: string, planId: string, verified: boolean) =>
    fetchJson<Application>(`/api/applications/${appId}/plans/${planId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ verified })
    }),
  verifyFaq: (appId: string, faqId: string, approved: boolean) =>
    fetchJson<Application>(`/api/applications/${appId}/faqs/${faqId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ approved })
    }),

  // Contacts
  getContacts: (search = '', app = 'all', status = 'all') =>
    fetchJson<Contact[]>(`/api/contacts?search=${encodeURIComponent(search)}&app=${app}&status=${status}`),
  getContact: (id: string) => fetchJson<Contact>(`/api/contacts/${id}`),
  createContact: (contact: Partial<Contact>) => fetchJson<Contact>('/api/contacts', {
    method: 'POST',
    body: JSON.stringify(contact)
  }),
  updateContact: (id: string, contact: Partial<Contact>) => fetchJson<Contact>(`/api/contacts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(contact)
  }),
  deleteContact: (id: string) => fetchJson<{ success: boolean }>(`/api/contacts/${id}`, { method: 'DELETE' }),
  checkDuplicates: (contact: Partial<Contact>, excludeId?: string) =>
    fetchJson<{ hasDuplicates: boolean; matches: { matchedByEmail: Contact[]; matchedByPhone: Contact[]; matchedByDomain: Contact[] } }>(
      '/api/contacts/check-duplicates',
      { method: 'POST', body: JSON.stringify({ contact, excludeId }) }
    ),
  mergeContacts: (targetId: string, sourceId: string) =>
    fetchJson<{ success: boolean; contact: Contact }>('/api/contacts/merge', {
      method: 'POST',
      body: JSON.stringify({ targetId, sourceId })
    }),
  previewCsvImport: (csvContent: string) =>
    fetchJson<{ totalRows: number; validRowsCount: number; invalidRowsCount: number; errors: string[]; preview: any[]; allRows: any[] }>(
      '/api/contacts/import-preview',
      { method: 'POST', body: JSON.stringify({ csvContent }) }
    ),
  commitCsvImport: (rows: any[], appId?: string) =>
    fetchJson<{ success: boolean; importedCount: number; created: Contact[] }>('/api/contacts/import-commit', {
      method: 'POST',
      body: JSON.stringify({ rows, appId })
    }),

  prepareCampaign: (id: string) => fetchJson<NonNullable<Campaign['lastPreparation']>>(`/api/campaigns/${encodeURIComponent(id)}/prepare`, { method: 'POST' }),

  // Campaigns
  getCampaigns: () => fetchJson<Campaign[]>('/api/campaigns'),
  getCampaign: (id: string) => fetchJson<Campaign>(`/api/campaigns/${id}`),
  createCampaign: (campaign: Campaign) => fetchJson<Campaign>('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(campaign)
  }),
  updateCampaign: (id: string, campaign: Campaign) => fetchJson<Campaign>(`/api/campaigns/${id}`, {
    method: 'PUT',
    body: JSON.stringify(campaign)
  }),
  runEmailSandbox: (params: { appId: string; testEmail: string; testOrgName: string; contactPerson?: string }) =>
    fetchJson<EmailSandboxRunResponse>('/api/campaigns/sandbox-test-run', {
      method: 'POST',
      body: JSON.stringify(params)
    }),

  reviewDraft: (conversationId: string, messageId: string, input: { action: 'edit' | 'approve' | 'reject'; expectedRevision: number; content?: string }) => fetchJson(`/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/review`, { method: 'POST', body: JSON.stringify(input) }),

  // Conversations
  getConversations: () => fetchJson<Conversation[]>('/api/conversations'),
  getConversation: (id: string) => fetchJson<Conversation>(`/api/conversations/${id}`),
  createConversation: (conv: Partial<Conversation>) => fetchJson<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(conv)
  }),
  sendMessage: (convId: string, msg: { content: string; direction: 'inbound' | 'outbound'; channel: string; status: string; serviceConfirmationId?: string }) =>
    fetchJson<any>(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify(msg)
    }),
  aiSuggestResponse: (params: { appId: string; contactName: string; messageContent: string; conversationHistory: any[] }) =>
    fetchJson<any>('/api/conversations/ai-suggest', {
      method: 'POST',
      body: JSON.stringify(params)
    }),

  // Clients & Current Account
  getClients: () => fetchJson<Client[]>('/api/clients'),
  convertContactToClient: (contactId: string) => fetchJson<Client>('/api/clients/convert-from-contact', {
    method: 'POST',
    body: JSON.stringify({ contactId })
  }),
  getSubscriptions: () => fetchJson<ClientSubscription[]>('/api/subscriptions'),
  saveSubscription: (sub: ClientSubscription) => fetchJson<ClientSubscription>('/api/subscriptions', {
    method: 'POST',
    body: JSON.stringify(sub)
  }),
  getPayments: () => fetchJson<PaymentRecord[]>('/api/payments'),
  savePayment: (payment: Partial<PaymentRecord>) => fetchJson<PaymentRecord>('/api/payments', {
    method: 'POST',
    body: JSON.stringify(payment)
  }),
  reviewPayment: (id: string, review: { status: 'confirmado' | 'rechazado'; auditorNote?: string }) =>
    fetchJson<PaymentRecord>(`/api/payments/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(review)
    }),

  // Tasks
  getTasks: () => fetchJson<CommercialTask[]>('/api/tasks'),
  updateTask: (id: string, updates: Partial<CommercialTask>) => fetchJson<CommercialTask>(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  }),

  // Connectors
  getConnectors: () => fetchJson<ConnectorInfo[]>('/api/connectors'),
  testConnector: (id: string) => fetchJson<{ success: boolean; status: string; message: string; errorDetails?: string; providerResponse?: any; lastPingAt?: string }>(`/api/connectors/${id}/test`, {
    method: 'POST'
  }),

  // Logs
  getLogs: (level = 'all', module = 'all') => fetchJson<AuditLog[]>(`/api/logs?level=${level}&module=${module}`)
};

