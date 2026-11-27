import { Resolver } from 'node:dns/promises';
import { createHash } from 'node:crypto';
export function smtpRecipient(value) {
  if (typeof value !== 'string') return undefined;
  const address = value.trim().replace(/\.+$/, '');
  return /^[^\s@<>,;]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(address) ? address : undefined;
}

const fingerprint = job => createHash('sha256').update(JSON.stringify([job.recipient, job.subject, job.content, job.inReplyTo || ''])).digest('hex');
export function initializeJournal(state) {
  state.done ||= {}; state.outcomes ||= {};
  for (const [id, result] of Object.entries(state.outcomes)) if (!state.done[id]) state.done[id] = { fingerprint: fingerprint(result), outcome: result.outcome || 'unknown', response: result.response || 'Resultado anterior sin confirmación.' };
}
export function reserveMessage(state, job) {
  initializeJournal(state);
  const key = fingerprint(job), known = state.done[job.messageId];
  const result = { ...job, outcome: known && known.fingerprint === key ? known.outcome : 'unknown',
    response: known ? known.fingerprint === key ? known.response : 'Identificador ya utilizado con otros datos; no se repite el envío.' : 'Proceso interrumpido: comprobar correo enviado antes de cualquier reintento.' };
  state.outcomes[job.messageId] = result;
  if (!known) state.done[job.messageId] = { fingerprint: key, outcome: 'unknown', response: result.response };
  return { shouldSend: !known, result };
}
export function finishMessage(state, job, result) {
  state.outcomes[job.messageId] = result;
  state.done[job.messageId] = { fingerprint: fingerprint(job), outcome: result.outcome, response: result.response };
}

export function collectBounces(mail, originalHeaders, threads, sender) {
  const deliveryParts = mail.attachments.filter(part => part.contentType === 'message/delivery-status');
  const originalParts = mail.attachments.filter(part => ['text/rfc822-headers','message/rfc822'].includes(part.contentType));
  const ids = new Set((originalHeaders.match(/<[^<>\r\n]+>/g) || []));
  for (const part of [...deliveryParts, ...originalParts]) {
    const content = part.content.toString('utf8');
    const headers = part.contentType === 'message/rfc822' ? content.split(/\r?\n\r?\n/, 1)[0] : content;
    const wanted = part.contentType === 'message/delivery-status' ? /^Original-Message-ID:\s*(<[^<>\r\n]+>)/gim : /^Message-ID:\s*(<[^<>\r\n]+>)/gim;
    for (const match of headers.matchAll(wanted)) ids.add(match[1]);
  }
  const bounces = [];
  for (const part of deliveryParts) {
    for (const block of part.content.toString('utf8').split(/\r?\n[ \t]*\r?\n/)) {
      const address = block.match(/^Final-Recipient:[ \t]*rfc822;[ \t]*([^\s<>]+)[ \t]*\r?$/im)?.[1]?.toLowerCase();
      const status = block.match(/^Status:[ \t]*([45]\.\d{1,3}\.\d{1,3})[ \t]*\r?$/im)?.[1];
      const action = block.match(/^Action:[ \t]*(failed|delayed)[ \t]*\r?$/im)?.[1]?.toLowerCase();
      if (!address || !action || (action === 'delayed' && !status?.startsWith('4.'))) continue;
      const references = threads.filter(thread => thread.from === address && ids.has(thread.id)).map(thread => thread.id);
      const diagnostic = block.match(/^Diagnostic-Code:[ \t]*smtp;[ \t]*([^\r\n]+)/im)?.[1];
      if (references.length) bounces.push({ recipient: address, status: status || '5.0.0', references, diagnostic,
        ...(action === 'delayed' || status?.startsWith('4.') ? { action } : {}) });
    }
  }
  if (!bounces.length && /^mailer-daemon@(?:googlemail|gmail)\.com$/i.test(sender || '') &&
      originalParts.length && typeof mail.text === 'string' &&
      !/\b(?:Gmail will retry|delivery is delayed|delivery incomplete)\b/i.test(mail.text)) {
    const address = mail.text.match(/^(?:Your message (?:wasn't delivered to |to )|There was a problem delivering your message to )([^\s<>]+@[^\s<>]+?)(?=[.,]?(?:\s|$))/im)?.[1]?.toLowerCase();
    const response = mail.text.match(/^The response(?: from the remote server)? was:[ \t]*\r?\n\s*(5\d{2})(?:[ -]+(5\.\d{1,3}\.\d{1,3}))?[^\r\n]*/im);
    const references = address ? threads.filter(thread => thread.from === address && ids.has(thread.id)).map(thread => thread.id) : [];
    const dnsFailure = mail.text.match(/^(?:Diagnostic-Code:\s*smtp;\s*)?[^\r\n]*\b(?:NXDOMAIN|domain name not found)\b[^\r\n]*/im)?.[0];
    if (address && (response || dnsFailure) && references.length) {
      const diagnostic = (response ? response[0].split(/\r?\n/).slice(1).join(' ').trim() : dnsFailure).slice(0,350);
      bounces.push({ recipient:address, status:response?.[2] || (dnsFailure ? '5.1.2' : '5.0.0'), references, diagnostic });
    }
  }
  return bounces;
}


const domainCache = new Map();
export async function hasInvalidMailDomain(address, {requireMx = false} = {}) {
  const domain = address.split('@').at(-1).toLowerCase();
  const key = `${domain}:${requireMx}`;
  const cached = domainCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.invalid;
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  let invalid;
  try {
    const records = await resolver.resolveMx(domain);
    if (records.length) invalid = records.every(record => !record.exchange || record.exchange === '.');
  } catch (error) {
    if (error.code === 'ENOTFOUND') invalid = true;
    else if (error.code !== 'ENODATA') return false;
  }
  if (invalid === undefined && requireMx) invalid = true;
  if (invalid === undefined) {
    // SMTP can fall back to address records if the domain publishes no MX.
    const records = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
    if (records.some(record => record.status === 'fulfilled' && record.value.length)) invalid = false;
    else if (records.every(record => record.status === 'rejected' && ['ENOTFOUND','ENODATA'].includes(record.reason?.code))) invalid = true;
    else return false;
  }
  if (domainCache.size >= 1000) domainCache.delete(domainCache.keys().next().value);
  domainCache.set(key, { invalid, expiresAt: Date.now() + 3600000 });
  return invalid;
}
