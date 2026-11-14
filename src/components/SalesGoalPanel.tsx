import React, { useEffect, useState } from 'react';
import { Target, ArrowUpRight } from 'lucide-react';
import { api } from '../api.js';
import type { MonthlySalesGoal } from '../types.js';

export function SalesGoalPanel({ onNavigate, selectedApp = 'all' }: { onNavigate: (tab: string, appId: string) => void; selectedApp?: string }) {
  const [whatsappReady,setWhatsappReady]=useState(false);
  const [report,setReport] = useState<any>(null), [goal,setGoal] = useState<MonthlySalesGoal|null>(null), [editing,setEditing] = useState(false), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const load = async () => { try { const [r,channels] = await Promise.all([api.getSalesGoal(),api.getRealChannelTests()]); setWhatsappReady(Boolean(channels.whatsappReady)); setReport(r); if(!editing) setGoal(r.goal); } catch(e:any){setError(e.message);} };
  useEffect(()=>{ void load(); const timer=setInterval(()=>void load(),30000); return()=>clearInterval(timer); },[editing]);
  const save=async(e:React.FormEvent)=>{e.preventDefault(); if(!goal)return; setBusy(true);setError('');try{const r=await api.saveSalesGoal(goal);setReport(r);setGoal(r.goal);setEditing(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  return <section className="cc-panel cc-goal-panel" aria-label="Objetivo mensual">
    <div className="cc-panel-heading"><div><p className="cc-eyebrow">DIRECCIÓN COMERCIAL · {report?.goal.month || 'MES ACTUAL'}</p><h2><Target size={21}/> Objetivo del mes</h2></div><button className="cc-text-button" onClick={()=>setEditing(!editing)}>{editing?'Cerrar':'Editar objetivo'} <ArrowUpRight size={15}/></button></div>
    {error&&<p role="alert">{error}</p>}
    {report&&<><div className="cc-goal-progress"><strong>{report.achieved}<span> / {report.goal.targetClients}</span></strong><div><b>clientes nuevos con primer pago confirmado</b><p>Faltan {report.remaining} · {report.daysRemaining} días en el mes</p></div></div><progress aria-label="Avance del objetivo mensual" max={Math.max(1,report.goal.targetClients)} value={report.achieved}/>
    <div className="cc-goal-strategies">{report.apps.filter((app:any)=>selectedApp==='all'||app.id===selectedApp).map((app:any)=><AppOperations key={app.id} app={app} report={report} onNavigate={onNavigate}/>)}</div>
    <p className="cc-goal-evidence">Actividad del mes seleccionado. Contactos disponibles: cartera actual. Un correo aceptado por el proveedor no acredita entrega ni lectura. Las consultas contabilizadas tienen un identificador de correo registrado.</p>
    <p className="cc-goal-state">{report.paused?'Automatizaciones pausadas.':!report.goal.enabled?'Objetivo desactivado.':report.worker.send&&report.worker.read?'Correo conectado para enviar y recibir.':'Ejecutor de correo pendiente de conexión.'} {report.research.blocked?'Búsqueda detenida para revisión.':report.research.lastSuccess?'Búsqueda pública con consultas registradas.':'Primera búsqueda pública pendiente.'} WhatsApp Web {whatsappReady?'conectado.':'pendiente de conexión.'}</p></>}
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

function AppOperations({ app, report, onNavigate }: { app: any; report: any; onNavigate: (tab: string, appId: string) => void }) {
  const ops = app.operations;
  if (!ops) return null;
  let next = 'El planificador prepara campañas y notas dentro de los límites del objetivo.', tab = 'campaigns';
  if (!app.ready) { next = 'Se incorporará a las campañas cuando esté lista para vender.'; tab = 'applications'; }
  else if (report.paused) next = 'La operación está pausada desde el control general.';
  else if (!report.goal.enabled || report.goal.targetClients < 1) next = 'Activá un objetivo mensual para poner en marcha su plan comercial.';
  else if (ops.pendingPayments) { next = 'Hay pagos pendientes de tu comprobación. Todavía no suman a la meta.'; tab = 'clients'; }
  else if (ops.questions.length) { next = 'Hay consultas que necesitan tu respuesta antes de continuar.'; tab = 'conversations'; }
  else if (ops.uncertain) { next = 'Revisá los resultados de envío inciertos; no se reenviarán automáticamente.'; tab = 'conversations'; }
  else if (!report.remaining) next = 'Meta conjunta alcanzada. Se detiene la prospección y se conserva la atención de respuestas.';
  else if (!ops.contactsAvailable) { next = report.research.blocked ? 'La búsqueda necesita revisión. Podés incorporar contactos con su fuente pública.' : !report.goal.discoverContacts ? 'La búsqueda está desactivada. Podés activarla o incorporar contactos con su fuente.' : report.research.status==='quota' ? 'Se alcanzó el cupo de páginas de hoy; las páginas pendientes se conservan para continuar.' : report.research.lastError ? 'La consulta pública no pudo completarse. El motivo está en el registro de actividad.' : 'Próximo paso: investigar organizaciones que coincidan con este público.'; tab = report.research.lastError ? 'system' : 'contacts'; }
  else if (ops.prepared && !report.worker.send) { next = 'Las notas esperan la conexión del ejecutor a tu correo, en tu computadora.'; tab = 'conversations'; }
  else if (!report.goal.sendEmail) next = 'El envío por correo está desactivado en el objetivo.';
  else if (ops.acceptedContacts && !ops.responses) next = 'Los correos aceptados esperan respuesta. La búsqueda puede sumar nuevos prospectos dentro del cupo.';
  return <article className="cc-app-operations">
    <div className="cc-app-operations-title"><b>{app.name}</b><span className={'cc-status-tag '+(app.ready?'is-ready':'is-pending')}>{app.ready?'En el plan':'En desarrollo'}</span></div>
    <span>{app.ready ? app.audience : 'Fuera de campañas comerciales'}</span>
    {app.ready && <><small>{app.reason}</small>
      <dl className="cc-operation-counts">{[{label:'Contactos disponibles',value:ops.contactsAvailable},{label:'Notas preparadas',value:ops.prepared},{label:'Contactos con envío aceptado',value:ops.acceptedContacts},{label:'Contactos que respondieron',value:ops.responses},{label:'Primeros pagos en esta app',value:app.clients}].map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      <details className="cc-operation-details"><summary>Campañas y consultas ({ops.campaigns.length} / {ops.questions.length})</summary>
        {ops.campaigns.length ? ops.campaigns.map((campaign:any)=><p key={campaign.id}><b>{campaign.country} · {campaign.language}</b><br/>{campaign.status==='activa'?'Campaña activa':campaign.status==='lista'?'Campaña preparada':campaign.status==='pausada'?'Campaña pausada':campaign.status==='finalizada'?'Campaña finalizada':campaign.status==='borrador'?'Borrador':'Requiere configuración'}</p>) : <p>El planificador todavía no creó campañas para este mes.</p>}
        {ops.questions.map((question:any)=><p key={question.id}><b>{question.organization}</b><br/>{question.reason}</p>)}
      </details>
    </>}
    <p className="cc-operation-next">{next}</p>
    <button className="cc-text-button" onClick={()=>onNavigate(tab,app.id)}>Ver {tab==='clients'?'cuenta corriente':tab==='conversations'?'conversaciones':tab==='contacts'?'contactos':tab==='system'?'actividad':tab==='applications'?'aplicación':'campañas'} <ArrowUpRight size={14}/></button>
  </article>;
}
