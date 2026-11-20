import React, { useEffect, useState } from 'react';
import { Monitor, CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import type { LocalRuntimeState } from '../runtime-types.js';

const issueLabels: Record<string, string> = {
  email_auth: 'Gmail requiere revisar su autorización antes de reconectar.',
  whatsapp_auth: 'WhatsApp requiere volver a vincular el dispositivo o revisar la cuenta.',
  backup_failed: 'No se pudo actualizar la copia local de los registros.',
  email_missing: 'Falta localizar el ejecutor de correo ya configurado.',
  whatsapp_missing: 'Falta localizar el ejecutor de WhatsApp vinculado.',
  browser_missing: 'Falta la ruta guardada de Chrome o Edge para WhatsApp.',
  jarvis_missing: 'Falta instalar OpenJarvis en esta computadora.',
  model_missing: 'Falta iniciar Ollama o instalar el modelo local elegido.',
  low_memory: 'La memoria del equipo no alcanza para el inicio automático del modelo recomendado.',
  component_stopped: 'Un componente se detuvo. Revisá la ventana de Central Comercial.',
  jarvis_port_busy: 'El puerto reservado para el motor local está ocupado; no se conectó a ese proceso.'
};
const ownerReportLabels = {
  sin_intento: 'Sin intento registrado',
  aceptado_proveedor: 'Aceptado por WhatsApp, entrega sin confirmar',
  entrega_confirmada: 'WhatsApp confirmó la entrega',
  rechazado: 'Rechazado',
  resultado_desconocido: 'Sin confirmación de WhatsApp',
  registro_no_disponible: 'Registro no disponible',
};

export function LocalRuntimePanel({remote=false}:{remote?:boolean}) {
  const [runtime, setRuntime] = useState<LocalRuntimeState | null>(null);
  const [connections, setConnections] = useState({ email: false, whatsapp: false, intelligence: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const local=await api.getLocalRuntime();
      setRuntime(local);
      if(remote)setConnections(local.online&&local.connections?local.connections:{email:false,whatsapp:false,intelligence:false});
      else {
        const [jarvis,goal,channel]=await Promise.all([api.getJarvisStatus(),api.getSalesGoal(),api.getRealChannelTests()]);
        setConnections({email:goal.worker.online&&goal.worker.send&&goal.worker.read,whatsapp:channel.whatsappReady,intelligence:jarvis.ready});
      }
      setError('');
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 20000); return () => clearInterval(timer); }, []);
  const items = [{ id: 'email', name: 'Correo comercial' }, { id: 'whatsapp', name: 'WhatsApp Web en tu PC' }, { id: 'intelligence', name: 'Inteligencia OpenJarvis' }] as const;
  return <section className="rounded-2xl bg-slate-900 text-white p-6 sm:p-8 space-y-6" aria-labelledby="runtime-title">
    <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-4"><Monitor size={25} className="mt-1 text-emerald-300 shrink-0" /><div><p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Una sola Central Comercial</p><h2 id="runtime-title" className="text-xl font-semibold">Tu computadora, conectada al negocio.</h2><p className="text-sm text-slate-300 mt-2">Un iniciador coordina correo, WhatsApp y motor de inteligencia. La operación autónoma y los registros se conservan en tu PC dedicada.</p></div></div><button onClick={() => void refresh()} disabled={busy} aria-label="Actualizar estado de mi computadora" className="p-3 rounded-xl bg-white/10 min-h-12 min-w-12 disabled:opacity-40"><RefreshCw size={18} /></button></div>
    <div className="grid sm:grid-cols-3 gap-4">{items.map(item => <div key={item.id} className="rounded-xl border border-white/10 p-4"><div className="flex items-center gap-2 text-sm font-medium">{connections[item.id] ? <CheckCircle2 size={16} className="text-emerald-300" /> : <Circle size={16} className="text-slate-400" />}{item.name}</div><p className="text-sm text-slate-300 mt-2">{connections[item.id] ? (item.id === 'whatsapp' ? 'Sesión vinculada según el ejecutor' : 'Conexión confirmada por el ejecutor') : runtime?.online && runtime.components?.[item.id] === 'running' ? 'Proceso iniciado; conexión pendiente' : 'Pendiente de conexión'}</p></div>)}</div>
    <p role="status" className="text-sm text-slate-300">{runtime?.online ? `Inicio único conectado · ${runtime.ramGB} GB de RAM · modelo elegido: ${runtime.model}.` : 'El inicio único todavía no está conectado. Los ejecutores anteriores pueden seguir apareciendo conectados por su cuenta.'}</p>
    {runtime?.diagnosticMode && <p className="text-amber-200" role="status">Verificación sin envíos: los ejecutores pueden conectarse, pero las colas no entregan mensajes.</p>}
    {remote && <p className="text-sm text-slate-300">Los envíos de WhatsApp se realizan desde tu PC. El estado publicado se actualiza con la señal del ejecutor.</p>}
    {runtime?.ownerReport && <p className="text-sm text-slate-200">Informe de WhatsApp del {runtime.ownerReport.day.split('-').reverse().join('/')}.
      {' '}{ownerReportLabels[runtime.ownerReport.status]}
      {runtime.ownerReport.at && ' · ' + new Date(runtime.ownerReport.at).toLocaleTimeString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit',
      })}
    </p>}
    {runtime?.activity && <dl className="grid gap-2 text-sm text-slate-200 sm:grid-cols-3">
      <div><dt>Estrategias recientes completadas</dt><dd className="text-lg">{runtime.activity.completedPlans}</dd></div>
      <div><dt>Campañas que usan OpenJarvis</dt><dd className="text-lg">{runtime.activity.campaignsUsingOpenJarvis}</dd></div>
      <div><dt>Promociones preparadas</dt><dd className="text-lg">{runtime.activity.pendingPromotions}</dd></div>
      <div className="sm:col-span-3"><dt>Automatizaciones {runtime.activity.paused ? 'pausadas' : 'habilitadas'}</dt>
        {runtime.activity.lastCycleAt && <dd>Último ciclo: {new Date(runtime.activity.lastCycleAt).toLocaleString('es-AR')}.</dd>}
      </div>
    </dl>}
    {runtime?.receivedAt && <p className="text-xs text-slate-400">Último reporte recibido: {new Date(runtime.receivedAt).toLocaleString('es-AR')}.</p>}
    {runtime?.sourceFingerprint && <p className="text-xs text-slate-400">Versión de la PC: {runtime.sourceFingerprint.slice(0,12)}.</p>}
    {runtime?.issues.length ? <ul className="space-y-2 text-sm text-amber-200">{runtime.issues.map(issue => <li key={issue}>{issueLabels[issue] || 'Revisá la ventana de Central Comercial.'}</li>)}</ul> : null}
    {runtime?.backupAt && <p className="text-xs text-slate-400">Última copia guardada en tu computadora: {new Date(runtime.backupAt).toLocaleString('es-AR')}. La restauración de copias anteriores requiere revisión para evitar retroceder registros.</p>}
    {error && <p role="alert" className="text-sm text-amber-200">No se pudo actualizar el estado: {error}</p>}
    <details className="border-t border-white/10 pt-4 text-sm text-slate-300"><summary className="cursor-pointer font-medium text-white">Cómo usar el inicio único</summary><p className="mt-3 leading-relaxed">En el proyecto actualizado, abrí <strong>INICIAR_CENTRAL_COMERCIAL.bat</strong>. Cerrá primero las ventanas de los iniciadores anteriores para no duplicar procesos. Reutiliza las conexiones guardadas; no necesitás claves nuevas.</p><p className="mt-2 leading-relaxed">Para arrancar después de iniciar sesión en Windows, usá una vez <strong>ACTIVAR_INICIO_AUTOMATICO.bat</strong> en tu PC dedicada. Los cortes temporales se reintentan; una autorización revocada requiere tu intervención. Podés desactivar el inicio automático con el archivo correspondiente.</p><p className="mt-2 leading-relaxed">OpenJarvis y el modelo requieren instalación inicial en esa PC. Mantener esta página abierta no sustituye al proceso local. El sistema no puede trabajar mientras la computadora está apagada.</p></details>
  </section>;
}
