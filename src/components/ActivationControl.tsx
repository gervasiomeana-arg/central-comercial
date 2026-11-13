import React, {useEffect,useState} from 'react';
import {Play,Pause,Settings2,X} from 'lucide-react';
import {api} from '../api.js';
import type {Application,StartAutonomousInput} from '../types.js';

export function ActivationControl({applications,onChanged,paused}: {applications:Application[];onChanged:()=>Promise<void>;paused:boolean}) {
  const ready=applications.filter(a=>a.status==='lista'&&a.campaignsAllowed);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[report,setReport]=useState<any>(null),[error,setError]=useState('');
  const [input,setInput]=useState<StartAutonomousInput>({appId:ready.find(a=>/voley/i.test(a.name))?.id||ready[0]?.id||'',country:'Argentina',maxContacts:3,targetClients:5,sendWindowStart:'09:00',sendWindowEnd:'21:00'});
  const refresh=async()=>{try{setReport(await api.getAutonomousRun());}catch(e:any){setError(e.message);}};
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>clearInterval(timer);},[]);
  const start=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const result=await api.startAutonomousRun(input);setReport(result);setOpen(false);await onChanged();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const pause=async()=>{setBusy(true);setError('');try{await api.pauseAutomations();await refresh();await onChanged();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  return <div className="cc-activation">
    <div className="cc-activation-actions"><button className="cc-button cc-button-primary" disabled={busy||!ready.length} onClick={()=>setOpen(true)}><Play size={17}/>{report?.run?'Iniciar / configurar':'Iniciar Central Comercial'}</button>{report?.run&&!paused&&<button className="cc-button cc-button-secondary" disabled={busy} onClick={pause}><Pause size={16}/>Pausar</button>}</div>
    {error&&<p className="cc-activation-error" role="alert">{error}</p>}
    {report?.run&&<details className="cc-run-report" open><summary>{paused?'Operación pausada':report.blockers.length?'Iniciada con etapas bloqueadas':'Operación iniciada'} · {report.appName}</summary><p>Hasta {report.run.maxContacts} contactos en total · {report.run.country} · Solo email</p><ol>{report.stages.map((stage:any)=><li key={stage.name} data-state={stage.state}><span>{stage.name}</span><strong>{stage.count}</strong><small>{stage.state==='bloqueado'?'Bloqueado':stage.state==='con_resultados'?'Registrado':stage.state==='revision_manual'?'Revisión tuya':stage.state==='cupo'?'Cupo diario':'Pendiente'}</small></li>)}</ol>{report.research?.detail&&<p>{report.research.detail}</p>}{report.research?.outcome&&<details className="cc-research-detail"><summary>Detalle de la búsqueda</summary><p>{report.research.pendingPages} páginas pendientes</p>{Object.entries(report.research.outcome.reasons||{}).map(([reason,count])=><p key={reason}>{String(count)} · {reason}</p>)}</details>}{report.blockers.length>0&&<div className="cc-run-blockers">{report.blockers.map((reason:string)=><p key={reason}>{reason}</p>)}</div>}<small>Las consultas y los pagos dependen de respuestas reales de los destinatarios. No se generan resultados de prueba.</small></details>}
    {open&&<div className="cc-activation-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="activation-title" className="cc-activation-dialog"><div className="cc-activation-dialog-head"><div><p className="cc-eyebrow">ACTIVACIÓN</p><h2 id="activation-title">Poné Central en marcha</h2></div><button aria-label="Cerrar activación" onClick={()=>setOpen(false)} disabled={busy}><X size={20}/></button></div><p>El motor buscará organizaciones, preparará notas y continuará con envíos y respuestas cuando tu correo esté conectado.</p><form onSubmit={start}>
      <label>Aplicación<select required value={input.appId} onChange={e=>setInput({...input,appId:e.target.value})}>{ready.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
      <label>País<input required maxLength={60} value={input.country} onChange={e=>setInput({...input,country:e.target.value})}/></label>
      <label>Máximo total de contactos<input required type="number" min="1" max="20" value={input.maxContacts} onChange={e=>setInput({...input,maxContacts:Number(e.target.value)})}/></label>
      <label>Objetivo mensual de clientes<input required type="number" min="1" max="10000" value={input.targetClients} onChange={e=>setInput({...input,targetClients:Number(e.target.value)})}/></label>
      <label>Enviar desde<input type="time" required value={input.sendWindowStart} onChange={e=>setInput({...input,sendWindowStart:e.target.value})}/></label><label>Enviar hasta<input type="time" required value={input.sendWindowEnd} onChange={e=>setInput({...input,sendWindowEnd:e.target.value})}/></label>
      <small>Horario de Argentina. El límite total se conserva al reiniciar. Se trabaja con la app elegida; las otras campañas no envían nuevas promociones durante esta activación. WhatsApp queda fuera.</small>
      <button className="cc-button cc-button-primary" disabled={busy}><Play size={16}/>{busy?'Iniciando…':'Iniciar campaña autónoma'}</button>
    </form></section></div>}
  </div>;
}
