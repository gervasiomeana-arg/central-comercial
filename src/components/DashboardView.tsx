import React from 'react';
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
  Server
} from 'lucide-react';
import type { DashboardMetrics, Application, CommercialTask } from '../types.js';

interface DashboardViewProps {
  metrics: DashboardMetrics | null;
  applications: Application[];
  tasks: CommercialTask[];
  onOpenTasks: () => void;
  onOpenLogs: () => void;
  onNavigateTab: (tab: string) => void;
  onToggleAutomations: () => void;
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  selectedAppFilter: string;
  setSelectedAppFilter: (appId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  metrics,
  applications,
  tasks,
  onOpenTasks,
  onOpenLogs,
  onNavigateTab,
  onToggleAutomations,
  selectedPeriod,
  setSelectedPeriod,
  selectedAppFilter,
  setSelectedAppFilter,
}) => {
  if (!metrics) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Clock className="w-6 h-6 animate-spin mr-2 text-blue-600" />
        <span>Cargando métricas comerciales...</span>
      </div>
    );
  }

  const pendingTasks = tasks.filter(t => t.status === 'pendiente').slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Top Banner & Fast Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Panel de Control Comercial
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Supervisión de prospección, estado de mensajes, pipeline de clientes y cuenta corriente.
            </p>
          </div>

          {/* Quick Action Buttons explicitly requested */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onToggleAutomations}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 ${
                metrics.automationsPaused
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}
            >
              {metrics.automationsPaused ? '▶ Reanudar automatizaciones' : '⏸ Pausar automatizaciones'}
            </button>

            <button
              onClick={onOpenTasks}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 flex items-center space-x-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Ver tareas pendientes ({metrics.pendingTasksCount})</span>
            </button>

            <button
              onClick={onOpenLogs}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 flex items-center space-x-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Ver errores y auditoría</span>
            </button>
          </div>
        </div>

        {/* Filters: App & Period */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-medium">Filtrar por Aplicación:</span>
            <select
              value={selectedAppFilter}
              onChange={e => setSelectedAppFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1 text-slate-700 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="all">Todas las aplicaciones (Global)</option>
              {applications.map(app => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.status === 'en_desarrollo' ? 'En desarrollo' : 'Activa'})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-slate-500 font-medium mr-1.5">Período:</span>
            {['hoy', '7d', '30d', 'all'].map(p => {
              const labelMap: Record<string, string> = {
                hoy: 'Hoy',
                '7d': '7 días',
                '30d': '30 días',
                all: 'Todo el período'
              };
              return (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    selectedPeriod === p
                      ? 'bg-blue-600 text-white'
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

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Contacts */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contactos</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-slate-900">{metrics.contactsTotal}</span>
            <span className="text-xs text-slate-500 font-medium">registrados</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Verificados con fuente:</span>
            <span className="font-semibold text-emerald-700">{metrics.contactsVerified}</span>
          </div>
        </div>

        {/* Pipeline & Interested */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Interés y Respuestas</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-indigo-600">{metrics.interestedCount}</span>
            <span className="text-xs text-slate-500 font-medium">interesados</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Respuestas recibidas:</span>
            <span className="font-semibold text-slate-900">{metrics.responsesReceived}</span>
          </div>
        </div>

        {/* Trials & Active Subscriptions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clientes y Pruebas</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-emerald-700">{metrics.activeSubscriptionsCount}</span>
            <span className="text-xs text-slate-500 font-medium">suscripciones activas</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>En prueba gratuita:</span>
            <span className="font-semibold text-slate-900">{metrics.trialClientsCount}</span>
          </div>
        </div>

        {/* Operational Attention Required */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Atención Operativa</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-amber-700">
              {metrics.connectorsNeedingAttention + metrics.pendingPaymentsCount}
            </span>
            <span className="text-xs text-slate-500 font-medium">puntos de atención</span>
          </div>
          <div className="mt-2 text-xs text-slate-600 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Conectores pendientes:</span>
            <span className="font-semibold text-amber-800">{metrics.connectorsNeedingAttention}</span>
          </div>
        </div>
      </div>

      {/* Message Delivery Breakdown (Crucial: never fake confirmations!) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Estado Real de Envíos y Mensajería
            </h2>
            <p className="text-xs text-slate-500">
              Solo se contabilizan mensajes con confirmación fehaciente del servicio de telecomunicaciones.
            </p>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold border border-slate-200">
            Cero simulación
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center space-x-1.5 text-xs text-amber-800 font-semibold">
              <Clock className="w-3.5 h-3.5" />
              <span>Pendientes de envío</span>
            </div>
            <p className="text-2xl font-black text-amber-900 mt-1">{metrics.messagesPending}</p>
            <p className="text-[11px] text-amber-700 mt-0.5">En cola o esperando horario</p>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3">
            <div className="flex items-center space-x-1.5 text-xs text-emerald-800 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Enviados confirmados</span>
            </div>
            <p className="text-2xl font-black text-emerald-900 mt-1">{metrics.messagesSent}</p>
            <p className="text-[11px] text-emerald-700 mt-0.5">Con ID de servicio SMTP/Meta</p>
          </div>

          <div className="bg-rose-50/60 border border-rose-200 rounded-lg p-3">
            <div className="flex items-center space-x-1.5 text-xs text-rose-800 font-semibold">
              <XCircle className="w-3.5 h-3.5" />
              <span>Fallidos</span>
            </div>
            <p className="text-2xl font-black text-rose-900 mt-1">{metrics.messagesFailed}</p>
            <p className="text-[11px] text-rose-700 mt-0.5">Rechazo de servidor o número inválido</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center space-x-1.5 text-xs text-slate-700 font-semibold">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Resultado desconocido</span>
            </div>
            <p className="text-2xl font-black text-slate-800 mt-1">{metrics.messagesUnknown}</p>
            <p className="text-[11px] text-slate-600 mt-0.5">Sin acuse de recibo explícito</p>
          </div>
        </div>
      </div>

      {/* Financial Breakdown (By Currency - NEVER mixed without explicit conversion) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Cuenta Corriente y Cobros por Moneda
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Por política contable estricta, las monedas nunca se suman entre sí sin una tasa de cambio oficial.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('clients')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center space-x-1"
          >
            <span>Ver cuenta corriente y comprobantes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {metrics.paymentsByCurrency.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-6 text-center">
            <CreditCard className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-600">
              No hay cobros registrados todavía en el período seleccionado.
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Los pagos registrados permanecerán como "Pendiente de confirmación manual" hasta que el auditor los verifique.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {metrics.paymentsByCurrency.map(c => (
              <div key={c.currency} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-extrabold text-sm text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded">
                    {c.currency}
                  </span>
                  <span className="text-[11px] text-slate-500">Moneda oficial</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between items-center text-emerald-700 font-semibold">
                    <span>Confirmado auditado:</span>
                    <span className="text-sm font-bold">
                      {c.currency} {c.confirmedTotal.toLocaleString('es', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-amber-700">
                    <span>Pendiente de revisión:</span>
                    <span className="font-semibold">
                      {c.currency} {c.pendingTotal.toLocaleString('es', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two columns: Next Tasks & Application Health Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Next Pending Tasks */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Próximas Tareas Comerciales
                </h2>
              </div>
              <button
                onClick={onOpenTasks}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Ver todas ({metrics.pendingTasksCount})
              </button>
            </div>

            {pendingTasks.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4">No hay tareas pendientes en este momento.</p>
            ) : (
              <div className="space-y-2.5">
                {pendingTasks.map(task => (
                  <div
                    key={task.id}
                    className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 hover:bg-slate-100/70 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            task.priority === 'alta'
                              ? 'bg-rose-500'
                              : task.priority === 'media'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        <h3 className="text-xs font-bold text-slate-800">{task.title}</h3>
                      </div>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                        {task.category.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{task.description}</p>
                    {task.dueDate && (
                      <p className="text-[10px] text-slate-500 mt-1">Vencimiento: {task.dueDate}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onOpenTasks}
            className="w-full mt-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
          >
            Administrar tareas y seguimientos
          </button>
        </div>

        {/* Four Applications Operational Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Estado de las 4 Aplicaciones
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab('applications')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Ver fichas completas
            </button>
          </div>

          <div className="space-y-3">
            {applications.map(app => {
              const isFuneraria = app.id === 'app-funeraria' || app.slug === 'funeraria';
              const isNeuro = app.id === 'app-neuroplaneta' || app.slug === 'neuroplaneta';

              return (
                <div
                  key={app.id}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-xs text-slate-900">{app.name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          app.status === 'en_desarrollo'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : app.status === 'lista'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {app.status === 'en_desarrollo'
                          ? 'En desarrollo'
                          : app.status === 'lista'
                          ? 'Lista para campaña'
                          : 'Pausada'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{app.description}</p>

                    {isFuneraria && (
                      <p className="text-[10px] text-amber-700 font-bold mt-1">
                        🔒 Campañas estrictamente bloqueadas hasta autorización técnica.
                      </p>
                    )}
                    {isNeuro && (
                      <p className="text-[10px] text-blue-700 font-semibold mt-1">
                        ℹ️ Lúdica acompañada con adultos · No diagnóstico ni tratamiento.
                      </p>
                    )}
                  </div>

                  <div className="text-right sm:pl-3 sm:border-l border-slate-200 shrink-0">
                    <span className="text-[11px] text-slate-500 block">
                      {app.website.startsWith('http') ? (
                        <a
                          href={app.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {app.website.replace('https://', '')}
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">Sitio pendiente</span>
                      )}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedAppFilter(app.id);
                        onNavigateTab('applications');
                      }}
                      className="text-[11px] text-slate-700 hover:text-blue-600 font-bold mt-0.5"
                    >
                      Editar ficha →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
