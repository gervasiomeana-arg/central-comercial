import { createHash } from 'node:crypto';
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

export function collectBounces(mail, originalHeaders, threads) {
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
      const status = block.match(/^Status:[ \t]*(5\.\d{1,3}\.\d{1,3})[ \t]*\r?$/im)?.[1];
      if (!address || !status || !/^Action:[ \t]*failed[ \t]*\r?$/im.test(block)) continue;
      const references = threads.filter(thread => thread.from === address && ids.has(thread.id)).map(thread => thread.id);
      if (references.length) bounces.push({ recipient: address, status, references });
    }
  }
  return bounces;
}
