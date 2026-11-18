import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyStatistics } from '../server/daily-statistics.js';
import type { Conversation, Message } from '../src/types.js';

test('rolls up daily contacts and evidenced campaign sends by application', () => {
  const apps = [
    { id: 'voley', slug: 'open-voley', name: 'Open Voley' },
    { id: 'visibility', slug: 'visibility-ai', name: 'Visibility AI' },
  ];
  const contacts = [
    { id: 'one', createdAt: '2026-11-18T02:59:00Z', interestedAppIds: ['voley', 'voley', 'visibility'] },
    { id: 'two', createdAt: '2026-11-18T03:00:00Z', interestedAppIds: ['voley'] },
    { id: 'invalid', createdAt: 'invalid', interestedAppIds: ['voley'] },
  ];
  const sent: Message = {
    id: 'sent', conversationId: 'conversation', direction: 'outbound', channel: 'email',
    content: 'Promoción', status: 'aceptado_proveedor', serviceConfirmationId: 'receipt',
    createdAt: '2026-11-17T10:00:00Z', acceptedAt: '2026-11-18T03:00:00Z',
  };
  const conversations: Pick<Conversation, "appId" | "campaignId" | "messages">[] = [
    { appId: 'voley', campaignId: 'campaign', messages: [
      sent,
      { ...sent, id: 'duplicate' },
      { ...sent, id: 'draft', status: 'preparado', serviceConfirmationId: 'draft' },
      { ...sent, id: 'attempt', status: 'envio_intentado', serviceConfirmationId: 'attempt' },
      { ...sent, id: 'unknown', status: 'resultado_desconocido', serviceConfirmationId: 'unknown' },
      { ...sent, id: 'unproven', serviceConfirmationId: undefined },
      { ...sent, id: 'inbound', direction: 'inbound', serviceConfirmationId: 'inbound' },
      { ...sent, id: 'reply', replyToProviderId: 'inbound', serviceConfirmationId: 'reply' },
    ] },
    { appId: 'visibility', campaignId: 'campaign-two', messages: [
      { ...sent, id: 'delivered', status: 'entrega_confirmada', serviceConfirmationId: 'delivered',
        acceptedAt: '2026-11-18T02:59:00Z', deliveredAt: '2026-11-18T04:00:00Z' },
    ] },
    { appId: 'visibility', messages: [{ ...sent, serviceConfirmationId: 'unrelated' }] },
  ];

  const result = dailyStatistics(apps, contacts, conversations, 7, new Date('2026-11-18T12:00:00Z'));
  assert.deepEqual(result.dates, [
    '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18',
  ]);
  assert.deepEqual(result.series.map(({ contacts, promotions }) => ({ contacts, promotions })), [
    { contacts: [0, 0, 0, 0, 0, 1, 1], promotions: [0, 0, 0, 0, 0, 0, 1] },
    { contacts: [0, 0, 0, 0, 0, 1, 0], promotions: [0, 0, 0, 0, 0, 1, 0] },
  ]);
});
