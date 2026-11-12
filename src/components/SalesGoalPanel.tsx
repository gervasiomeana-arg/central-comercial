import React, { useEffect, useState } from 'react';
import { Target, ArrowUpRight } from 'lucide-react';
import { api } from '../api.js';
import type { MonthlySalesGoal } from '../types.js';

export function SalesGoalPanel() {
  const [report,setReport] = useState<any>(null), [goal,setGoal] = useState<MonthlySalesGoal|null>(null), [editing,setEditing] = useState(false), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const load = async () => { try { const r = await api.getSalesGoal(); setReport(r); if(!editing) setGoal(r.goal); } catch(e:any){setError(e.message);} };
  useEffect(()=>{ void load(); const timer=setInterval(()=>void load(),30000); return()=>clearInterval(timer); },[editing]);
  const save=async(e:React.FormEvent)=>{e.preventDefault(); if(!goal)return; setBusy(true);setError('');try{const r=await api.saveSalesGoal(goal);setReport(r);setGoal(r.goal);setEditing(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  return <section className="cc-panel cc-goal-panel" aria-label="Objetivo mensual">
    <div className="cc-panel-heading"><div><p className="cc-eyebrow">DIRECCIÓN COMERCIAL · {report?.goal.month || 'MES ACTUAL'}</p><h2><Target size={21}/> Objetivo del mes</h2></div><button className="cc-text-button" onClick={()=>setEditing(!editing)}>{editing?'Cerrar':'Editar objetivo'} <ArrowUpRight size={15}/></button></div>
    {error&&<p role="alert">{error}</p>}
    {report&&<><div className="cc-goal-progress"><strong>{report.achieved}<span> / {report.goal.targetClients}</span></strong><div><b>clientes nuevos con primer pago confirmado</b><p>Faltan {report.remaining} · {report.daysRemaining} días en el mes</p></div></div><progress aria-label="Avance del objetivo mensual" max={Math.max(1,report.goal.targetClients)} value={report.achieved}/>
    <div className="cc-goal-strategies">{report.apps.map((app:any)=><article key={app.id}><b>{app.name}</b><span>{app.ready?app.audience:'En desarrollo · fuera de campañas'}</span>{app.ready&&<small>{app.clients} primeros pagos en esta app · {app.reason}</small>}</article>)}</div>
    <p className="cc-goal-state">{report.paused?'Automatizaciones pausadas.':!report.goal.enabled?'Objetivo desactivado.':report.worker.send&&report.worker.read?'Correo conectado para enviar y recibir.':'Ejecutor de correo pendiente de conexión.'} {report.research.blocked?'Búsqueda detenida para revisión.':report.research.lastSuccess?'Búsqueda pública con consultas registradas.':'Primera búsqueda pública pendiente.'} WhatsApp Web sigue pendiente.</p></>}
    {editing&&goal&&<form className="cc-goal-form" onSubmit={save}>
      <label>Mes<input type="month" required value={goal.month} onChange={async e=>{const month=e.target.value;if(!month)return;try{const r=await api.getSalesGoal(month);setGoal(r.goal);}catch(e:any){setError(e.message);}}}/></label>
      <label>Clientes nuevos a alcanzar<input type="number" min="0" max="10000" required value={goal.targetClients} onChange={e=>setGoal({...goal,targetClients:Number(e.target.value)})}/></label>
      <label>Países, separados por comas<input required value={goal.countries.join(', ')} onChange={e=>setGoal({...goal,countries:e.target.value.split(',').map(c=>c.trim())})}/></label>
      <label>Máximo de correos al día<input type="number" min="1" max="50" required value={goal.dailyEmailLimit} onChange={e=>setGoal({...goal,dailyEmailLimit:Number(e.target.value)})}/></label>
      <label>Páginas a investigar al día<input type="number" min="1" max="20" required value={goal.dailyResearchLimit} onChange={e=>setGoal({...goal,dailyResearchLimit:Number(e.target.value)})}/></label>
      <div className="cc-goal-checks">{([{key:'enabled',label:'Activar objetivo'},{key:'discoverContacts',label:'Buscar contactos públicos'},{key:'sendEmail',label:'Enviar campañas por correo'},{key:'answerEmail',label:'Responder consultas con información verificada'}] as const).map(x=><label key={x.key}><input type="checkbox" checked={goal[x.key]} onChange={e=>setGoal({...goal,[x.key]:e.target.checked})}/>{x.label}</label>)}</div>
      <button className="cc-button cc-button-primary" disabled={busy}>{busy?'Guardando…':'Guardar objetivo y plan comercial'}</button>
    </form>}
  </section>;
}
