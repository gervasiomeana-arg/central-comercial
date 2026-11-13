import React, { useState } from 'react';
import { LayoutDashboard, Layers, Users, Send, MessageSquare, CreditCard, Settings2, Pause, Play, ArrowUpRight, Menu, X, Bell, ChevronRight, Command, AudioLines } from 'lucide-react';

interface HeaderProps {
  currentTab: string; setCurrentTab: (tab: string) => void;
  automationsPaused: boolean; onToggleAutomations: () => void;
  pendingTasksCount: number; openTasksModal: () => void;
  errorLogsCount: number; openLogsModal: () => void;
  selectedAppFilter: string; setSelectedAppFilter: (appId: string) => void;
  applications: Array<{ id: string; name: string }>;
  schedulerRunning: boolean;
  adminUser?: { id: string; email: string; name: string };
  onLogout: () => void;
}
export function Header(props: HeaderProps) {
  const [open, setOpen] = useState(false);
  const items = [
    { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
    { id: 'assistant', label: 'Hablar con Central', icon: AudioLines },
    { id: 'applications', label: 'Aplicaciones', icon: Layers },
    { id: 'contacts', label: 'Contactos', icon: Users },
    { id: 'campaigns', label: 'Campañas', icon: Send },
    { id: 'conversations', label: 'Conversaciones', icon: MessageSquare },
    { id: 'clients', label: 'Clientes y pagos', icon: CreditCard },
    { id: 'system', label: 'Conexiones', icon: Settings2 }
  ];
  const current = items.find(item => item.id === props.currentTab);
  const navigate = (id: string) => { props.setCurrentTab(id); setOpen(false); };
  return <>
    {open && <button className="cc-nav-scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
    <aside className={'cc-sidebar ' + (open ? 'is-open' : '')} aria-label="Navegación principal">
      <div className="cc-brand">
        <div className="cc-brand-mark"><Command size={22} strokeWidth={1.3} /></div>
        <div><span className="cc-brand-name">Central<br/>Comercial<span className="cc-brand-dot">.</span></span><span className="cc-brand-caption">GESTIÓN COMERCIAL</span></div>
        <button className="cc-close-nav" aria-label="Cerrar navegación" onClick={() => setOpen(false)}><X size={20}/></button>
      </div>
      <div className="cc-nav-section">ESPACIO DE TRABAJO</div>
      <nav className="cc-nav">
        {items.map((item, index) => <button key={item.id} onClick={() => navigate(item.id)} aria-current={props.currentTab === item.id ? 'page' : undefined} className={'cc-nav-item ' + (props.currentTab === item.id ? 'is-active' : '')}>
          <item.icon size={18} strokeWidth={1.6}/><span>{item.label}</span>
          {item.id === 'system' && props.errorLogsCount > 0 ? <span className="cc-nav-count">{props.errorLogsCount}</span> : <span className="cc-nav-number">0{index + 1}</span>}
        </button>)}
      </nav>
      <div className="cc-sidebar-bottom">
        <div className="cc-engine-card">
          <div className="cc-engine-label"><span className={'cc-dot ' + (props.automationsPaused ? 'is-paused' : props.schedulerRunning ? '' : 'is-offline')}/>{props.automationsPaused ? 'Automatizaciones pausadas' : props.schedulerRunning ? 'Motor de tareas activo' : 'Motor de tareas detenido'}</div>
          <p>El estado de cada canal está en Conexiones.</p>
          <button onClick={props.onToggleAutomations} className="cc-engine-toggle">{props.automationsPaused ? <Play size={14}/> : <Pause size={14}/>}<span>{props.automationsPaused ? 'Reanudar tareas' : 'Pausar tareas'}</span><ArrowUpRight size={14}/></button>
        </div>
        <div className="cc-sidebar-signature"><span>Central Comercial</span><span>Edición personal</span></div>
      </div>
    </aside>
    <header className="cc-topbar">
      <div className="cc-topbar-left"><button className="cc-mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open}><Menu size={22}/></button><span className="cc-breadcrumb-root">Mi negocio</span><ChevronRight size={13}/><span className="cc-breadcrumb-current">{current?.label}</span></div>
      <div className="cc-topbar-actions">
        <label className="cc-context-select"><Layers size={15}/><span className="sr-only">Filtrar por aplicación</span><select value={props.selectedAppFilter} onChange={e => props.setSelectedAppFilter(e.target.value)}><option value="all">Todas las aplicaciones</option>{props.applications.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
        <button className="cc-notification" onClick={props.openTasksModal} aria-label={'Ver tareas pendientes: ' + props.pendingTasksCount}><Bell size={18}/>{props.pendingTasksCount > 0 && <span>{props.pendingTasksCount}</span>}</button>
        {props.adminUser && props.adminUser.id !== 'passwordless-testing' && <button className="cc-account" onClick={props.onLogout} title="Cerrar sesión">{props.adminUser.name?.slice(0, 1) || 'G'}</button>}
      </div>
    </header>
  </>;
}

