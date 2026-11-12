import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export function RealChannelTests() {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => { try { setStatus(await api.getRealChannelTests()); } catch (e: any) { setError(e.message); } };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, []);
  const send = async (channels: string[]) => {
    setBusy(true); setError('');
    try { await api.startRealChannelTests(channels); await refresh(); } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const labels: Record<string, string> = { pendiente: 'Pendiente de ejecución', en_proceso: 'Enviando', aceptado_servicio: 'Aceptado por el servicio', fallido: 'Fallido', resultado_desconocido: 'Sin confirmación; no se reenvía' };
  return <section className="bg-white border border-blue-200 rounded-xl p-5 space-y-4">
    <h2 className="text-lg font-bold text-slate-900">Pruebas reales desde Central Comercial</h2>
    <p className="text-sm text-slate-600">La aplicación ordena el envío y el ejecutor de tu computadora lo realiza. Los resultados quedan separados de clientes, ventas y pagos.</p>
    {status && <>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="bg-slate-50 rounded-lg p-3"><strong>Email</strong><p>{status.recipients.email}</p><p>{status.emailReady ? 'Conectado' : 'Pendiente de autorización en tu computadora'}</p></div>
        <div className="bg-slate-50 rounded-lg p-3"><strong>WhatsApp</strong><p>+{status.recipients.whatsapp}</p><p>{status.whatsappReady ? 'Vinculado' : 'Pendiente de vincular por QR en tu computadora'}</p></div>
      </div>
      <p className="text-sm">Ejecutor: {status.online ? 'En línea' : 'Desconectado'} · Clave de conexión: {status.workerConfigured ? 'Configurada' : 'Pendiente'}</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || !status.emailReady} onClick={() => send(['email'])} className="px-4 py-2 bg-blue-700 text-white rounded-lg disabled:opacity-40">Probar email</button>
        <button disabled={busy || !status.whatsappReady} onClick={() => send(['whatsapp'])} className="px-4 py-2 bg-emerald-700 text-white rounded-lg disabled:opacity-40">Probar WhatsApp</button>
        <button disabled={busy || !status.emailReady || !status.whatsappReady} onClick={() => send(['email', 'whatsapp'])} className="px-4 py-2 bg-slate-900 text-white rounded-lg disabled:opacity-40">Enviar ambas pruebas</button>
      </div>
      {!status.online && <details className="text-sm bg-amber-50 p-3 rounded-lg"><summary className="font-semibold cursor-pointer">Conectar mi computadora una sola vez</summary>
        <p className="mt-2">Descargá el proyecto y abrí channel-worker/iniciar-windows.bat. La guía channel-worker/README.md indica cómo configurar la conexión privada y autorizar Gmail. El QR de WhatsApp aparece solamente en tu computadora. No ingreses tu contraseña habitual de Gmail en esta página.</p>
      </details>}
      <p className="text-xs text-slate-500">Aceptado por el servicio no significa leído por el destinatario. WhatsApp Web es una integración extraoficial y puede desconectarse.</p>
      <div className="space-y-2" aria-live="polite">{status.jobs.map((job: any) => <div key={job.id} className="border rounded-lg p-3 text-sm">
        <strong>{job.channel === 'email' ? 'Email' : 'WhatsApp'} · {labels[job.state] || job.state}</strong>
        <p>{new Date(job.createdAt).toLocaleString()} · {job.recipient}</p><p>{job.evidence}</p>
        {job.providerId && <p className="text-xs break-all">Referencia del servicio: {job.providerId}</p>}
      </div>)}</div>
    </>}
    {error && <p role="alert" className="text-red-800 bg-red-50 p-3 rounded-lg">{error}</p>}
  </section>;
}
