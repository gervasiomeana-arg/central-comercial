import { useEffect, useState } from 'react';
import { api } from '../api.js';

const phases = { buscar: '09:00 · Buscar contactos', enviar: '13:00 · Enviar promociones', revisar: '19:00 · Revisar respuestas' };

export function DailyBatchesPanel() {
  const [today, setToday] = useState<Awaited<ReturnType<typeof api.getDailyBatches>>>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void api.getDailyBatches().then(value => {
      if (active) { setToday(value); setError(false); }
    }).catch(() => { if (active) setError(true); }); };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
    <h2 className="text-lg font-semibold">Tandas de hoy · Hora argentina</h2>
    {error && <p role="status">El estado de las tandas está temporalmente indisponible.</p>}
    {today && <ul className="space-y-2">{today.receipts.map(({phase, startedAt, completedAt, report}) =>
      <li key={phase}>
        <strong>{phases[phase]}</strong>
        <span> · {completedAt ? 'Completada' : startedAt ? 'Iniciada, sin cierre registrado' : 'Sin inicio registrado'}</span>
        {report && <details className="mt-2">
          <summary className="cursor-pointer">Ver informe de cierre</summary>
          <pre className="whitespace-pre-wrap break-words text-sm mt-2">{report}</pre>
        </details>}
      </li>)}</ul>}
  </section>;
}
