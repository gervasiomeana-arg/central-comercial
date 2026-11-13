import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.js';
import { DashboardView } from './components/DashboardView.js';
import { ApplicationsView } from './components/ApplicationsView.js';
import { ContactsView } from './components/ContactsView.js';
import { CampaignsView } from './components/CampaignsView.js';
import { ConversationsView } from './components/ConversationsView.js';
import { ClientsView } from './components/ClientsView.js';
import { ConnectorsAndSystemView } from './components/ConnectorsAndSystemView.js';
import { AssistantView } from './components/AssistantView.js';
import { TasksModal } from './components/TasksModal.js';
import { AuthModal } from './components/AuthModal.js';
import { api } from './api.js';
import type {
  Application,
  AccountCharge,
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
  PersistenceStatus
} from './types.js';

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedAppFilter, setSelectedAppFilter] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('all');

  // Authentication & Security State
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [adminUser, setAdminUser] = useState<{ id: string; email: string; name: string } | undefined>(undefined);

  // Core Data States
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [accountCharges, setAccountCharges] = useState<AccountCharge[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [subscriptions, setSubscriptions] = useState<ClientSubscription[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [tasks, setTasks] = useState<CommercialTask[]>([]);
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<AutomationPipelineStatus | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerState>({
    isRunning: true,
    automationsPaused: false,
    lastRunAt: null,
    nextRunAt: null,
    activeJobsCount: 0,
    environmentNote: '',
    windowsExecutionGuide: ''
  });
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modals
  const [focusedClientId,setFocusedClientId] = useState<string|null>(null);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);

  // Fetch all initial data
  const loadData = useCallback(async () => {
    try {
      const auth = await api.getAuthStatus().catch(() => null);
      if (auth) {
        setAuthStatus(auth);
        if (auth.authenticated && auth.admin) {
          setAdminUser(auth.admin);
        } else {
          setAdminUser(undefined);
          setLoading(false);
          return;
        }
      }

      const [
        statusRes,
        dashMetrics,
        pipelineRes,
        persistenceRes,
        appsRes,
        contactsRes,
        campsRes,
        convsRes,
        clientsRes,
        subsRes,
        paysRes,
        tasksRes,
        connsRes,
        logsRes,
        chargesRes
      ] = await Promise.all([
        api.getStatus().catch(() => ({ appName: '', status: 'offline', scheduler, geminiConfigured: false })),
        api.getDashboardMetrics(selectedAppFilter, selectedPeriod).catch(() => null),
        api.getPipelineStatus().catch(() => null),
        api.getPersistenceStatus().catch(() => null),
        api.getApplications().catch(() => []),
        api.getContacts().catch(() => []),
        api.getCampaigns().catch(() => []),
        api.getConversations().catch(() => []),
        api.getClients().catch(() => []),
        api.getSubscriptions().catch(() => []),
        api.getPayments().catch(() => []),
        api.getTasks().catch(() => []),
        api.getConnectors().catch(() => []),
        api.getLogs().catch(() => []),
        api.getAccountCharges().catch(() => [])
      ]);

      if (statusRes && statusRes.scheduler) {
        setScheduler(statusRes.scheduler);
        setGeminiConfigured(Boolean(statusRes.geminiConfigured));
      }
      if (dashMetrics) setMetrics(dashMetrics);
      if (pipelineRes) setPipelineStatus(pipelineRes);
      if (persistenceRes) setPersistenceStatus(persistenceRes);
      setApplications(appsRes);
      setContacts(contactsRes);
      setCampaigns(campsRes);
      setConversations(convsRes);
      setClients(clientsRes);
      setSubscriptions(subsRes);
      setPayments(paysRes);
      setTasks(tasksRes);
      setConnectors(connsRes);
      setLogs(logsRes);
      setAccountCharges(chargesRes);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAppFilter, selectedPeriod]);

  // Handle unauthorized session expiration
  useEffect(() => {
    const handleUnauthorized = () => {
      setAuthStatus(prev => prev ? { ...prev, authenticated: false } : { configured: true, authenticated: false, setupKeyRequired: false });
      setAdminUser(undefined);
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    loadData();
    // Refresh background state every 20 seconds
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Actions
  const handleToggleAutomations = async () => {
    try {
      if (scheduler.automationsPaused) {
        const res = await api.resumeAutomations();
        setScheduler(res.scheduler);
      } else {
        const res = await api.pauseAutomations();
        setScheduler(res.scheduler);
      }
      loadData();
    } catch (err: any) {
      alert(`Error al cambiar estado de automatizaciones: ${err.message}`);
    }
  };

  const handleSaveApplication = async (app: Application) => {
    if (app.id && applications.some(a => a.id === app.id)) {
      await api.updateApplication(app.id, app);
    } else {
      await api.saveApplication(app);
    }
    await loadData();
  };

  const handleSaveContact = async (contact: Partial<Contact>): Promise<Contact> => {
    let saved: Contact;
    if (contact.id && contacts.some(c => c.id === contact.id)) {
      saved = await api.updateContact(contact.id, contact);
    } else {
      saved = await api.createContact(contact);
    }
    await loadData();
    return saved;
  };

  const handleDeleteContact = async (id: string) => {
    await api.deleteContact(id);
    await loadData();
  };

  const handleCheckDuplicates = async (contact: Partial<Contact>, excludeId?: string) => {
    return api.checkDuplicates(contact, excludeId);
  };

  const handleMergeContacts = async (targetId: string, sourceId: string) => {
    await api.mergeContacts(targetId, sourceId);
    await loadData();
  };

  const handlePreviewCsv = async (csvContent: string) => {
    return api.previewCsvImport(csvContent);
  };

  const handleCommitCsv = async (rows: any[], appId?: string) => {
    const res = await api.commitCsvImport(rows, appId);
    await loadData();
    return res.importedCount;
  };

  const handleConvertToClient = async (contactId: string) => {
    await api.convertContactToClient(contactId);
    await loadData();
  };

  const handleSaveCampaign = async (campaign: Campaign) => {
    if (campaign.id && campaigns.some(c => c.id === campaign.id)) {
      await api.updateCampaign(campaign.id, campaign);
    } else {
      await api.createCampaign(campaign);
    }
    await loadData();
  };

  const handleSendMessage = async (convId: string, msg: any) => {
    const res = await api.sendMessage(convId, msg);
    await loadData();
    return res;
  };

  const handleAiSuggest = async (params: any) => {
    return api.aiSuggestResponse(params);
  };

  const handleCreateConversation = async (conv: Partial<Conversation>) => {
    const res = await api.createConversation(conv);
    await loadData();
    return res;
  };

  const handleSaveSubscription = async (sub: ClientSubscription) => {
    await api.saveSubscription(sub);
    await loadData();
  };

  const handleSavePayment = async (payment: Partial<PaymentRecord>) => {
    await api.savePayment(payment);
    await loadData();
  };

  const handleReviewPayment = async (id: string, review: any) => {
    await api.reviewPayment(id, review);
    await loadData();
  };

  const handleUpdateTask = async (id: string, updates: Partial<CommercialTask>) => {
    await api.updateTask(id, updates);
    await loadData();
  };

  const handleCreateTask = async (task: Partial<CommercialTask>) => {
    await api.updateTask(task.id || `task-${Date.now()}`, task);
    await loadData();
  };

  const handleTestConnector = async (id: string) => {
    return api.testConnector(id);
  };

  const handleLogin = async (payload: { email: string; password: string }) => {
    const res = await api.login(payload);
    setAdminUser(res.admin);
    setAuthStatus({
      configured: true,
      authenticated: true,
      admin: res.admin,
      setupKeyRequired: false
    });
    await loadData();
  };

  const handleSetup = async (payload: { email: string; password: string; name: string; setupKey: string }) => {
    const res = await api.setupAdmin(payload);
    setAdminUser(res.admin);
    setAuthStatus({
      configured: true,
      authenticated: true,
      admin: res.admin,
      setupKeyRequired: false
    });
    await loadData();
  };

  const handleLogout = async () => {
    api.logout();
    setAdminUser(undefined);
    setAuthStatus(prev => prev ? { ...prev, authenticated: false } : null);
  };

  const errorLogsCount = logs.filter(l => l.level === 'error').length;
  const pendingTasksCount = tasks.filter(t => t.status === 'pendiente').length;

  return (
    <div className="cc-shell">
      {/* Global Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        automationsPaused={scheduler.automationsPaused}
        onToggleAutomations={handleToggleAutomations}
        pendingTasksCount={pendingTasksCount}
        openTasksModal={() => setTasksModalOpen(true)}
        errorLogsCount={errorLogsCount}
        openLogsModal={() => {
          setCurrentTab('system');
        }}
        selectedAppFilter={selectedAppFilter}
        setSelectedAppFilter={setSelectedAppFilter}
        applications={applications}
        schedulerRunning={scheduler.isRunning}
        adminUser={adminUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="cc-main">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Conectando a Central Comercial...</span>
          </div>
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <DashboardView
                onRefresh={loadData}
                onOpenGuidedCampaign={() => setCurrentTab('campaigns')}
                onOpenEmailSandbox={() => setCurrentTab('system')}
                metrics={metrics}
                campaigns={campaigns}
                contacts={contacts}
                applications={applications}
                tasks={tasks}
                pipelineStatus={pipelineStatus}
                persistenceStatus={persistenceStatus}
                onOpenTasks={() => setTasksModalOpen(true)}
                onOpenLogs={() => setCurrentTab('system')}
                onNavigateTab={tab => setCurrentTab(tab)}
                onToggleAutomations={handleToggleAutomations}
                selectedPeriod={selectedPeriod}
                setSelectedPeriod={setSelectedPeriod}
                selectedAppFilter={selectedAppFilter}
                setSelectedAppFilter={setSelectedAppFilter}
              />
            )}

            {currentTab === 'applications' && (
              <ApplicationsView
                applications={applications}
                onSaveApplication={handleSaveApplication}
                selectedAppFilter={selectedAppFilter}
              />
            )}

            {currentTab === 'contacts' && (
              <ContactsView
                contacts={contacts}
                applications={applications}
                onSaveContact={handleSaveContact}
                onDeleteContact={handleDeleteContact}
                onCheckDuplicates={handleCheckDuplicates}
                onMergeContacts={handleMergeContacts}
                onPreviewCsv={handlePreviewCsv}
                onCommitCsv={handleCommitCsv}
                onConvertToClient={handleConvertToClient}
                selectedAppFilter={selectedAppFilter}
              />
            )}

            {currentTab === 'campaigns' && (
              <CampaignsView
                campaigns={campaigns}
                applications={applications}
                connectors={connectors}
                onSaveCampaign={handleSaveCampaign}
                onPrepareCampaign={async (id) => { const result = await api.prepareCampaign(id); await loadData(); return result; }}
                selectedAppFilter={selectedAppFilter}
              />
            )}

            {currentTab === 'conversations' && (
              <ConversationsView
                conversations={conversations}
                contacts={contacts}
                applications={applications}
                campaigns={campaigns}
                tasks={tasks}
                onOpenClient={async (contactId,appId)=>{const client=await api.convertContactToClient(contactId);await loadData();setFocusedClientId(client.id);setSelectedAppFilter(appId);setCurrentTab('clients');}}
                onResolve={async (id,note)=>{await api.resolveConversation(id,note);await loadData();}}
                onSendMessage={handleSendMessage}
                onReviewDraft={async (conversationId, messageId, input) => { await api.reviewDraft(conversationId, messageId, input); await loadData(); }}
                onAiSuggest={handleAiSuggest}
                onCreateConversation={handleCreateConversation}
                selectedAppFilter={selectedAppFilter}
              />
            )}

            {currentTab === 'clients' && (
              <ClientsView
                contacts={contacts}
                focusedClientId={focusedClientId}
                clients={clients}
                subscriptions={subscriptions}
                payments={payments}
                applications={applications}
                accountCharges={accountCharges}
                onReconcileLedger={async () => { await api.reconcileLedger(); await loadData(); }}
                onVoidCharge={async (id, reason) => { await api.voidAccountCharge(id, reason); await loadData(); }}
                onAssignPayment={async (id, subId) => { await api.assignPayment(id, subId); await loadData(); }}
                onSaveSubscription={handleSaveSubscription}
                onSavePayment={handleSavePayment}
                onReviewPayment={handleReviewPayment}
                selectedAppFilter={selectedAppFilter}
              />
            )}

            {currentTab === 'assistant' && <AssistantView selectedAppFilter={selectedAppFilter} applications={applications} />}

            {currentTab === 'system' && (
              <ConnectorsAndSystemView
                connectors={connectors}
                logs={logs}
                scheduler={scheduler}
                onTestConnector={handleTestConnector}
                onToggleAutomations={handleToggleAutomations}
                geminiConfigured={geminiConfigured}
                persistenceStatus={persistenceStatus}
              />
            )}
          </>
        )}
      </main>

      {/* Admin Authentication & Setup Modal */}
      {authStatus && !authStatus.authenticated && (
        <AuthModal
          authStatus={authStatus}
          onLogin={handleLogin}
          onSetup={handleSetup}
        />
      )}

      {/* Global Tasks & Follow-ups Modal */}
      <TasksModal
        isOpen={tasksModalOpen}
        onClose={() => setTasksModalOpen(false)}
        tasks={tasks}
        onUpdateTask={handleUpdateTask}
        onCreateTask={handleCreateTask}
      />

      {/* Footer */}
      <footer className="cc-footer"><span>Central Comercial<span className="cc-heading-dot">.</span></span><span>Un espacio para hacer crecer tus ideas.</span></footer>
    </div>
  );
}

