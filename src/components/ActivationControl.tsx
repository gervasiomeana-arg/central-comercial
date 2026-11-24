import React, {useEffect,useState} from 'react';
import {ChevronDown,Play,Pause,Settings2,X} from 'lucide-react';
import {api} from '../api.js';
import type {Application,StartAutonomousInput} from '../types.js';

export function ActivationControl({applications,onChanged,paused}: {applications:Application[];onChanged:()=>Promise<void>;paused:boolean}) {
  const ready=applications.filter(a=>a.status==='lista'&&a.campaignsAllowed);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[report,setReport]=useState<any>(null),[error,setError]=useState('');
  const [input,setInput]=useState<StartAutonomousInput>({channels:['email'],useLocalIntelligence:true,appId:ready.find(a=>/voley/i.test(a.name))?.id||ready[0]?.id||'',country:'Argentina',maxContacts:3,targetClients:5,sendWindowStart:'09:00',sendWindowEnd:'21:00'});
  const refresh=async()=>{try{setReport(await api.getAutonomousRun());}catch(e:any){setError(e.message);}};
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>clearInterval(timer);},[]);
  const start=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const result=await api.startAutonomousRun(input);setReport(result);setOpen(false);await onChanged();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const activateDirector=async()=>{setBusy(true);setError('');try{setReport(await api.startMonthlyDirector());await onChanged();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const pause=async()=>{setBusy(true);setError('');try{await api.pauseAutomations();await refresh();await onChanged();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  return <div className="cc-activation">
    <div className="cc-activation-actions"><button className="cc-button cc-button-primary" disabled={busy||!ready.length} onClick={activateDirector}><Play size={17}/>{busy?'Iniciando…':report?.director&&!paused?'Director autónomo activo':'Activar director autónomo'}</button><button className="cc-button cc-button-secondary" disabled={busy} onClick={()=>setOpen(true)}><Settings2 size={17}/>Piloto avanzado</button>{(report?.run||report?.director)&&!paused&&<button className="cc-button cc-button-secondary" disabled={busy} onClick={pause}><Pause size={16}/>Pausar</button>}</div>
    {error&&<p className="cc-activation-error" role="alert">{error}</p>}
    {report?.director && <DirectorOverview director={report.director} research={report.research} blockers={report.blockers} paused={paused}/>}
    {report?.run&&<details className="cc-run-report" open><summary>{paused?'Operación pausada':report.blockers.length?'Iniciada con etapas bloqueadas':'Operación iniciada'} · {report.appName}</summary><p>Hasta {report.run.maxContacts} contactos en total · {report.run.country} · {(report.channels||['email']).map((c:string)=>c==='whatsapp'?'WhatsApp autorizado':'Email').join(' + ')}</p><ol>{report.stages.map((stage:any)=><li key={stage.name} data-state={stage.state}><span>{stage.name}</span><strong>{stage.count}</strong><small>{stage.state==='bloqueado'?'Bloqueado':stage.state==='con_resultados'?'Registrado':stage.state==='revision_manual'?'Revisión tuya':stage.state==='cupo'?'Cupo diario':'Pendiente'}</small></li>)}</ol>{report.research?.detail&&<p>{report.research.detail}</p>}{report.research?.outcome&&<details className="cc-research-detail"><summary>Detalle de la búsqueda</summary><p>{report.research.pendingPages} páginas pendientes</p>{Object.entries(report.research.outcome.reasons||{}).map(([reason,count])=><p key={reason}>{String(count)} · {reason}</p>)}</details>}{report.blockers.length>0&&<div className="cc-run-blockers">{report.blockers.map((reason:string)=><p key={reason}>{reason}</p>)}</div>}<small>Las consultas y los pagos dependen de respuestas reales de los destinatarios. No se generan resultados de prueba.</small></details>}
    {open&&<div className="cc-activation-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="activation-title" className="cc-activation-dialog"><div className="cc-activation-dialog-head"><div><p className="cc-eyebrow">ACTIVACIÓN</p><h2 id="activation-title">Poné Central en marcha</h2></div><button aria-label="Cerrar activación" onClick={()=>setOpen(false)} disabled={busy}><X size={20}/></button></div><p>El motor buscará organizaciones, preparará notas y continuará con envíos y respuestas cuando tu correo esté conectado.</p><form onSubmit={start}>
      <label>Aplicación<select required value={input.appId} onChange={e=>setInput({...input,appId:e.target.value})}>{ready.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
      <label>País<input required maxLength={60} value={input.country} onChange={e=>setInput({...input,country:e.target.value})}/></label>
      <label>Máximo total de contactos<input required type="number" min="1" max="20" value={input.maxContacts} onChange={e=>setInput({...input,maxContacts:Number(e.target.value)})}/></label>
      <label>Objetivo mensual de clientes<input required type="number" min="1" max="10000" value={input.targetClients} onChange={e=>setInput({...input,targetClients:Number(e.target.value)})}/></label>
      <label>Enviar desde<input type="time" required value={input.sendWindowStart} onChange={e=>setInput({...input,sendWindowStart:e.target.value})}/></label><label>Enviar hasta<input type="time" required value={input.sendWindowEnd} onChange={e=>setInput({...input,sendWindowEnd:e.target.value})}/></label>
      <label><input type="checkbox" checked={input.useLocalIntelligence!==false} onChange={e=>setInput({...input,useLocalIntelligence:e.target.checked})}/> OpenJarvis dirige las búsquedas con una estrategia validada</label>
      <label>Canal<select value={input.channels?.join(',')||'email'} onChange={e=>setInput({...input,channels:e.target.value.split(',') as ('email'|'whatsapp')[]})}><option value="email">Email</option><option value="whatsapp">WhatsApp autorizado</option><option value="email,whatsapp">Email y WhatsApp autorizado</option></select></label>
      <small>Horario de Argentina. El límite total se conserva al reiniciar. WhatsApp requiere autorización registrada de cada contacto; los números públicos no quedan habilitados automáticamente. Los pagos requieren tu revisión.</small>
      <button className="cc-button cc-button-primary" disabled={busy}><Play size={16}/>{busy?'Iniciando…':'Iniciar campaña autónoma'}</button>
    </form></section></div>}
  </div>;
}

interface DirectorCampaign {
  id: string;
  app?: string;
  country: string;
  audience?: string;
  strategyReady: boolean;
  strategySource?: string;
  error?: string;
  intelligenceNote?: string;
}

interface DirectorOverviewProps {
  director: {
    achieved: number;
    remaining: number;
    target: number;
    dailyLimit: number;
    unlimitedOutreach?: boolean;
    campaigns: DirectorCampaign[];
  };
  research?: {requests: number; limit: number; detail?: string; blocked?: boolean; nextAttemptAt?: number};
  blockers: string[];
  paused: boolean;
}

function DirectorOverview({director, research, blockers, paused}: DirectorOverviewProps) {
  const groupName = React.useId();
  const groups = new Map<string, DirectorCampaign[]>();
  for (const campaign of director.campaigns) {
    const app = campaign.app || 'Aplicación sin nombre';
    const campaigns = groups.get(app);
    if (campaigns) campaigns.push(campaign);
    else groups.set(app, [campaign]);
  }

  const status = paused ? 'Director pausado' : director.remaining === 0 ? 'Objetivo alcanzado' : 'Director mensual activo';
  return <section className="cc-run-report cc-director-overview" aria-label="Resumen del director mensual">
    <div className="cc-director-heading">
      <h2>{status}</h2>
      <span>{director.achieved} de {director.target} clientes con primer pago</span>
    </div>
    <p className="cc-director-send-limit">{director.unlimitedOutreach ? 'Envíos sin cupo diario interno' : `Hasta ${director.dailyLimit} envíos diarios`}</p>

    {groups.size === 0 && <p>Todavía no hay campañas para este objetivo.</p>}
    {Array.from(groups, ([app, campaigns]) => {
      const markets = new Set(campaigns.map(c => c.country)).size;
      const ready = campaigns.filter(c => c.strategyReady).length;
      const audience = campaigns[0].audience;
      const sharedAudience = audience && campaigns.every(c => c.audience === audience) ? audience : undefined;
      const note = campaigns[0].intelligenceNote;
      const sharedNote = note && campaigns.every(c => c.strategyReady && c.intelligenceNote === note) ? note : undefined;
      return <details key={app} name={groupName} className="cc-director-market">
        <summary>
          <span><strong>{app}</strong><span className="cc-director-count">{markets} {markets === 1 ? 'país' : 'países'} · {ready} de {campaigns.length} con estrategia</span></span>
          <ChevronDown size={16} aria-hidden="true"/>
        </summary>
        <div className="cc-director-market-detail" role="region" aria-label={`Detalle por país de ${app}`} tabIndex={0}>
          {sharedAudience && <p>{sharedAudience}</p>}
          {sharedNote && <p>OpenJarvis · {sharedNote}</p>}
          <ul aria-label={`Campañas por país de ${app}`}>
            {[...campaigns].sort((a, b) => a.country.localeCompare(b.country, 'es')).map(c => <li key={c.id}>
              <div><strong>{c.country}</strong><span>{c.strategyReady ? c.strategySource || 'Estrategia validada' : 'Planificando'}</span></div>
              {!sharedAudience && c.audience && <p>{c.audience}</p>}
              {c.error && <p>{c.error}</p>}
              {!sharedNote && c.strategyReady && c.intelligenceNote && <p>OpenJarvis · {c.intelligenceNote}</p>}
            </li>)}
          </ul>
        </div>
      </details>;
    })}

    {research && <details className="cc-director-extra">
      <summary>Búsqueda · {research.blocked ? 'Detenida' : `${research.requests} consultas hoy`}</summary>
      <p>{research.detail || 'Aún no hay una revisión de página registrada.'}</p>
      {research.limit > 0 && <p>Cupo diario de búsqueda · {research.limit}</p>}
      {research.nextAttemptAt && <p>Próximo intento · {new Date(research.nextAttemptAt).toLocaleString('es-AR', {hour12: false, timeZone: 'America/Argentina/Buenos_Aires'})}</p>}
    </details>}
    {blockers.length > 0 && <details className="cc-director-extra cc-director-blockers">
      <summary>{blockers.length} {blockers.length === 1 ? 'bloqueo para revisar' : 'bloqueos para revisar'}</summary>
      <ul>{blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </details>}
  </section>;
}
