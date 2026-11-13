import React, { useEffect, useState } from 'react';
import { BrainCircuit, ArrowRight, ChevronDown } from 'lucide-react';
import { api } from '../api.js';
import type { Application } from '../types.js';
import type { JarvisStatus } from '../openjarvis-types.js';

const labels = { queued: 'En espera', running: 'Preparando estrategia', completed: 'Propuesta lista para revisar', failed: 'No se completó' };
export function OpenJarvisPanel() {
  const [status, setStatus] = useState<JarvisStatus | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [appId, setAppId] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try { const result = await api.getJarvisStatus(); if (!disposed) setStatus(result); }
      catch (e: any) { if (!disposed) setError(e.message); }
    };
    (async () => {
      try {
        const [a, g, s] = await Promise.all([api.getApplications(), api.getSalesGoal(), api.getJarvisStatus()]);
        if (disposed) return;
        const eligible = a.filter(app => app.status === 'lista' && app.campaignsAllowed);
        setApps(eligible); setAppId(eligible[0]?.id || ''); setCountries(g.goal.countries); setCountry(g.goal.countries[0] || ''); setStatus(s);
      } catch (e: any) { if (!disposed) setError(e.message); }
      finally { if (!disposed) setLoading(false); }
    })();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  const prepare = async () => {
    setBusy(true); setError('');
    try { await api.prepareJarvisPlan(appId, country); setStatus(await api.getJarvisStatus()); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const pending = status?.plans.some(p => ['queued', 'running'].includes(p.state));
  const selectedPlans = status?.plans.filter(p => p.context.app.id === appId && p.context.country === country) || [];
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6" aria-labelledby="jarvis-title">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="flex gap-4">
        <span className="rounded-xl bg-emerald-50 p-3 h-fit text-emerald-800"><BrainCircuit size={24} /></span>
        <div><p className="text-xs tracking-widest uppercase text-slate-500 mb-2">Inteligencia local · OpenJarvis</p>
          <h2 id="jarvis-title" className="text-xl font-semibold text-slate-900">Una estrategia para tu próximo cliente.</h2>
          <p className="text-sm text-slate-600 mt-2 max-w-xl">Planificación por aplicación, país y objetivo mensual. El motor trabaja en tu computadora y devuelve su propuesta a este panel.</p>
        </div>
      </div>
      <span role="status" className={`text-xs font-semibold px-3 py-2 rounded-full whitespace-nowrap h-fit ${status?.ready ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
        {loading ? 'Consultando conexión' : status?.ready ? 'Listo para planificar' : status?.online ? 'Esperando modelo local' : 'Pendiente de conexión'}
      </span>
    </div>
    {status && <p className="text-sm text-slate-500">{status.detail}{status.model ? ` Modelo: ${status.model}.` : ''}</p>}
    <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-4 border-t border-slate-100 pt-6">
      <label className="flex-1 text-sm text-slate-600">Aplicación
        <select value={appId} onChange={e => setAppId(e.target.value)} className="block w-full mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 min-h-12">
          {apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}
        </select>
      </label>
      <label className="flex-1 text-sm text-slate-600">País del objetivo mensual
        <select value={country} onChange={e => setCountry(e.target.value)} className="block w-full mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 min-h-12">
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <button onClick={prepare} disabled={busy || !status?.ready || !status?.configured || !appId || !country || pending} className="min-h-12 rounded-xl bg-emerald-800 text-white px-5 py-3 inline-flex items-center justify-center gap-3 font-medium disabled:opacity-40">
        {busy ? 'Solicitando estrategia…' : pending ? 'Estrategia en preparación' : 'Preparar estrategia'} <ArrowRight size={17} />
      </button>
    </div>
    <p className="text-xs leading-relaxed text-slate-500">Las propuestas requieren verificar sus fuentes. Preparar una estrategia no inicia campañas, envíos ni cobros. Las solicitudes idénticas reutilizan el resultado del día.</p>
    {error && <p role="alert" className="text-sm rounded-xl bg-rose-50 text-rose-800 p-4">{error}</p>}
    <div aria-live="polite" className="space-y-4">
      {selectedPlans.slice(0, 3).map(p => <article key={p.id} className="rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex justify-between gap-4 flex-wrap"><h3 className="font-semibold text-slate-900">{p.context.app.name} · {p.context.country}</h3><span className="text-sm text-slate-500">{labels[p.state]}</span></div>
        <p className="text-xs text-slate-500">Objetivo conjunto {p.context.goal.month}: {p.context.goal.targetClients} clientes; faltaban {p.context.goal.remainingClients} al solicitarla. {p.model && `Modelo: ${p.model}.`}</p>
        {p.error && <p className="text-sm text-rose-800">{p.error}</p>}
        {p.strategy && <>
          <p className="text-sm text-slate-700 leading-relaxed">{p.strategy.campaignAngle}</p>
          <div className="grid md:grid-cols-2 gap-6">
            <div><h4 className="font-medium mb-3">A quién ofrecerla</h4><ul className="space-y-3 text-sm text-slate-600">{p.strategy.segments.map((s, i) => <li key={i}><strong className="text-slate-800">{s.name}</strong><p className="mt-1">{s.reason}</p></li>)}</ul></div>
            <div><h4 className="font-medium mb-3">Búsquedas sugeridas</h4><ul className="space-y-2 text-sm text-slate-600">{p.strategy.searchQueries.map((q, i) => <li key={i} className="rounded-lg bg-slate-50 p-3 break-words">{q}</li>)}</ul></div>
          </div>
          <div><h4 className="font-medium mb-3">Próximos pasos propuestos</h4><ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">{p.strategy.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
          {p.strategy.ownerQuestions.length > 0 && <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950"><h4 className="font-medium mb-2">Para resolver con vos</h4><ul className="space-y-2">{p.strategy.ownerQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
        </>}
      </article>)}
    </div>
    <details className="border-t border-slate-100 pt-4 text-sm text-slate-600">
      <summary className="cursor-pointer flex items-center gap-2 font-medium"><ChevronDown size={16} /> Cómo conectar mi computadora</summary>
      <p className="mt-3 leading-relaxed">Usá el inicio único <strong>INICIAR_CENTRAL_COMERCIAL.bat</strong> del proyecto actualizado. Reutiliza tus conexiones y coordina los componentes en segundo plano; no necesitás abrir otra interfaz de OpenJarvis.</p>
      <p className="mt-2 leading-relaxed">La instalación inicial del motor y del modelo se explica en <strong>desktop/README.md</strong>. Su estado aparece arriba, en Tu computadora. No se usa Gemini como respaldo de estas estrategias.</p>
    </details>
  </section>;
}
