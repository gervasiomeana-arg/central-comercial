export const normalize = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
type MarketLanguage = 'es' | 'en' | 'fr' | 'nl' | 'pt-BR';

const entries: [string, string, MarketLanguage, string?][] = [
  ['Argentina','AR','es','54'], ['Brasil','BR','pt-BR','55'], ['México','MX','es','52'],
  ['Uruguay','UY','es','598'], ['Paraguay','PY','es','595'], ['Chile','CL','es','56'],
  ['Colombia','CO','es','57'], ['Perú','PE','es','51'], ['Bolivia','BO','es','591'],
  ['Canadá','CA','en'], ['Estados Unidos','US','en'], ['Belice','BZ','en','501'],
  ['Costa Rica','CR','es','506'], ['El Salvador','SV','es','503'], ['Guatemala','GT','es','502'],
  ['Honduras','HN','es','504'], ['Nicaragua','NI','es','505'], ['Panamá','PA','es','507'],
  ['Ecuador','EC','es','593'], ['Guyana','GY','en','592'], ['Surinam','SR','nl','597'], ['Venezuela','VE','es','58'],
  ['Antigua y Barbuda','AG','en','1268'], ['Bahamas','BS','en','1242'], ['Barbados','BB','en','1246'],
  ['Cuba','CU','es','53'], ['Dominica','DM','en','1767'], ['Granada','GD','en','1473'],
  ['Haití','HT','fr','509'], ['Jamaica','JM','en','1876'], ['República Dominicana','DO','es'],
  ['San Cristóbal y Nieves','KN','en','1869'], ['Santa Lucía','LC','en','1758'],
  ['San Vicente y las Granadinas','VC','en','1784'], ['Trinidad y Tobago','TT','en','1868'],
];

export const americanMarkets = entries.map(([name]) => name);
const englishNames = new Intl.DisplayNames('en', { type: 'region' });
const markets = new Map([...entries, ['España','ES','es','34'] as typeof entries[number]].map(([name, iso, language, prefix]) => [
  normalize(name), { name, iso, language, prefix, aliases: [name, englishNames.of(iso) || name] },
]));
export const marketFor = (country: string) => markets.get(normalize(country || '').trim());
export const marketLanguage = (country: string) => marketFor(country)?.language || 'es';
export const marketSearchName = (country: string) => {
  const market = marketFor(country);
  return market?.language === 'en' || market?.language === 'nl' ? market.aliases[1] : country;
};

const generalApps = new Set(['open-voley', 'visibility-ai', 'neuroplaneta']);
export const campaignCountryAllowed = (app: string | { id: string; slug: string }, country: string) => {
  const key = typeof app === 'string' ? app.replace(/^app-/, '') : app.slug;
  const market = marketFor(country);
  if (key === 'funeraria') return market?.iso === 'MX';
  return !generalApps.has(key) || Boolean(market && market.iso !== 'ES');
};

export const mexicoRegions = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
  'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
  'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
  'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];
