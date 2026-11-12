import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { Application, Contact } from '../src/types.js';
import { playbook, normalize } from './sales-director.js';
import { randomUUID } from 'node:crypto';

export function publicAddress(address: string) {
  if (net.isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
export function publicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || net.isIP(url.hostname) || !url.hostname.includes('.') || /\.(local|internal|localhost)$/i.test(url.hostname)) throw new Error('Solo se investigan sitios públicos HTTPS.');
  url.hash = ''; return url;
}
export async function fetchPublicText(value: string, redirects = 0): Promise<{ url: string; text: string }> {
  const url = publicUrl(value);
  const addresses = await dns.lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Dirección de red no pública.');
  const address = addresses[0].address;
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'CentralComercial/1.0 (public business contact research)', Accept: 'text/html,application/rss+xml,application/xml,text/xml' }, family: 4, lookup: (_host, _options, callback) => callback(null, address, 4), timeout: 8000 }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume(); clearTimeout(timer);
        if (redirects >= 3 || !response.headers.location) { reject(new Error('Demasiadas redirecciones.')); return; }
        fetchPublicText(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject); return;
      }
      if ([401, 403, 429].includes(status)) { response.resume(); reject(new Error(`Acceso bloqueado por el sitio (${status}). No se intentará evadirlo.`)); return; }
      if (status !== 200) { response.resume(); reject(new Error(`Sitio no disponible (${status}).`)); return; }
      if (!/text\/html|xml|rss|text\/plain/i.test(String(response.headers['content-type'] || ''))) { response.resume(); reject(new Error('La página no contiene texto público.')); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', chunk => { size += chunk.length; if (size > 750000) request.destroy(new Error('Página demasiado grande.')); else chunks.push(chunk); });
      response.on('end', () => { clearTimeout(timer); resolve({ url: url.href, text: Buffer.concat(chunks).toString('utf8') }); });
      response.on('error', reject); response.on('aborted', () => reject(new Error('La página interrumpió la consulta.')));
    });
    const timer = setTimeout(() => request.destroy(new Error('Tiempo de consulta agotado.')), 10000);
    request.on('timeout', () => request.destroy(new Error('Tiempo de consulta agotado.')));
    request.on('error', error => { clearTimeout(timer); reject(error); });
    request.on('close', () => clearTimeout(timer));
  });
}
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const excluded = /(^|\.)(bing|microsoft|google|facebook|instagram|linkedin|youtube|wikipedia|twitter|x)\.(com|org)$/i;
export function searchLinks(xml: string) {
  return [...new Set([...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(item => {
    const link = item[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1];
    try { const url = publicUrl(decode(link || '').trim()); return excluded.test(url.hostname) ? [] : [url.href]; } catch { return []; }
  }))].slice(0, 10);
}
export function contactLinks(html: string, base: string) {
  const origin = new URL(base).origin;
  return [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].flatMap(match => {
    try { const url = publicUrl(new URL(decode(match[1]), base).href); return url.origin === origin && /contact|contato|contacto/i.test(url.pathname) ? [url.href] : []; } catch { return []; }
  }).slice(0, 2);
}
export function extractContact(html: string, url: string, app: Application, country: string, now = new Date()): Contact | null {
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const text = decode(clean.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  if (!playbook(app).terms.some(term => normalize(text).includes(normalize(term)))) return null;
  const phoneMatch = clean.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?[^"'<>]*?phone=)(\+?\d{8,15})/i);
  const phone = phoneMatch?.[1].replace(/\D/g, '') || '';
  const prefixes: Record<string, string> = { argentina: '54', uruguay: '598', chile: '56', brasil: '55', paraguay: '595', colombia: '57', mexico: '52', espana: '34' };
  if (!normalize(text).includes(normalize(country)) && !(prefixes[normalize(country)] && phone.startsWith(prefixes[normalize(country)]))) return null;
  const emails = [...new Set((decode(clean).match(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(e => e.toLowerCase()))].filter(e => e.length < 200 && !/example\.|ejemplo\.|noreply@|no-reply@|\.(png|jpg|webp|svg|css|js)$/.test(e));
  const email = emails.sort((a, b) => Number(/^(info|contacto|contact|administracion|secretaria|hola|contato)@/.test(b)) - Number(/^(info|contacto|contact|administracion|secretaria|hola|contato)@/.test(a)))[0] || '';
  if (!email && !phone) return null;
  const title = decode(clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || new URL(url).hostname).slice(0, 160);
  return { id: `contact-${randomUUID()}`, orgName: title, contactPerson: '', role: 'Contacto institucional público', orgType: playbook(app).audience, country, language: normalize(country) === 'brasil' ? 'pt-BR' : 'es', timezone: 'America/Argentina/Buenos_Aires', website: new URL(url).origin, email, phone, source: url, sourceReviewDate: now.toISOString(), interestedAppIds: [app.id], assignedTo: 'Central Comercial', notes: 'Dato extraído de una página pública de la organización. No implica consentimiento del destinatario. WhatsApp solo se registra como contacto; no se conecta ni se envía.', history: [], preferredChannel: email ? 'email' : 'whatsapp', permission: 'desconocido', outreachBasis: 'public_business_contact', status: 'prospecto', nextFollowUpDate: null, createdAt: now.toISOString(), updatedAt: now.toISOString() };
}
