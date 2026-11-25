import {usableContactEmail} from '../src/email-policy.js';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { Application, Contact, ResearchEvidence } from '../src/types.js';
import { marketFor, marketLanguage, mexicoRegions } from './campaign-markets.js';
import { playbook, normalize, prospectingTerms } from './sales-director.js';
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
const decode = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(?:amp|quot|apos|lt|gt|commat);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
  const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&commat;':'@'};
  if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
  const hex=entity.toLowerCase().startsWith('&#x'), code=parseInt(entity.slice(hex?3:2,-1),hex?16:10);
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):entity;
});
const hostKey=(value:string)=>new URL(value).hostname.toLowerCase().replace(/^www\./,'');
const excluded = /(^|\.)(bing|microsoft|google|facebook|instagram|linkedin|youtube|wikipedia|twitter|x)\.(com|org)$/i;
export function searchLinks(xml: string) {
  return [...new Set([...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(item => {
    const link = item[1].match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i)?.[1];
    try { const url = publicUrl(decode(link || '').trim()); return excluded.test(url.hostname) ? [] : [url.href]; } catch { return []; }
  }))].slice(0, 10);
}
export function contactLinks(html: string, base: string) {
  return [...new Set([...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].flatMap(match => {
    try { const url = publicUrl(new URL(decode(match[1]), base).href); return hostKey(url.href) === hostKey(base) && /contact|contato|contacto|institucional|quienes|quem-somos|about/i.test(url.pathname) ? [url.href] : []; } catch { return []; }
  }))].sort((a,b)=>Number(/contact/i.test(b))-Number(/contact/i.test(a))).slice(0, 3);
}
const word=(text:string,term:string)=>new RegExp(`\\b${normalize(term).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(normalize(text));
function organizationData(html:string) {
  const found:{countries:string[];emails:string[]}={countries:[],emails:[]};
  const visit=(value:any,depth=0)=>{
    if(depth>4||!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.slice(0,40).forEach(v=>visit(v,depth+1));return;}
    const type=String(value['@type']||'');
    if(/Organization|LocalBusiness|School|SportsClub|SportsActivityLocation|EducationalOrganization/i.test(type)) {
      const address=Array.isArray(value.address)?value.address:[value.address];
      for(const item of address){const country=item?.addressCountry;const name=typeof country==='string'?country:country?.name||country?.identifier;if(typeof name==='string')found.countries.push(name);}
      for(const email of [value.email].flat())if(typeof email==='string')found.emails.push(email.replace(/^mailto:/i,''));
    }
    if(value['@graph'])visit(value['@graph'],depth+1);
  };
  for(const match of [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].slice(0,10)) {
    if(match[1].length>200000)continue;
    try{visit(JSON.parse(match[1]));}catch{/* Invalid structured data is not evidence. */}
  }
  return found;
}
export function reviewContactPage(html: string, url: string, app: Application, country: string, now=new Date(), context?:ResearchEvidence, excludedEmails: ReadonlySet<string> = new Set()) {
  const clean=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const text=decode(clean.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ');
  const hostname = hostKey(url);
  if (/(?:^|\.)(?:wikipedia\.org|wikimedia\.org|ecured\.cu)$/.test(hostname)) {
    return {contact:null,evidence:{url,appId:app.id,country,title:hostname,countryVerified:false,topicVerified:false},reason:'Directorio externo; no es la fuente institucional'};
  }
  const inherited=context&&context.appId===app.id&&normalize(context.country)===normalize(country)&&hostKey(context.url)===hostKey(url)?context:undefined;
  const structured=organizationData(html), rule=marketFor(country);
  const whatsappLink = clean.match(/href\s*=\s*["']https?:\/\/wa\.me\/(\+?\d{10,15})(?=[?/"'#])/i)?.[1] ||
    clean.match(/href\s*=\s*["']https?:\/\/(?:api|web)\.whatsapp\.com\/send\?[^"'<>]*?\bphone=(?:%2B|\+)?(\d{10,15})(?=[&#"'])/i)?.[1];
  const displayedWhatsApp = text.match(/\bwhats\s*app\s*(?:[:·-]\s*)?(\+[1-9][\d ().-]{8,24}\d)/i)?.[1];
  const candidatePhone = (whatsappLink || displayedWhatsApp || '').replace(/\D/g, '');
  const phone = /^[1-9]\d{9,14}$/.test(candidatePhone) ? candidatePhone : '';
  const telephone=clean.match(/href\s*=\s*["']tel:\s*(\+[^"']+)["']/i)?.[1].replace(/\D/g,'')||'';
  const title=decode(clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()||new URL(url).hostname).slice(0,160);
  const countryText = rule?.iso === 'MX' ? text.replace(/\b(?:new|nuevo) m[eé]xico\b/gi, '') : text;
  const structuredCountry = structured.countries.some(name =>
    (rule?.aliases || [country]).some(alias => normalize(alias) === normalize(name)) || rule?.iso === name.toUpperCase());
  const mexicanRegion = rule?.iso === 'MX' && new URL(url).hostname.endsWith('.mx') &&
    mexicoRegions.some(region => word(countryText, region));
  const countryClue = mexicanRegion || (rule?.aliases || [country]).some(alias => word(countryText,alias)) ||
    Boolean(rule?.prefix && (phone.startsWith(rule.prefix) || telephone.startsWith(rule.prefix)));
  const countryVerified = Boolean(structuredCountry || (!structured.countries.length && (inherited?.countryVerified || countryClue)));
  const evidence:ResearchEvidence = { url, appId: app.id, country, title, countryVerified,
    topicVerified: Boolean(inherited?.topicVerified || prospectingTerms(app,country).some(term => word(text,term))) };
  if(!evidence.topicVerified)return {contact:null,evidence,reason:'Actividad de la organización sin verificar'};
  if(!evidence.countryVerified)return {contact:null,evidence,reason:'País de la organización sin verificar'};
  const visibleEmailText=decode(clean.replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi,'').replace(/<[^>]+>/g,' '));
  const emails:string[]=visibleEmailText.match(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[];
  for(const link of clean.matchAll(/href\s*=\s*["']mailto:([^"'?]+)(?:\?[^"']*)?["']/gi)) {try{emails.push(decodeURIComponent(decode(link[1])));}catch{/* Malformed mail links are ignored. */}}
  emails.push(...structured.emails);
  const valid=[...new Set(emails.map(e=>e.trim().toLowerCase()))].filter(email => usableContactEmail(email) && !excludedEmails.has(email));
  const email=valid.sort((a,b)=>Number(/^(info|contacto|contact|administracion|secretaria|hola|contato)@/.test(b))-Number(/^(info|contacto|contact|administracion|secretaria|hola|contato)@/.test(a)))[0]||'';
  if(!email&&!phone)return {contact:null,evidence,reason:'Sin email ni enlace de WhatsApp publicados'};
  const additional=inherited?` Actividad y país contrastados también en ${inherited.url}.`:'';
  const contact:Contact={id:`contact-${randomUUID()}`,orgName:inherited?.title&&!/^(contacto|contact|contato|home|inicio)$/i.test(inherited.title)?inherited.title:title,contactPerson:'',role:'Contacto institucional público',orgType:playbook(app).audience,country,language:marketLanguage(country),timezone:'America/Argentina/Buenos_Aires',website:new URL(url).origin,email,phone,publishedWhatsApp:phone?{number:phone,source:url}:undefined,source:url,sourceReviewDate:now.toISOString(),interestedAppIds:[app.id],assignedTo:'Central Comercial',notes:`Datos publicados por la organización y verificados en su sitio.${additional}`,history:[],preferredChannel:phone?'whatsapp':'email',permission:'desconocido',outreachBasis:'public_business_contact',status:'prospecto',nextFollowUpDate:null,createdAt:now.toISOString(),updatedAt:now.toISOString()};
  return {contact,evidence,reason:phone ? (email ? 'Email y WhatsApp públicos verificados' : 'WhatsApp público verificado') : 'Email público verificado'};
}
export function extractContact(html:string,url:string,app:Application,country:string,now=new Date(),context?:ResearchEvidence):Contact|null {
  return reviewContactPage(html,url,app,country,now,context).contact;
}

// Search summaries select candidate pages; they never prove a contact's country,
// activity or permission. Those facts are checked again on the official page.
export function relevantSearchLinks(document:string,app:Application,country:string,html=false){
 const plain=(s:string)=>decode(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 const entries:{url:string;text:string}[]=[];
 if(!html){for(const m of document.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
  const item=m[1],link=item.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i)?.[1];
  if(link)entries.push({url:decode(link).trim(),text:plain((item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'')+' '+(item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]||''))});
 }}else{
  const matches=[...document.matchAll(/<a\b([^>]*class=["'][^"']*result__a[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)];
  for(let i=0;i<matches.length;i++){
   const m=matches[i],href=m[1].match(/href=["']([^"']+)["']/i)?.[1];if(!href)continue;
   try{const link=new URL(decode(href),'https://html.duckduckgo.com');const target=link.hostname.endsWith('duckduckgo.com')?link.searchParams.get('uddg'):link.href;if(!target)continue;
    const tail=document.slice((m.index||0)+m[0].length,matches[i+1]?.index||Math.min(document.length,(m.index||0)+5000));
    const snippet=tail.match(/<(?:a|div)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i)?.[1]||'';
    entries.push({url:target,text:plain(m[2]+' '+snippet)});
   }catch{}
  }
 }
 const rule=marketFor(country);
 return [...new Set(entries.flatMap(item=>{try{const u=publicUrl(item.url),text=item.text+' '+u.hostname+u.pathname;
  const topic=prospectingTerms(app,country).some(t=>word(text,t));
  const place=(rule?.aliases||[country]).some(t=>word(text,t))||Boolean(rule && u.hostname.endsWith('.'+rule.iso.toLowerCase()));
  return !excluded.test(u.hostname)&&topic&&place?[u.href]:[];
 }catch{return [];}}))].slice(0,10);
}
