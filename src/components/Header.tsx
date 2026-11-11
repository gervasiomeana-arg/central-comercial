import React from 'react';
import {
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Users,
  Send,
  MessageSquare,
  CreditCard,
  Settings,
  LayoutDashboard,
  ShieldCheck,
  Server
} from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  automationsPaused: boolean;
  onToggleAutomations: () => void;
  pendingTasksCount: number;
  openTasksModal: () => void;
  errorLogsCount: number;
  openLogsModal: () => void;
  selectedAppFilter: string;
  setSelectedAppFilter: (appId: string) => void;
  applications: Array<{ id: string; name: string }>;
  schedulerRunning: boolean;
  adminUser?: { id: string; email: string; name: string };
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  automationsPaused,
  onToggleAutomations,
  pendingTasksCount,
  openTasksModal,
  errorLogsCount,
  openLogsModal,
  selectedAppFilter,
  setSelectedAppFilter,
  applications,
  schedulerRunning,
  adminUser,
  onLogout,
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Panel General', icon: LayoutDashboard },
    { id: 'applications', label: 'Mis Aplicaciones', icon: Layers },
    { id: 'contacts', label: 'Contactos', icon: Users },
    { id: 'campaigns', label: 'Campañas', icon: Send },
    { id: 'conversations', label: 'Conversaciones', icon: MessageSquare },
    { id: 'clients', label: 'Clientes y Cta. Cte.', icon: CreditCard },
    { id: 'system', label: 'Conectores y Sistema', icon: Settings },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-sm">
      {/* Top bar with operational indicators */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 border-b border-slate-800/80">
          {/* Logo & Platform Name */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-inner">
              CC
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold tracking-tight text-lg text-white">CENTRAL COMERCIAL</span>
                <span className="px-2 py-0.5 text-xs font-semibold bg-blue-950 text-blue-300 rounded border border-blue-800">
                  {adminUser?.id === 'passwordless-testing' ? 'Pruebas · Sin contraseña' : 'Privado v1.0'}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Open Voley · Visibility AI · NeuroPlaneta · Funeraria
              </p>
            </div>
          </div>

          {/* Operational Controls & Status Indicators */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* App context filter */}
            <div className="flex items-center text-xs">
              <span className="text-slate-400 mr-1.5 hidden md:inline">Contexto:</span>
              <select
                value={selectedAppFilter}
                onChange={e => setSelectedAppFilter(e.target.value)}
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded-md px-2.5 py-1 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="all">Todas las Aplicaciones</option>
                {applications.map(app => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Scheduler daemon status badge */}
            <div
              title={schedulerRunning ? "Motor de backend en ejecución periódica (30s)" : "Motor detenido"}
              className="hidden lg:flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-300"
            >
              <Server className={`w-3.5 h-3.5 ${schedulerRunning ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span>Backend Daemon:</span>
              <span className={`font-semibold ${schedulerRunning ? 'text-emerald-400' : 'text-amber-400'}`}>
                {schedulerRunning ? 'Activo' : 'Detenido'}
              </span>
            </div>

            {/* Error logs button with badge */}
            <button
              onClick={openLogsModal}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                errorLogsCount > 0
                  ? 'bg-rose-950/70 text-rose-300 border-rose-800 hover:bg-rose-900/80'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Errores</span>
              {errorLogsCount > 0 && (
                <span className="bg-rose-600 text-white font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                  {errorLogsCount}
                </span>
              )}
            </button>

            {/* Pending tasks button with badge */}
            <button
              onClick={openTasksModal}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                pendingTasksCount > 0
                  ? 'bg-amber-950/70 text-amber-300 border-amber-800 hover:bg-amber-900/80'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Tareas pendientes</span>
              <span className="bg-amber-600 text-white font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                {pendingTasksCount}
              </span>
            </button>

            {/* Global Automation Pause/Resume Button */}
            <button
              onClick={onToggleAutomations}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all shadow-sm ${
                automationsPaused
                  ? 'bg-amber-600 text-white hover:bg-amber-500 animate-pulse'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {automationsPaused ? (
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

            {/* Authenticated Admin Badge & Logout */}
            {adminUser && adminUser.id !== 'passwordless-testing' && (
              <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-700 text-xs">
                <span className="hidden xl:inline text-slate-300 font-medium" title={adminUser.email}>
                  {adminUser.email}
                </span>
                <button
                  onClick={onLogout}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold border border-slate-700 transition-colors"
                  title="Cerrar sesión de administrador"
                >
                  Salir
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex space-x-1 overflow-x-auto py-2 scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Global alert banner if automations are paused */}
      {automationsPaused && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-bold flex items-center justify-center space-x-2">
          <AlertTriangle className="w-4 h-4" />
          <span>LAS AUTOMATIZACIONES Y ENVÍOS SE ENCUENTRAN PAUSADOS GLOBALMENTE POR EL ADMINISTRADOR.</span>
          <button
            onClick={onToggleAutomations}
            className="underline ml-2 hover:text-white font-extrabold"
          >
            Reanudar ahora
          </button>
        </div>
      )}
    </header>
  );
};
