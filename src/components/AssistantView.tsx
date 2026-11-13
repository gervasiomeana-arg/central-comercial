import React, { useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, Send, Square, Volume2, FileText, Download } from 'lucide-react';
import { api } from '../api.js';
import { useVoice } from '../useVoice.js';
import type { Application } from '../types.js';
import type { AssistantEntry, AssistantState } from '../assistant-types.js';

export function AssistantView({ selectedAppFilter, applications }: { selectedAppFilter: string; applications: Application[] }) {
  const [input, setInput] = useState('');
  const [state, setState] = useState<AssistantState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [readReplies, setReadReplies] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const voice = useVoice(setInput);
  const spoken = useRef(new Set<string>());
  const speech = useRef(voice.speak); speech.current = voice.speak;
  const readEnabled = useRef(readReplies); readEnabled.current = readReplies;
  const appName = applications.find(a => a.id === selectedAppFilter)?.name || 'Todas las aplicaciones';
  const visible = state?.entries.filter(e => e.appId === selectedAppFilter) || [];
  const pending = state?.entries.some(e => e.state === 'queued' || e.state === 'running');
  useEffect(() => {
    let disposed = false, initialized = false;
    const refresh = async () => {
      try {
        const result = await api.getAssistant(); if (disposed) return;
        if (!initialized) { result.entries.forEach(e => spoken.current.add(e.id)); initialized = true; }
        setState(result); setLoaded(true);
      } catch (e: any) { if (!disposed) { setError(e.message); setLoaded(true); } }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 7000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  useEffect(() => {
    const completed = visible.filter(e => e.state === 'completed' && e.answer && !spoken.current.has(e.id));
    completed.forEach(e => spoken.current.add(e.id));
    const last = completed.at(-1);
    if (last && readEnabled.current) speech.current(last.answer!);
  }, [state, selectedAppFilter]);
  const send = async (report = false) => {
    if (voice.listening) { voice.stopListening(); setError('Revisá el texto dictado y pulsá Enviar cuando esté correcto.'); return; }
    const question = report ? 'Informe actual de Central Comercial' : input.trim(); if (!question) return;
    setBusy(true); setError('');
    try { const response = await api.askAssistant(question, selectedAppFilter, report ? 'report' : 'question'); setState(response); if (!report) setInput(''); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const download = (entry: AssistantEntry) => {
    if (!entry.answer) return;
    const blob = new Blob([`${entry.appName}\n${entry.source === 'records' ? 'Informe de registros' : 'Recomendación de OpenJarvis'}\n\n${entry.answer}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `Central-Comercial-${entry.source === 'records' ? 'informe' : 'respuesta'}-${new Date(entry.createdAt).toISOString().slice(0, 10)}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="max-w-5xl mx-auto space-y-7">
    <header className="flex flex-col sm:flex-row justify-between gap-5">
      <div><p className="text-xs uppercase tracking-widest text-slate-500 mb-3">Tu asistente comercial</p><h1 className="text-3xl font-semibold text-slate-900 flex items-center gap-3"><AudioLines className="text-emerald-800" /> Hablemos de tu negocio.</h1><p className="mt-3 text-slate-600">Escribí o dictá tu consulta. Recibí informes para leer o escuchar.</p></div>
      <button disabled={busy || !loaded} onClick={() => void send(true)} className="self-start rounded-xl bg-emerald-800 text-white px-5 py-3 min-h-12 inline-flex items-center gap-2 disabled:opacity-40"><FileText size={18} /> Informe actual</button>
    </header>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
      <div><p className="font-medium text-slate-800">{appName}</p><p className="text-sm text-slate-500 mt-1">{state?.ready ? `OpenJarvis conectado · ${state.model}` : 'Informes disponibles · Conversación con OpenJarvis pendiente de conexión'}</p></div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex gap-2 items-center text-sm text-slate-600"><input type="checkbox" checked={readReplies} disabled={!voice.canSpeak} onChange={e => { setReadReplies(e.target.checked); if (!e.target.checked) voice.stopSpeaking(); }} /> Leer nuevas respuestas en voz alta</label>
        {voice.voices.length > 0 && <label className="text-sm text-slate-600"><span className="sr-only">Voz de lectura</span><select value={voice.voiceName} onChange={e => voice.setVoiceName(e.target.value)} className="rounded-lg border border-slate-200 p-2 max-w-64"><option value="">Voz en español recomendada</option>{voice.voices.map((v, i) => <option key={`${v.name}-${i}`} value={v.name}>{v.name}{v.localService ? ' · del equipo' : ''}</option>)}</select></label>}
        {voice.speaking && <button className="inline-flex gap-2 text-sm text-rose-800 min-h-11 items-center" onClick={voice.stopSpeaking}><Square size={15} /> Detener lectura</button>}
      </div>
    </div>
    <div className="space-y-5" aria-live="polite" aria-relevant="additions text">
      {loaded && visible.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 px-7 py-10 text-slate-600"><h2 className="font-semibold text-lg text-slate-900 mb-3">Central Comercial, a tu manera.</h2><p>Pedí un informe actual para conocer campañas, envíos registrados, respuestas, pagos y avance de la meta mensual. O consultale a OpenJarvis cómo mejorar tu estrategia.</p><p className="mt-3 text-sm">Las recomendaciones no ejecutan campañas ni confirman pagos.</p></div>}
      {visible.slice(-20).map(entry => <article key={entry.id} className="space-y-3">
        <div className="ml-auto max-w-2xl rounded-2xl rounded-br-md bg-slate-800 px-5 py-4 text-white"><p className="text-xs text-slate-300 mb-2">Vos · {entry.appName}</p><p className="whitespace-pre-wrap break-words">{entry.question}</p></div>
        <div className="mr-auto rounded-2xl rounded-bl-md border border-slate-200 bg-white px-6 py-5 max-w-3xl">
          <div className="flex flex-wrap gap-3 justify-between items-center mb-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{entry.source === 'records' ? 'Central · Registros de la app' : 'OpenJarvis · Recomendación'}</p><time className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString('es-AR')}</time></div>
          {entry.state === 'queued' && <p className="text-sm text-slate-500">Consulta en espera del motor local…</p>}
          {entry.state === 'running' && <p className="text-sm text-slate-500">OpenJarvis está preparando su respuesta…</p>}
          {entry.error && <p className="text-sm text-rose-800">{entry.error}</p>}
          {entry.answer && <><p className="whitespace-pre-wrap break-words text-slate-700 leading-relaxed">{entry.answer}</p><div className="mt-5 flex flex-wrap gap-5 border-t border-slate-100 pt-4"><button disabled={!voice.canSpeak} onClick={() => voice.speak(entry.answer!)} className="min-h-11 inline-flex items-center gap-2 text-sm text-emerald-800 disabled:opacity-40"><Volume2 size={17} /> Escuchar</button><button onClick={() => download(entry)} className="min-h-11 inline-flex items-center gap-2 text-sm text-slate-600"><Download size={17} /> Descargar texto</button></div></>}
        </div>
      </article>)}
    </div>
    <form onSubmit={e => { e.preventDefault(); void send(); }} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
      <label htmlFor="central-question" className="font-medium text-slate-800">Tu consulta para {appName.toLowerCase()}</label>
      <textarea id="central-question" value={input} maxLength={1200} onChange={e => setInput(e.target.value)} rows={3} placeholder="Por ejemplo: ¿cómo vamos con el objetivo mensual?" className="w-full block rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-900 focus:outline-emerald-700" />
      <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={busy || !voice.canDictate} onClick={() => voice.dictate(input)} aria-pressed={voice.listening} className={`min-h-12 inline-flex items-center gap-2 px-4 py-3 rounded-xl border ${voice.listening ? 'bg-rose-50 text-rose-800 border-rose-200' : 'text-slate-700 border-slate-200'} disabled:opacity-40`}>{voice.listening ? <Square size={17} /> : <Mic size={17} />}{voice.listening ? 'Terminar dictado' : 'Dictar consulta'}</button><div className="flex items-center gap-4"><span className="text-xs text-slate-500">{input.length}/1200</span><button type="submit" disabled={busy || !input.trim() || voice.listening || Boolean(pending)} className="min-h-12 px-5 py-3 rounded-xl bg-emerald-800 text-white inline-flex items-center gap-2 disabled:opacity-40"><Send size={16} />{busy ? 'Enviando…' : 'Enviar consulta'}</button></div></div>
      <p className="text-xs text-slate-500 leading-relaxed">El micrófono se activa solo al pulsar Dictar; revisá el texto antes de enviarlo. El navegador puede procesar el audio mediante su proveedor. Central Comercial no guarda audio. Las voces y el dictado dependen del navegador y del equipo.</p>
      {!voice.canDictate && <p className="text-sm text-slate-600">Dictado no disponible en este navegador. Podés escribir y descargar los informes.</p>}
      {(error || voice.error) && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error || voice.error}</p>}
    </form>
  </section>;
}
