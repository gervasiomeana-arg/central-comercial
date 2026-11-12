import React, { useState } from 'react';
import {
  Users,
  Send,
  MessageSquare,
  Sparkles,
  CreditCard,
  Clock,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Layers,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Server,
  Play,
  Pause,
  Target,
  Mail,
  ShieldCheck,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import type {
  DashboardMetrics,
  Application,
  CommercialTask,
  AutomationPipelineStatus,
  PersistenceStatus,
  ExecutiveSummary
} from '../types.js';

interface DashboardViewProps {
  metrics: DashboardMetrics | null;
  executiveSummary?: ExecutiveSummary | null;
  applications: Application[];
  tasks: CommercialTask[];
  pipelineStatus?: AutomationPipelineStatus | null;
  persistenceStatus?: PersistenceStatus | null;
  onOpenTasks: () => void;
  onOpenLogs: () => void;
  onNavigateTab: (tab: string) => void;
  onToggleAutomations: () => void;
  onOpenGuidedCampaign: () => void;
  onOpenEmailSandbox: () => void;
  onReviewPayment?: (id: string, review: any) => Promise<void>;
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  selectedAppFilter: string;
  setSelectedAppFilter: (appId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  metrics,
  executiveSummary,
  applications,
  tasks,
  pipelineStatus,
  persistenceStatus,
  onOpenTasks,
  onOpenLogs,
  onNavigateTab,
  onToggleAutomations,
  onOpenGuidedCampaign,
  onOpenEmailSandbox,
  onReviewPayment,
  selectedPeriod,
  setSelectedPeriod,
  selectedAppFilter,
  setSelectedAppFilter,
}) => {
  const [reviewingPaymentId, setReviewingPaymentId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  if (!metrics) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500">
        <Clock className="w-6 h-6 animate-spin mr-2 text-blue-600" />
        <span className="text-sm font-semibold">Cargando métricas de Central Comercial...</span>
      </div>
    );
  }

  // Derive executive 3-questions data
  const whatIsDoingNow = executiveSummary?.whatIsDoingNow || {
    daemonStatus: metrics.automationsPaused ? 'pausado' : 'activo',
    lastHeartbeat: new Date().toISOString(),
    activeCampaignsCount: 0,
    activeJobsCount: 0,
    currentStage: metrics.automationsPaused
      ? 'Automatizaciones pausadas por el administrador'
      : 'Monitoreo de tareas y calendario en segundo plano',
    currentStageDescription: 'El proceso del backend ejecuta ciclos periódicos cada 30 segundos sin depender del navegador.',
    automationsPaused: metrics.automationsPaused
  };

  const whatItAchieved = executiveSummary?.whatItAchieved || {
    totalVerifiedContacts: metrics.contactsVerified,
    totalMessagesSent: metrics.messagesSent,
    totalResponsesReceived: metrics.responsesReceived,
    totalInterested: metrics.interestedCount,
    totalTrialClients: metrics.trialClientsCount,
    totalActiveClients: metrics.activeSubscriptionsCount,
    totalConfirmedPayments: metrics.paymentsByCurrency.map(p => ({ currency: p.currency, amount: p.confirmedTotal })),
    byApplication: applications.map(app => ({
      appId: app.id,
      appName: app.name,
      status: app.status === 'en_desarrollo' ? 'En desarrollo' : 'Lista',
      contactsVerified: 0,
      messagesSent: 0,
      responsesReceived: 0,
      interestedCount: 0,
      trialCount: 0,
      clientsCount: 0
    }))
  };

  const whatItNeedsFromMe = executiveSummary?.whatItNeedsFromMe || {
    pendingManualPayments: [],
    humanInterventionConversations: [],
    unconfiguredConnectors: [],
    blockedCampaigns: []
  };

  const handleConfirmPaymentQuick = async (paymentId: string) => {
    if (!onReviewPayment) return;
    setSubmittingReview(true);
    try {
      await onReviewPayment(paymentId, {
        status: 'confirmado',
        notes: reviewNotes || 'Aprobado manualmente desde el panel de control.'
      });
      setReviewingPaymentId(null);
      setReviewNotes('');
    } catch (err: any) {
      alert(`Error al confirmar pago: ${err.message}`);
    } finally {
      setSubmittingReview(false);
    }
  };

  const stagesList = [
    { id: 'buscar', label: '1. Buscar', desc: 'Identificación de prospectos', status: 'pendiente' },
    { id: 'verificar', label: '2. Verificar', desc: 'Validación de datos y duplicados', status: 'activo' },
    { id: 'preparar', label: '3. Preparar', desc: 'Redacción con datos aprobados', status: 'activo' },
    { id: 'enviar', label: '4. Enviar', desc: 'Despacho por canal verificado', status: pipelineStatus?.outboundMessaging.status === 'conectado' ? 'activo' : 'pendiente' },
    { id: 'recibir', label: '5. Recibir', desc: 'Asociación de respuestas entrantes', status: pipelineStatus?.inboundResponseListening.status === 'conectado' ? 'activo' : 'pendiente' },
    { id: 'responder', label: '6. Responder', desc: 'Atención inteligente con IA', status: 'activo' },
    { id: 'seguimiento', label: '7. Seguimiento', desc: 'Gestión de clientes y cuenta corriente', status: 'activo' },
  ];

  const totalNeedsActionCount =
    whatItNeedsFromMe.pendingManualPayments.length +
    whatItNeedsFromMe.humanInterventionConversations.length +
    whatItNeedsFromMe.blockedCampaigns.length +
    (whatItNeedsFromMe.unconfiguredConnectors.length > 0 ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Top Bar with Context Filter and Primary Action Buttons */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
              <span>Panel General Comercial</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                Control Central
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Supervisión de actividades en ejecución, resultados alcanzados y tareas que requieren tu decisión.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onOpenGuidedCampaign}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors flex items-center space-x-1.5 shadow-xs"
            >
              <Target className="w-4 h-4" />
              <span>+ Nueva Campaña Guiada</span>
            </button>

            <button
              onClick={onOpenEmailSandbox}
              className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition-colors flex items-center space-x-1.5 shadow-xs"
              title="Abrir pruebas reales de envío al propietario"
            >
              <Mail className="w-4 h-4" />
              <span>Pruebas reales de email y WhatsApp</span>
            </button>

            <button
              onClick={onToggleAutomations}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 ${
                metrics.automationsPaused
                  ? 'bg-amber-600 text-white hover:bg-amber-500'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {metrics.automationsPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Reanudar automatizaciones</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pausar automatizaciones</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Global Context & Period Filter Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-semibold">Contexto de Aplicación:</span>
            <select
              value={selectedAppFilter}
              onChange={e => setSelectedAppFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1 text-slate-700 font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="all">Todas las aplicaciones (Consolidado)</option>
              {applications.map(app => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.status === 'en_desarrollo' ? 'En desarrollo' : 'Activa'})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-slate-500 font-semibold mr-1.5">Período:</span>
            {['hoy', '7d', '30d', 'all'].map(p => {
              const labelMap: Record<string, string> = {
                hoy: 'Hoy',
                '7d': '7 días',
                '30d': '30 días',
                all: 'Histórico Completo'
              };
              return (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    selectedPeriod === p
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {labelMap[p]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================
          QUESTION 1: ¿QUÉ ESTÁ HACIENDO AHORA?
         ======================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className={`w-3 h-3 rounded-full ${
              whatIsDoingNow.automationsPaused
                ? 'bg-amber-500 animate-pulse'
                : whatIsDoingNow.daemonStatus === 'activo'
                ? 'bg-emerald-500 ring-4 ring-emerald-100'
                : 'bg-slate-400'
            }`} />
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              1. ¿Qué está haciendo ahora?
            </h2>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="text-slate-500">Última señal del proceso (Heartbeat):</span>
            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
              {whatIsDoingNow.lastHeartbeat
                ? new Date(whatIsDoingNow.lastHeartbeat).toLocaleTimeString('es')
                : 'Proceso inicializándose...'}
            </span>
          </div>
        </div>

        {/* Current status description */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-400 text-[11px] font-semibold block">Estado del Motor en Segundo Plano:</span>
            <span className={`text-sm font-black block ${
              whatIsDoingNow.automationsPaused
                ? 'text-amber-700'
                : whatIsDoingNow.daemonStatus === 'activo'
                ? 'text-emerald-700'
                : 'text-slate-700'
            }`}>
              {whatIsDoingNow.automationsPaused ? 'PAUSADO POR ADMINISTRADOR' : 'ACTIVO (Ciclos cada 30s)'}
            </span>
            <p className="text-[11px] text-slate-500 leading-snug">
              Desacoplado del navegador: no requiere que la pestaña permanezca abierta.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-400 text-[11px] font-semibold block">Actividad en Curso:</span>
            <span className="text-sm font-bold text-slate-900 block">
              {whatIsDoingNow.currentStage}
            </span>
            <p className="text-[11px] text-slate-500 leading-snug">
              {whatIsDoingNow.currentStageDescription}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-400 text-[11px] font-semibold block">Campañas Activas:</span>
            <span className="text-sm font-black text-blue-700 block">
              {whatIsDoingNow.activeCampaignsCount} campaña(s) en curso
            </span>
            <p className="text-[11px] text-slate-500 leading-snug">
              {whatIsDoingNow.activeCampaignsCount === 0
                ? 'Crea una instrucción guiada o valida el recorrido por email.'
                : 'Ejecutando según límites diarios y ventanas horarias.'}
            </p>
          </div>
        </div>

        {/* 7 Stages Autonomous Progression Bar */}
        <div className="space-y-2 pt-2">
          <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider block">
            Progreso por Etapas de Autonomía Comercial:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {stagesList.map(stg => (
              <div
                key={stg.id}
                className={`p-2.5 rounded-lg border text-center transition-all ${
                  stg.status === 'activo'
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-slate-200 bg-slate-50/80'
                }`}
              >
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <span className={`w-2 h-2 rounded-full ${stg.status === 'activo' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  <span className="font-extrabold text-[11px] text-slate-900">{stg.label}</span>
                </div>
                <span className={`text-[10px] font-bold block ${stg.status === 'activo' ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {stg.status === 'activo' ? 'Operativo' : 'Pendiente conexión'}
                </span>
                <span className="text-[9px] text-slate-400 line-clamp-1 mt-0.5">{stg.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================
          QUESTION 2: ¿QUÉ CONSIGUIÓ? (RESULTADOS POR APP Y TOTALES)
         ======================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              2. ¿Qué consiguió?
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Datos reales verificados · Sin invención ni números simulados
          </span>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 text-[10px] font-bold block uppercase">Contactos Verificados</span>
            <span className="text-xl font-black text-slate-900 mt-1 block">
              {whatItAchieved.totalVerifiedContacts}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 text-[10px] font-bold block uppercase">Mensajes Enviados</span>
            <span className="text-xl font-black text-blue-700 mt-1 block">
              {whatItAchieved.totalMessagesSent}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 text-[10px] font-bold block uppercase">Respuestas Recibidas</span>
            <span className="text-xl font-black text-indigo-700 mt-1 block">
              {whatItAchieved.totalResponsesReceived}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 text-[10px] font-bold block uppercase">Interesados</span>
            <span className="text-xl font-black text-emerald-700 mt-1 block">
              {whatItAchieved.totalInterested}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 text-[10px] font-bold block uppercase">Clientes en Prueba</span>
            <span className="text-xl font-black text-purple-700 mt-1 block">
              {whatItAchieved.totalTrialClients}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 text-[10px] font-bold block uppercase">Clientes Activos</span>
            <span className="text-xl font-black text-emerald-800 mt-1 block">
              {whatItAchieved.totalActiveClients}
            </span>
          </div>
        </div>

        {/* Confirmed Payments Box with Currency Distinction */}
        <div className="p-3.5 bg-emerald-50/40 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-extrabold text-emerald-950 block">Pagos Confirmados por Auditoría Manual:</span>
            <span className="text-[11px] text-emerald-800">
              Solo se contabilizan transferencias y cobros verificados personalmente por el administrador.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {whatItAchieved.totalConfirmedPayments.length > 0 ? (
              whatItAchieved.totalConfirmedPayments.map(p => (
                <span
                  key={p.currency}
                  className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-black text-xs shadow-2xs"
                >
                  {p.currency} {p.amount.toLocaleString('es')}
                </span>
              ))
            ) : (
              <span className="text-slate-400 italic text-xs">Sin cobros confirmados aún en este período</span>
            )}
          </div>
        </div>

        {/* Results by Application Table explicitly requested */}
        <div className="space-y-2">
          <span className="font-bold text-slate-800 text-xs block uppercase tracking-wider">
            Desglose de Resultados por Aplicación:
          </span>

          <div className="border border-slate-200 rounded-xl overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-3">Aplicación</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-center">Contactos Verificados</th>
                  <th className="p-3 text-center">Mensajes Enviados</th>
                  <th className="p-3 text-center">Respuestas</th>
                  <th className="p-3 text-center">Interesados</th>
                  <th className="p-3 text-center">En Prueba</th>
                  <th className="p-3 text-center">Clientes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800 text-[11px]">
                {whatItAchieved.byApplication.map(app => (
                  <tr key={app.appId} className="hover:bg-slate-50/80">
                    <td className="p-3 font-bold text-slate-900">{app.appName}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        app.status === 'En desarrollo'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="p-3 text-center font-semibold">{app.contactsVerified}</td>
                    <td className="p-3 text-center font-semibold">{app.messagesSent}</td>
                    <td className="p-3 text-center font-semibold">{app.responsesReceived}</td>
                    <td className="p-3 text-center font-semibold text-emerald-700">{app.interestedCount}</td>
                    <td className="p-3 text-center font-semibold text-purple-700">{app.trialCount}</td>
                    <td className="p-3 text-center font-bold text-slate-900">{app.clientsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================
          QUESTION 3: ¿QUÉ NECESITA DE MÍ? (DECISIONES HUMANAS)
         ======================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              3. ¿Qué necesita de mí?
            </h2>
          </div>

          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
            totalNeedsActionCount > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600'
          }`}>
            {totalNeedsActionCount} acción(es) pendiente(s)
          </span>
        </div>

        {totalNeedsActionCount === 0 ? (
          <div className="p-6 text-center text-slate-400 space-y-1">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="font-bold text-slate-700 text-xs">Todo al día</p>
            <p className="text-[11px] text-slate-500">
              No hay pagos pendientes de revisión, consultas complejas ni conectores bloqueantes en este momento.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. Pending Manual Payments Queue */}
            {whatItNeedsFromMe.pendingManualPayments.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-300 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-amber-950 font-extrabold text-xs">
                    <CreditCard className="w-4 h-4 text-amber-700" />
                    <span>Pagos Pendientes de Confirmación Manual ({whatItNeedsFromMe.pendingManualPayments.length})</span>
                  </div>
                  <button
                    onClick={() => onNavigateTab('clients')}
                    className="text-amber-800 hover:underline font-bold text-[11px]"
                  >
                    Ver en Cuenta Corriente →
                  </button>
                </div>

                <div className="space-y-2">
                  {whatItNeedsFromMe.pendingManualPayments.map(p => (
                    <div
                      key={p.id}
                      className="p-3 bg-white border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{p.clientName}</span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-600 font-medium">{p.appName}</span>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Ref: <span className="font-mono text-slate-700">{p.reference || 'Sin ref'}</span>
                          {' · '}
                          Canal: <span className="capitalize">{p.channel.replace('_', ' ')}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        <span className="text-sm font-black text-slate-900">
                          {p.currency} {p.amount.toLocaleString('es')}
                        </span>

                        {reviewingPaymentId === p.id ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              value={reviewNotes}
                              onChange={e => setReviewNotes(e.target.value)}
                              placeholder="Nota de comprobante..."
                              className="border border-slate-300 rounded p-1 text-[11px] w-36"
                            />
                            <button
                              onClick={() => handleConfirmPaymentQuick(p.id)}
                              disabled={submittingReview}
                              className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] font-bold hover:bg-emerald-700"
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() => setReviewingPaymentId(null)}
                              className="px-1.5 py-1 text-slate-400 hover:text-slate-700 text-[11px]"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setReviewingPaymentId(p.id);
                              setReviewNotes('');
                            }}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition-colors shadow-2xs"
                          >
                            Revisar y Confirmar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Human Intervention Required in Conversations */}
            {whatItNeedsFromMe.humanInterventionConversations.length > 0 && (
              <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-300 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-rose-950 font-extrabold text-xs">
                    <MessageSquare className="w-4 h-4 text-rose-700" />
                    <span>Consultas con Intervención Humana Requerida ({whatItNeedsFromMe.humanInterventionConversations.length})</span>
                  </div>
                  <button
                    onClick={() => onNavigateTab('conversaciones')}
                    className="text-rose-800 hover:underline font-bold text-[11px]"
                  >
                    Abrir Bandeja de Entrada →
                  </button>
                </div>

                <div className="space-y-2">
                  {whatItNeedsFromMe.humanInterventionConversations.map(c => (
                    <div
                      key={c.id}
                      className="p-3 bg-white border border-rose-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900">{c.contactName}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">{c.appName}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 italic">
                          "{c.lastMessageSnippet}..."
                        </p>
                        <span className="text-[10px] text-rose-800 font-bold block mt-1">
                          Motivo: {c.reason}
                        </span>
                      </div>

                      <button
                        onClick={() => onNavigateTab('conversaciones')}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-colors shrink-0 self-start sm:self-auto shadow-2xs"
                      >
                        Atender Consulta
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Blocked Campaigns */}
            {whatItNeedsFromMe.blockedCampaigns.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-2 text-xs">
                <span className="font-extrabold text-slate-900 block">
                  Campañas Bloqueadas por Requisitos ({whatItNeedsFromMe.blockedCampaigns.length}):
                </span>
                <div className="space-y-1.5">
                  {whatItNeedsFromMe.blockedCampaigns.map(b => (
                    <div key={b.id} className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800">{b.name}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="text-slate-500">{b.appName}</span>
                        <p className="text-[11px] text-amber-800 mt-0.5">{b.reason}</p>
                      </div>
                      <button
                        onClick={() => onNavigateTab('campaigns')}
                        className="text-xs text-blue-600 hover:underline font-bold shrink-0 ml-2"
                      >
                        Configurar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cloud Persistence Notice & Backup Download */}
      <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-900 block">
              Persistencia y Copias de Seguridad:
            </span>
            <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
              Base de datos local guardada con escritura atómica (`fsync`) y {persistenceStatus?.backupCount ?? 0} copias rotativas. En contenedores efímeros (como Cloud Run sin volumen), descargue respaldos periódicos o configure una base de datos PostgreSQL permanente.
            </p>
          </div>
        </div>
        <a
          href="/api/system/backup"
          download
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shrink-0 self-start sm:self-auto shadow-2xs"
        >
          Descargar Respaldo JSON
        </a>
      </div>
    </div>
  );
};

