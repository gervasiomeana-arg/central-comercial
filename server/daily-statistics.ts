import { accountingDay, validDay } from '../src/ledger.js';
import type { Application, Contact, Conversation, DailyStatistics } from '../src/types.js';

const dayMs = 24 * 60 * 60 * 1000;
const sentStatuses = new Set(['aceptado_proveedor', 'entrega_confirmada', 'enviado']);

function recordedDay(value?: string) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return validDay(value) ? value : undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? accountingDay(new Date(timestamp)) : undefined;
}

export function dailyStatistics(
  applications: Pick<Application, 'id' | 'slug' | 'name'>[],
  contacts: Pick<Contact, 'id' | 'createdAt' | 'interestedAppIds'>[],
  conversations: Pick<Conversation, 'appId' | 'campaignId' | 'messages'>[],
  days: number,
  now = new Date(),
): DailyStatistics {
  const today = Date.parse(accountingDay(now));
  const dates = Array.from({ length: days }, (_, index) =>
    new Date(today - (days - index - 1) * dayMs).toISOString().slice(0, 10));
  const indices = new Map(dates.map((date, index) => [date, index]));
  const series = applications.map(({ id, slug, name }) => ({
    id, slug, name, contacts: dates.map(() => 0), promotions: dates.map(() => 0),
  }));
  const byApp = new Map(series.map(app => [app.id, app]));
  const countedContacts = new Set<string>();

  for (const contact of contacts) {
    const day = recordedDay(contact.createdAt);
    const index = day === undefined ? undefined : indices.get(day);
    if (index === undefined) continue;
    for (const appId of contact.interestedAppIds ?? []) {
      const app = byApp.get(appId);
      const key = JSON.stringify([appId, contact.id]);
      if (!app || countedContacts.has(key)) continue;
      countedContacts.add(key);
      app.contacts[index]++;
    }
  }

  const countedPromotions = new Set<string>();
  for (const conversation of conversations) {
    const app = byApp.get(conversation.appId);
    if (!app || !conversation.campaignId) continue;
    for (const message of conversation.messages) {
      if (message.direction !== 'outbound' || message.replyToProviderId ||
          !sentStatuses.has(message.status) || !message.serviceConfirmationId?.trim()) continue;
      const day = recordedDay(message.acceptedAt ?? message.sentAt ?? message.deliveredAt);
      const index = day === undefined ? undefined : indices.get(day);
      const key = JSON.stringify([message.channel, message.serviceConfirmationId.trim()]);
      if (index === undefined || countedPromotions.has(key)) continue;
      countedPromotions.add(key);
      app.promotions[index]++;
    }
  }

  return { dates, series };
}
