import { validDay } from '../src/ledger.js';
import type { RuntimeActivity } from '../src/runtime-types.js';

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function validateActivity(value: RuntimeActivity): RuntimeActivity {
  if (!value || typeof value.paused !== 'boolean' ||
      (value.lastCycleAt !== null && (typeof value.lastCycleAt !== 'string' || !Number.isFinite(Date.parse(value.lastCycleAt)))) ||
      !isCount(value.pendingPromotions) || !isCount(value.completedPlans) ||
      !isCount(value.campaignsUsingOpenJarvis)) throw new Error('Resumen de actividad inválido.');
  const { dates, series } = value.statistics || {};
  if (!Array.isArray(dates) || dates.length !== 90 ||
      dates.some((date, i) => typeof date !== 'string' || !validDay(date) ||
        (i > 0 && Date.parse(date) - Date.parse(dates[i - 1]) !== 86400000)) ||
      !Array.isArray(series) || series.length > 100) throw new Error('Estadísticas de la PC inválidas.');
  const ids = new Set<string>();
  const cleanSeries = series.map(app => {
    if (!app || [app.id, app.slug, app.name].some(text => typeof text !== 'string' || !text.trim() || text.length > 200) ||
        ids.has(app.id) || [app.contacts, app.promotions].some(values =>
          !Array.isArray(values) || values.length !== dates.length || !values.every(isCount))) {
      throw new Error('Estadísticas de la PC inválidas.');
    }
    ids.add(app.id);
    return { id: app.id, slug: app.slug, name: app.name, contacts: [...app.contacts], promotions: [...app.promotions] };
  });
  return {
    paused: value.paused, lastCycleAt: value.lastCycleAt, pendingPromotions: value.pendingPromotions,
    completedPlans: value.completedPlans, campaignsUsingOpenJarvis: value.campaignsUsingOpenJarvis,
    statistics: { dates: [...dates], series: cleanSeries },
  };
}
