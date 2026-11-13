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
