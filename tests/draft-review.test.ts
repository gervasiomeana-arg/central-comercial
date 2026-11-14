import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftReviewError, reviewEmailDraft } from '../server/draft-review.js';
import type { Application, Contact, Message } from '../src/types.js';

const now = new Date('2026-11-12T12:00:00Z');
const message = { id: 'message', conversationId: 'conversation', channel: 'email', direction: 'outbound', status: 'preparado', content: 'Una invitación a conocer Open Voley.', createdAt: '2026-11-12T10:00:00Z' } as Message;
const context = { app: { id: 'voley', status: 'lista', campaignsAllowed: true } as Application, contact: { permission: 'autorizado', status: 'prospecto', email: 'Club@Institucion.test', source: 'https://example.org', sourceReviewDate: '2026-11-01' } as Contact, actor: 'owner@example.org' };

test('approval records reviewer and recipient without sending or mutating input', () => {
  const approved = reviewEmailDraft(message, { action: 'approve', expectedRevision: 0 }, context, now);
  assert.equal(approved.reviewStatus, 'approved');
  assert.equal(approved.approvedRecipient, 'club@institucion.test');
  assert.equal(approved.reviewedBy, context.actor);
  assert.equal(approved.reviewedAt, now.toISOString());
  assert.equal(approved.status, 'preparado');
  assert.equal(approved.sentAt, undefined);
  assert.equal(approved.serviceConfirmationId, undefined);
  assert.equal(message.draftRevision, undefined);
});
test('editing invalidates approval and recipient, preserving only draft status', () => {
  const approved = reviewEmailDraft(message, { action: 'approve', expectedRevision: 0 }, context, now);
  const edited = reviewEmailDraft(approved, { action: 'edit', expectedRevision: 1, content: ' Nueva nota ' }, context, now);
  assert.equal(edited.reviewStatus, 'pending');
  assert.equal(edited.content, 'Nueva nota');
  assert.equal(edited.draftRevision, 2);
  assert.equal(edited.reviewedBy, undefined);
  assert.equal(edited.reviewedAt, undefined);
  assert.equal(edited.approvedRecipient, undefined);
});
test('stale reviews are rejected instead of overwriting newer text', () => {
  const edited = reviewEmailDraft(message, { action: 'edit', expectedRevision: 0, content: 'Nueva nota' }, context, now);
  assert.throws(() => reviewEmailDraft(edited, { action: 'approve', expectedRevision: 0 }, context, now), (err: any) => err instanceof DraftReviewError && err.status === 409);
});
test('already attempted, sent, incoming and unsupported-channel messages cannot be revised', () => {
  for (const patch of [{ status: 'enviado' }, { attemptedAt: now.toISOString() }, { serviceConfirmationId: 'provider-id' }, { direction: 'inbound' }, { channel: 'telegram' }]) {
    assert.throws(() => reviewEmailDraft({ ...message, ...patch } as Message, { action: 'reject', expectedRevision: 0 }, context, now));
  }
});
test('rejecting removes approval; discarded note can be edited and reviewed again', () => {
  const approved = reviewEmailDraft(message, { action: 'approve', expectedRevision: 0 }, context, now);
  const rejected = reviewEmailDraft(approved, { action: 'reject', expectedRevision: 1 }, context, now);
  assert.equal(rejected.reviewStatus, 'rejected');
  assert.equal(rejected.approvedRecipient, undefined);
  assert.equal(reviewEmailDraft(rejected, { action: 'edit', expectedRevision: 2, content: 'Corregida' }, context, now).reviewStatus, 'pending');
});
test('approval rechecks current contact authorization, source, email and application availability', () => {
  for (const patch of [{ permission: 'revocado' }, { status: 'baja_solicitada' }, { status: 'cliente' }, { email: 'bad' }, {email:'tu@email.com'}, {email:'you@example.com'}, { source: '' }, { sourceReviewDate: '2027-01-01' }]) {
    assert.throws(() => reviewEmailDraft(message, { action: 'approve', expectedRevision: 0 }, { ...context, contact: { ...context.contact, ...patch } as Contact }, now));
  }
  assert.throws(() => reviewEmailDraft(message, { action: 'approve', expectedRevision: 0 }, { ...context, app: { ...context.app, status: 'en_desarrollo' } }, now));
});
test('invalid actions, blank text, oversized text and unresolved variables are rejected', () => {
  assert.throws(() => reviewEmailDraft(message, { action: 'send', expectedRevision: 0 }, context, now));
  for (const content of ['', ' ', 'x'.repeat(20001), 'Hola {nombre}']) {
    assert.throws(() => reviewEmailDraft(message, { action: 'edit', expectedRevision: 0, content }, context, now));
  }
});
