import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { DailyStatistics } from '../types.js';

const appColors: Record<string, string> = {
  'open-voley': '#1565b0',
  'visibility-ai': '#14764c',
  neuroplaneta: '#8547a8',
  funeraria: '#ab4e17',
};
const extraColors = ['#b63659', '#197c89', '#5b5cae', '#82620e'];
const shortDate = (date: string) => date.slice(8, 10) + '/' + date.slice(5, 7);
const longDate = (date: string) => shortDate(date) + '/' + date.slice(0, 4);
const count = new Intl.NumberFormat('es-AR');

type AppSeries = DailyStatistics['series'][number] & { color: string };
type Metric = 'contacts' | 'promotions';

function DailyChart({ title, metric, dates, series, selected }: {
  title: string; metric: Metric; dates: string[]; series: AppSeries[]; selected: number;
}) {
  const width = 760;
  const left = 42;
  const top = 20;
  const bottom = 196;
  const plotWidth = width - left - 24;
  const max = Math.max(1, ...series.flatMap(app => app[metric]));
  const interval = Math.ceil(max / 4);
  const steps = Math.ceil(max / interval);
  const x = (index: number) => left + index * plotWidth / Math.max(dates.length - 1, 1);
  const y = (value: number) => bottom - value * (bottom - top) / (steps * interval);
  const tickIndices = Array.from({ length: Math.min(7, dates.length) }, (_, i) =>
    Math.round(i * (dates.length - 1) / Math.max(Math.min(7, dates.length) - 1, 1)));

  return <section className="cc-panel px-4 py-4 sm:px-6" aria-label={title}>
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <span className="text-sm text-slate-600">{count.format(series.reduce(
        (sum, app) => sum + app[metric].reduce((total, value) => total + value, 0), 0
      ))} en el período</span>
    </div>
    <div className="overflow-x-auto">
      <svg viewBox="0 0 760 230" className="block w-full min-w-96" role="img" aria-label={title + ' por día y aplicación'}>
        {Array.from({ length: steps + 1 }, (_, index) => {
          const value = index * interval;
          return <g key={value}>
            <line x1={left} x2={left + plotWidth} y1={y(value)} y2={y(value)} stroke="#dce1d7" />
            <text x={left - 8} y={y(value)} dy=".35em" textAnchor="end" fill="#475569" fontSize="12">{value}</text>
          </g>;
        })}
        {tickIndices.map(index => <text key={index} x={x(index)} y={221} textAnchor="middle" fill="#475569" fontSize="12">
          {shortDate(dates[index])}
        </text>)}
        <line x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} stroke="#94a3b8" strokeDasharray="4 4" />
        {series.map(app => <g key={app.id}>
          <polyline points={app[metric].map((value, index) => x(index) + ',' + y(value)).join(' ')}
            fill="none" stroke={app.color} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx={x(selected)} cy={y(app[metric][selected])} r="4.5" fill={app.color} stroke="white" />
        </g>)}
      </svg>
    </div>
  </section>;
}

export function StatisticsView({ appFilter, monitor, migrated }: { appFilter: string; monitor: boolean; migrated: boolean }) {
  const [source, setSource] = useState<'pc' | 'web'>('pc');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DailyStatistics | null>(null);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    api.getDailyStatistics(days, monitor && migrated ? 'pc' : monitor ? source : 'web').then(result => {
      if (active) setData(result);
    }).catch(error => {
      if (active) setError(error.message);
    });
    return () => { active = false; };
  }, [days, migrated, monitor, refresh, source]);

  const series = data?.series.map((app, i) => ({
    ...app, color: appColors[app.slug] || extraColors[i % extraColors.length],
  })).filter(app => appFilter === 'all' || app.id === appFilter) ?? [];
  const selected = data?.dates.includes(date) ? data.dates.indexOf(date) : (data?.dates.length ?? 1) - 1;

  return <section className="space-y-5" aria-labelledby="statistics-title">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 id="statistics-title" className="text-3xl font-semibold">Estadísticas</h1>
        <p className="mt-1 text-sm text-slate-600">Actividad diaria · hora argentina</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {monitor && !migrated && <label className="flex items-center gap-2 text-sm">Origen
          <select value={source} onChange={event => setSource(event.target.value === 'pc' ? 'pc' : 'web')} className="rounded-lg border border-slate-300 bg-white p-2">
            <option value="pc">PC dedicada</option>
            <option value="web">Publicación web</option>
          </select>
        </label>}
        <label className="flex items-center gap-2 text-sm">Período
          <select value={days} onChange={event => setDays(Number(event.target.value))} className="rounded-lg border border-slate-300 bg-white p-2">
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </label>
        <button type="button" onClick={() => setRefresh(value => value + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">Actualizar</button>
      </div>
    </header>
    {error ? <p role="alert">No se pudieron cargar las estadísticas. {error}</p>
      : !data ? <p role="status">Cargando estadísticas…</p>
      : !series.length ? <p>No hay aplicaciones para mostrar con este filtro.</p>
      : <>
        <ul aria-label="Colores de las aplicaciones" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {series.map(app => <li key={app.id} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: app.color }} />
            {app.name}
          </li>)}
        </ul>
        <DailyChart title="Contactos encontrados" metric="contacts" dates={data.dates} series={series} selected={selected} />
        <DailyChart title="Promociones enviadas" metric="promotions" dates={data.dates} series={series} selected={selected} />
        <section className="cc-panel p-4 sm:p-6" aria-label="Detalle por día">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Detalle por día</h2>
            <label className="flex items-center gap-2 text-sm">Día
              <select value={data.dates[selected]} onChange={event => setDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white p-2">
                {[...data.dates].reverse().map(day => <option key={day} value={day}>{longDate(day)}</option>)}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-72 text-left text-sm">
              <thead><tr className="border-b border-slate-200">
                <th scope="col" className="pb-2">Aplicación</th><th scope="col" className="pb-2 text-right">Contactos</th>
                <th scope="col" className="pb-2 text-right">Promociones</th>
              </tr></thead>
              <tbody>{series.map(app => <tr key={app.id} className="border-b border-slate-100">
                <th scope="row" className="py-2 font-medium">{app.name}</th>
                <td className="py-2 text-right tabular-nums">{count.format(app.contacts[selected])}</td>
                <td className="py-2 text-right tabular-nums">{count.format(app.promotions[selected])}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
        <p className="text-sm text-slate-600">Los contactos se cuentan por fecha de alta. Las promociones se cuentan con confirmación del proveedor.</p>
      </>}
  </section>;
}
