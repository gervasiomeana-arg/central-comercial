import type { Application, PlanItem } from '../src/types.js';

export const COMMERCIAL_CATALOG_VERSION = '2026-11-12.2';
const at = '2026-11-12T18:00:00.000Z';
const openSource = 'https://openvoley.com';
const visibilitySource = 'https://github.com/gervasiomeana-arg/visibility-ai/blob/main/src/config/markets.ts';
const neuroSource = 'https://neuroplaneta.ai.studio/';
const plan = (id: string, name: string, price: number | null, currency: string, interval: PlanItem['interval'], sourceUrl: string, market = 'Todos', features: string[] = []): PlanItem => ({ id: `catalog-${id}`, name, price, currency, interval, features, verified: true, sourceUrl, verifiedAt: at, market, verificationNotes: `Consultado el 12/11/2026. Fuente: ${sourceUrl}. Mercado: ${market}.` });

export function commercialCatalog(): Application[] {
  const base = (id: string, name: string, slug: string, website: string): Application => ({ id, name, slug, website, description: '', targetAudience: '', countries: [], languages: ['es'], verifiedFeatures: [], unverifiedFeatures: [], trialAvailable: false, trialVerified: false, trialDurationDays: null, plans: [], registerUrl: website, paymentUrl: website, faqs: [], promotionalMaterials: [], status: 'lista', campaignsAllowed: true, internalNotes: '', createdAt: at, updatedAt: at, commercialCatalogVersion: COMMERCIAL_CATALOG_VERSION });
  return [
    { ...base('app-open-voley', 'Open Voley', 'open-voley', openSource), description: 'Scouting, análisis y entrenamiento de voleibol para entrenadores, clubes y asociaciones.', targetAudience: 'Entrenadores, clubes, asociaciones y federaciones de voleibol.', countries: ['Argentina', 'Brasil', 'Uruguay', 'Paraguay', 'Chile', 'México', 'Colombia', 'España'], languages: ['es', 'pt-BR'], verifiedFeatures: ['Registro de acciones y rotaciones de ambos equipos', 'Análisis estadístico del partido', 'Video y entrenamiento conectados al trabajo del equipo'], trialAvailable: true, trialVerified: true, trialDurationDays: 7,
      commercialNotes: 'La tabla general ofrece ARS y USD. Para Brasil hay una tabla independiente en USD: actualmente publica «Preço sob consulta». No aplicar la tarifa general a Brasil ni convertir a BRL. El pago se realiza en Open Voley, no en Central Comercial.',
      plans: [
        plan('ov-dt-ars', 'DT / Entrenador · Argentina', 30000, 'ARS', 'mensual', openSource, 'Argentina'),
        plan('ov-club-ars', 'Club Pro & Liga · Argentina', 52500, 'ARS', 'mensual', openSource, 'Argentina'),
        plan('ov-federacion-ars', 'Federación / Torneo · Argentina', 148500, 'ARS', 'mensual', openSource, 'Argentina'),
        plan('ov-dt-usd', 'DT / Entrenador · USD general', 20, 'USD', 'mensual', openSource, 'General, excepto Brasil'),
        plan('ov-club-usd', 'Club Pro & Liga · USD general', 35, 'USD', 'mensual', openSource, 'General, excepto Brasil'),
        plan('ov-federacion-usd', 'Federación / Torneo · USD general', 99, 'USD', 'mensual', openSource, 'General, excepto Brasil'),
        plan('ov-br-dt', 'Brasil · Treinador', null, 'USD', 'mensual', openSource, 'Brasil', ['Precio a consultar en la tabla de Brasil']),
        plan('ov-br-club', 'Brasil · Clube Pro', null, 'USD', 'mensual', openSource, 'Brasil', ['Precio a consultar en la tabla de Brasil']),
        plan('ov-br-federacion', 'Brasil · Federação / Torneio', null, 'USD', 'mensual', openSource, 'Brasil', ['Precio a consultar en la tabla de Brasil'])
      ] },
    { ...base('app-visibility-ai', 'Visibility AI', 'visibility-ai', 'https://visibility-ia.ai.studio/'), description: 'Auditoría y seguimiento de presencia digital para negocios, agencias y consultoras.', targetAudience: 'Pymes, agencias, consultoras, comercios y prestadores de servicios.', countries: ['Argentina', 'Uruguay', 'Chile', 'México', 'Colombia', 'España', 'Estados Unidos'], verifiedFeatures: ['Auditoría técnica de sitios web', 'Historial e informes de seguimiento', 'Oportunidades y plan de acción', 'Integración de Search Console según el plan'], commercialNotes: 'Tarifas contrastadas con src/config/markets.ts y la elección del propietario: Diagnóstico se cobra una vez; los demás son mensuales. La web publicada actualmente tiene acceso privado del operador. Los informes se entregan al cliente; no prometer registro público de clientes ni una prueba gratuita.',
      plans: [
        plan('vai-diagnostic', 'Diagnóstico', 30, 'USD', 'unico', visibilitySource, 'Todos', ['Auditoría puntual', 'Resumen ejecutivo', 'Problemas y oportunidades principales']),
        plan('vai-monitor', 'Visibility Monitor', 50, 'USD', 'mensual', visibilitySource, 'Todos', ['Auditoría mensual', 'Historial', 'PageSpeed', 'Informe mensual']),
        plan('vai-growth', 'Visibility Growth', 100, 'USD', 'mensual', visibilitySource, 'Todos', ['Search Console', 'Keywords reales', 'Oportunidades', 'Plan de acción', 'IA']),
        plan('vai-pro', 'Visibility PRO Gestionado', 200, 'USD', 'mensual', visibilitySource, 'Todos', ['Seguimiento gestionado', 'Optimización y contenido asistido', 'Hasta 3 negocios']),
        plan('vai-agency', 'Agency', 350, 'USD', 'mensual', visibilitySource, 'Todos', ['Multi-cliente', 'Informes', 'Administración centralizada', 'Hasta 30 negocios'])
      ] },
    { ...base('app-neuroplaneta', 'NeuroPlaneta', 'neuroplaneta', neuroSource), description: 'Actividades y juegos para niños con acompañamiento adulto y registro de uso.', targetAudience: 'Familias, educadores e instituciones que acompañan a niños.', countries: ['Argentina', 'Chile', 'Uruguay', 'México', 'Colombia', 'España'], verifiedFeatures: ['Actividades de atención, calma, rutinas y comunicación visual', 'Acompañamiento adulto y registro de uso'], trialAvailable: true, trialVerified: true, trialDurationDays: 2, medicalDisclaimer: 'NeuroPlaneta ofrece actividades y juegos. No diagnostica ni trata condiciones médicas o psicológicas.', commercialNotes: 'Plan Familia USD 20 mensuales. Prueba de 2 días sin tarjeta ni PayPal y sin cobro automático al finalizar. La suscripción es opcional y requiere autorización en PayPal. Central Comercial no acredita pagos automáticamente.', plans: [plan('np-family', 'Plan Familia', 20, 'USD', 'mensual', neuroSource, 'Todos', ['Actividades y juegos acompañados', 'Herramientas para el adulto y registro de uso'])] },
    { ...base('app-funeraria', 'Funeraria', 'funeraria', ''), description: 'Gestión operativa para empresas funerarias. Aplicación en desarrollo.', targetAudience: 'Empresas funerarias, salas velatorias y cooperativas de servicios funerarios.', countries: ['Argentina', 'Uruguay', 'Chile', 'España'], status: 'en_desarrollo', campaignsAllowed: false, commercialNotes: 'Incorporada al catálogo. No se publican precios ni se habilitan campañas hasta su lanzamiento; el propietario indicó que la cuarta aplicación sigue en desarrollo.' }
  ];
}

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const oldSeeds: Record<string, { price: number; names: string[] }> = {
  'ov-plan-club-basico': { price: 29, names: ['Club Básico'] },
  'ov-plan-club-pro': { price: 69, names: ['Club Pro'] },
  'ov-plan-federacion': { price: 199, names: ['Federación / Asociación'] },
  'vai-plan-starter': { price: 49, names: ['Starter PYME'] },
  'vai-plan-agency': { price: 149, names: ['Agency Pro'] },
  'np-plan-familia-mensual': { price: 12, names: ['Plan Familia Mensual'] },
  'np-plan-familia-anual': { price: 99, names: ['Plan Familia Anual'] }
};
function isLegacyExample(plan: PlanItem) {
  if (plan.verified || plan.currency !== 'USD') return false;
  const seed = oldSeeds[plan.id];
  if (seed && plan.price === seed.price) return true;
  return Object.values(oldSeeds).some(seed => plan.price === seed.price && seed.names.some(name => key(plan.name.replace(' (Borrador inicial)', '')) === key(name)));
}
export function mergeCommercialCatalog(existing: Application[]): { applications: Application[]; changed: boolean } {
  const applications = structuredClone(existing);
  let changed = false;
  for (const official of commercialCatalog()) {
    const found = applications.find(a => a.id === official.id || key(a.slug || '') === key(official.slug) || key(a.name || '') === key(official.name));
    if (!found) { applications.push(official); changed = true; continue; }
    if (found.commercialCatalogVersion === COMMERCIAL_CATALOG_VERSION) continue;
    // Preserve IDs, relationships, custom records and historical prices. Archive known seed examples.
    found.plans ||= [];
    for (const previous of found.plans) {
      if (isLegacyExample(previous)) { previous.archived = true; previous.verificationNotes = 'Precio de ejemplo reemplazado por el catálogo verificado el 12/11/2026. Conservado para historial; excluido de ofertas.'; }
    }
    for (const published of official.plans) if (!found.plans.some(p => p.id === published.id)) found.plans.push(published);
    for (const field of ['website', 'registerUrl', 'paymentUrl'] as const) if (!found[field] || found[field].startsWith('Pendiente')) found[field] = official[field];
    if (!found.targetAudience) found.targetAudience = official.targetAudience;
    found.verifiedFeatures = [...new Set([...(found.verifiedFeatures || []), ...official.verifiedFeatures])];
    if (official.trialVerified && !found.trialVerified) { found.trialAvailable = official.trialAvailable; found.trialVerified = true; found.trialDurationDays = official.trialDurationDays; }
    found.commercialNotes = official.commercialNotes;
    found.commercialCatalogVersion = COMMERCIAL_CATALOG_VERSION;
    found.updatedAt = at; changed = true;
  }
  return { applications, changed };
}

export function verifiedPriceSummary(app: Application): string {
  return app.plans.filter(p => p.verified && !p.archived).map(p => `${p.name}: ${p.price === null ? 'Precio a consultar' : `${p.currency} ${p.price}`} / ${p.interval}${p.market ? ` (${p.market})` : ''}`).join('\n');
}
