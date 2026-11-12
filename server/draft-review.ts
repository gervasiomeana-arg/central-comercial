import type { Application, Contact, Message } from '../src/types.js';

export class DraftReviewError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function reviewEmailDraft(message: Message, input: { action: string; expectedRevision: number; content?: string }, context: { app?: Application; contact?: Contact; actor: string; replyReceivedIds?: string[]; allowPublicEmail?: boolean }, now = new Date()): Message {
  if (message.channel !== 'email' || message.direction !== 'outbound' || message.status !== 'preparado' || message.serviceConfirmationId || message.attemptedAt) throw new DraftReviewError('Solo se pueden revisar borradores de email que no tuvieron intentos de envío.', 409);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== (message.draftRevision || 0)) throw new DraftReviewError('Este borrador cambió. Actualizá la conversación antes de continuar.', 409);
  if (!['edit', 'approve', 'reject'].includes(input.action)) throw new DraftReviewError('Acción de revisión no válida.');
  const updated = { ...message, draftRevision: (message.draftRevision || 0) + 1 };
  if (input.action === 'edit') {
    if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 20000) throw new DraftReviewError('La nota debe contener entre 1 y 20.000 caracteres.');
    if (/\{[^{}]+\}/.test(input.content)) throw new DraftReviewError('La nota todavía contiene variables sin completar.');
    updated.content = input.content.trim();
    updated.reviewStatus = 'pending';
    delete updated.reviewedAt; delete updated.reviewedBy; delete updated.approvedRecipient;
    updated.editedAt = now.toISOString();
  } else {
    if (input.action === 'approve') {
      if (!context.app || context.app.status !== 'lista' || !context.app.campaignsAllowed) throw new DraftReviewError('La aplicación no está habilitada para promoción.');
      const replying = Boolean(message.replyToProviderId && context.replyReceivedIds?.includes(message.replyToProviderId));
      const permitted = context.contact && (context.contact.permission === 'autorizado' || (context.contact.permission === 'desconocido' && (replying || (context.allowPublicEmail === true && context.contact.outreachBasis === 'public_business_contact'))));
      if (!context.contact || !permitted || ['descartado', 'baja_solicitada'].includes(context.contact.status) || (context.contact.status === 'cliente' && !replying)) throw new DraftReviewError('El contacto ya no está habilitado para esta promoción o respuesta.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.contact.email?.trim() || '')) throw new DraftReviewError('El contacto no tiene un email válido.');
      const sourceReviewedAt = Date.parse(context.contact.sourceReviewDate);
      if (!context.contact.source?.trim() || !Number.isFinite(sourceReviewedAt) || sourceReviewedAt > now.getTime()) throw new DraftReviewError('Revisá la fuente del contacto antes de aprobar la nota.');
      if (!message.content.trim() || /\{[^{}]+\}/.test(message.content)) throw new DraftReviewError('Completá la nota antes de aprobarla.');
      updated.approvedRecipient = context.contact.email.trim().toLowerCase();
    }
    if (input.action === 'reject') delete updated.approvedRecipient;
    updated.reviewStatus = input.action === 'approve' ? 'approved' : 'rejected';
    updated.reviewedAt = now.toISOString(); updated.reviewedBy = context.actor;
  }
  // Approval records a decision; it never queues or attempts a delivery.
  return updated;
}
