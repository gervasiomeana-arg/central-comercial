import { SalesGoalPanel } from './SalesGoalPanel.js';
import React from 'react';
import { ArrowUpRight, ArrowRight, Layers, Users, Send, MessageSquare, CreditCard, Circle, ChevronRight, PlugZap, Check, Clock3 } from 'lucide-react';
import type { DashboardMetrics, Application, CommercialTask, AutomationPipelineStatus, PersistenceStatus, ExecutiveSummary, Campaign, Contact } from '../types.js';

interface DashboardViewProps {
  metrics: DashboardMetrics | null; executiveSummary?: ExecutiveSummary | null;
  applications: Application[]; tasks: CommercialTask[]; campaigns?: Campaign[]; contacts?: Contact[];
  pipelineStatus?: AutomationPipelineStatus | null; persistenceStatus?: PersistenceStatus | null;
  onOpenTasks: () => void; onOpenLogs: () => void; onNavigateTab: (tab: string) => void;
  onToggleAutomations: () => void; onOpenGuidedCampaign: () => void; onOpenEmailSandbox: () => void;
  onReviewPayment?: (id: string, review: any) => Promise<void>;
  selectedPeriod: string; setSelectedPeriod: (period: string) => void;
  selectedAppFilter: string; setSelectedAppFilter: (appId: string) => void;
}
export function DashboardView(props: DashboardViewProps) {
  const { metrics, applications, tasks, campaigns = [], contacts = [], pipelineStatus, selectedAppFilter } = props;
  if (!metrics) return <div className="cc-empty-page"><Clock3 size={24}/><p>Cargando tu resumen comercial…</p></div>;
  const apps = applications.filter(app => selectedAppFilter === 'all' || app.id === selectedAppFilter);
  const activeCampaigns = campaigns.filter(c => c.status === 'activa' && (selectedAppFilter === 'all' || c.appId === selectedAppFilter));
  const pending = tasks.filter(t => t.status === 'pendiente');
  const kpis = [
    { label: 'Contactos', value: metrics.contactsTotal, detail: metrics.contactsVerified + ' con fuente registrada', icon: Users },
    { label: 'Mensajes enviados', value: metrics.messagesSent, detail: metrics.messagesPending + ' pendientes', icon: Send },
    { label: 'Respuestas recibidas', value: metrics.responsesReceived, detail: metrics.interestedCount + ' interesados', icon: MessageSquare },
    { label: 'Suscripciones activas', value: metrics.activeSubscriptionsCount, detail: metrics.trialClientsCount + ' en período de prueba', icon: CreditCard }
  ];
  const channels = [
    { label: 'Búsqueda de contactos', ready: pipelineStatus?.autonomousContactSearch.status === 'conectado', action: pipelineStatus?.autonomousContactSearch.status === 'error' ? 'Requiere revisión' : 'Primera búsqueda pendiente' },
    { label: 'Envío de campañas', ready: pipelineStatus?.outboundMessaging.status === 'conectado', action: 'Pendiente de conexión' },
    { label: 'Recepción de respuestas', ready: pipelineStatus?.inboundResponseListening.status === 'conectado', action: 'Pendiente de conexión' }
  ];
  return <div className="cc-dashboard">
    <div className="cc-page-hero">
      <div><p className="cc-eyebrow">CENTRAL DE OPERACIONES</p><h1>Tu operación,<br className="cc-hero-break"/> en perspectiva<span className="cc-heading-dot">.</span></h1><p className="cc-hero-description">El pulso de tus aplicaciones, tus conversaciones y tus próximos clientes.</p></div>
      <button className="cc-button cc-button-primary" onClick={props.onOpenGuidedCampaign}>Nueva campaña <ArrowUpRight size={17}/></button>
    </div>

    <div className="cc-summary-toolbar">
      <div className="cc-summary-status"><span className={'cc-dot ' + (metrics.automationsPaused ? 'is-paused' : '')}/><span>{metrics.automationsPaused ? 'Tareas pausadas' : activeCampaigns.length ? activeCampaigns.length + ' campañas activas' : 'Sin campañas activas'}</span><span className="cc-toolbar-separator"/><span className="cc-muted">{apps.length} aplicaciones en tu espacio</span></div>
      <div className="cc-period-control" aria-label="Período del resumen">{[{id:'hoy',label:'Hoy'},{id:'7d',label:'7 días'},{id:'30d',label:'30 días'},{id:'all',label:'Todo'}].map(p => <button key={p.id} onClick={() => props.setSelectedPeriod(p.id)} aria-pressed={props.selectedPeriod === p.id} className={props.selectedPeriod === p.id ? 'is-active' : ''}>{p.label}</button>)}</div>
    </div>

    <section className="cc-kpi-grid" aria-label="Resultados comerciales">{kpis.map(kpi => <article className="cc-kpi-card" key={kpi.label}>
      <div className="cc-kpi-title"><span>{kpi.label}</span><kpi.icon size={17} strokeWidth={1.5}/></div><strong className="cc-kpi-value">{kpi.value.toLocaleString('es-AR')}</strong><span className="cc-kpi-detail">{kpi.detail}</span>
    </article>)}</section>

    <SalesGoalPanel selectedApp={selectedAppFilter} onNavigate={(tab,appId)=>{props.setSelectedAppFilter(appId);props.onNavigateTab(tab);}}/>
    <div className="cc-dashboard-columns">
      <section className="cc-panel cc-portfolio">
        <div className="cc-panel-heading"><div><p className="cc-eyebrow">PORTAFOLIO</p><h2>Tus aplicaciones</h2></div><button className="cc-text-button" onClick={() => props.onNavigateTab('applications')}>Ver todas <ArrowUpRight size={15}/></button></div>
        <div className="cc-portfolio-list">{apps.map((app, index) => {
          const count = contacts.filter(c => c.interestedAppIds.includes(app.id)).length;
          const running = campaigns.filter(c => c.appId === app.id && c.status === 'activa').length;
          return <button key={app.id} className="cc-application-row" onClick={() => { props.setSelectedAppFilter(app.id); props.onNavigateTab('applications'); }}>
            <span className={'cc-application-monogram cc-monogram-' + index}>{app.name.split(' ').map(w => w[0]).slice(0,2).join('')}</span>
            <span className="cc-application-info"><strong>{app.name}</strong><span>{app.description}</span></span>
            <span className="cc-application-stats"><strong>{count}</strong><span>contactos</span></span>
            <span className={'cc-status-tag ' + (app.status === 'en_desarrollo' ? 'is-pending' : app.status === 'pausada' ? 'is-neutral' : 'is-ready')}>{app.status === 'en_desarrollo' ? 'En desarrollo' : app.status === 'pausada' ? 'Pausada' : running ? 'En campaña' : 'Lista'}</span>
            <ArrowUpRight className="cc-row-arrow" size={17}/></button>;
        })}</div>
        <div className="cc-panel-foot"><Layers size={15}/><span>Una estrategia propia para cada aplicación.</span></div>
      </section>

      <div className="cc-side-panels">
        <section className="cc-panel cc-attention-panel">
          <div className="cc-panel-heading"><div><p className="cc-eyebrow">PRÓXIMOS PASOS</p><h2>Tu atención</h2></div><span className="cc-count-badge">{pending.length}</span></div>
          {pending.length ? <div className="cc-task-list">{pending.slice(0,3).map(task => <button key={task.id} onClick={props.onOpenTasks} className="cc-task-row"><span className={'cc-task-indicator ' + (task.priority === 'alta' ? 'is-priority' : '')}/><span><strong>{task.title}</strong><small>{task.priority === 'alta' ? 'Prioridad alta' : 'Pendiente de revisión'}</small></span><ChevronRight size={15}/></button>)}</div> : <div className="cc-calm-empty"><Check size={22}/><strong>Todo en orden</strong><p>No tenés tareas pendientes.</p></div>}
          <button className="cc-panel-link" onClick={props.onOpenTasks}>Revisar tareas <ArrowRight size={16}/></button>
        </section>
        <section className="cc-income-panel">
          <div className="cc-income-heading"><span className="cc-eyebrow">PAGOS CONFIRMADOS</span><CreditCard size={19} strokeWidth={1.3}/></div>
          {metrics.paymentsByCurrency.length ? metrics.paymentsByCurrency.map(p => <div className="cc-currency-value" key={p.currency}><span>{p.currency}</span><strong>{p.confirmedTotal.toLocaleString('es-AR',{maximumFractionDigits:2})}</strong></div>) : <div className="cc-income-empty">Sin movimientos<br/>confirmados.</div>}
          <p>Solo pagos revisados y confirmados.</p><button onClick={() => props.onNavigateTab('clients')}>Ver cuenta corriente <ArrowUpRight size={16}/></button>
        </section>
      </div>
    </div>

    <section className="cc-panel cc-connections-panel">
      <div className="cc-connections-intro"><span className="cc-outline-icon"><PlugZap size={22} strokeWidth={1.4}/></span><div><p className="cc-eyebrow">CAPACIDADES DEL SISTEMA</p><h2>Todo empieza por una buena conexión.</h2><p>Consultá qué está disponible y qué falta vincular.</p></div><button className="cc-text-button" onClick={props.onOpenEmailSandbox}>Configurar canales <ArrowUpRight size={16}/></button></div>
      <div className="cc-channel-overview">{channels.map(channel => <div className="cc-channel-item" key={channel.label}><span className={'cc-dot ' + (channel.ready ? '' : 'is-paused')}/><span><strong>{channel.label}</strong><small>{channel.ready ? 'Conectado' : channel.action}</small></span></div>)}</div>
    </section>
    {(metrics.messagesFailed > 0 || metrics.messagesUnknown > 0) && <button className="cc-quiet-alert" onClick={props.onOpenLogs}><Circle size={14}/>{metrics.messagesFailed} envíos fallidos · {metrics.messagesUnknown} sin confirmación. Revisar actividad<ArrowRight size={15}/></button>}
  </div>;
}

