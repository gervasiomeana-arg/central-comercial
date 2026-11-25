import { campaignCountryAllowed } from './campaign-markets.js';
import {usableContactEmail} from '../src/email-policy.js';
import {campaignStrategyReady, unlimitedCampaignOutreach} from './sales-director.js';
import { randomUUID } from 'node:crypto';
import type { Application, Campaign, Contact, Conversation, Message } from '../src/types.js';
import {whatsappCampaignEligible,whatsappPhone} from '../src/whatsapp-policy.js';

const normalized = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

type PromotionChannel = 'email' | 'whatsapp';

function definitelyRejectedEmail(message: Message) {
  const error = message.serviceError || '';
  return message.status === 'fallido' &&
    (/^Rebote permanente confirmado: 5\.\d{1,3}\.\d{1,3}\b/.test(error) ||
      /^5[0-9]{2}[- ]5\.1\.(?:1|3|10)\b/.test(error));
}

// Preparation only: this module has no transport, credentials or sending capability.
export function prepareCampaign(campaign: Campaign, app: Application | undefined, contacts: Contact[], conversations: Conversation[], now = new Date()) {
  const skipped: Record<string, number> = {};
  const drafts: Conversation[] = [];
  const replacements: { original: Message; replacementId: string }[] = [];
  const moves: { thread: Conversation; message: Message; channel: PromotionChannel }[] = [];
  const result = (blockedReason?: string) => ({ drafts, replacements, moves, skipped, blockedReason });
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  if (!app || app.status !== 'lista' || !app.campaignsAllowed) return result('La aplicación no está habilitada para campañas.');
  if (!campaignCountryAllowed(app, campaign.country)) return result('Campaña fuera del alcance geográfico autorizado.');
  if (['pausada', 'finalizada'].includes(campaign.status)) return result('La campaña está pausada o finalizada.');
  if (!campaign.channels?.some(c=>c==='email'||c==='whatsapp')) return result('Elegí email o WhatsApp.');
  if(!campaignStrategyReady(campaign,app))return result('Esperando una estrategia válida de OpenJarvis.');
  if (!campaign.country?.trim() || !campaign.language?.trim()) return result('Definí un país y un idioma para seleccionar destinatarios.');
  if (!campaign.messageTemplate?.trim()) return result('Falta escribir la nota de promoción.');
  const allowed = new Set(['nombre', 'organizacion', 'cargo', 'pais', 'aplicacion', 'web']);
  const variables = [...campaign.messageTemplate.matchAll(/\{([^{}]+)\}/g)].map(m => m[1]);
  if (variables.some(v => !allowed.has(v))) return result('La plantilla contiene variables desconocidas.');
  let day: string;
  let dates: Intl.DateTimeFormat;
  try {
    dates = new Intl.DateTimeFormat('en-CA', {timeZone:campaign.timezone, year:'numeric', month:'2-digit', day:'2-digit'});
    day = dates.format(now);
  } catch { return result('La zona horaria de la campaña no es válida.'); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(campaign.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(campaign.endDate) || campaign.endDate < campaign.startDate) return result('Revisá las fechas de la campaña.');
  if (day < campaign.startDate || day > campaign.endDate) return result('La campaña está fuera de su período de preparación.');
  const unlimited = unlimitedCampaignOutreach(campaign);
  if (!unlimited && (!Number.isInteger(campaign.dailyLimit) || campaign.dailyLimit < 1 || campaign.dailyLimit > 500)) return result('El límite diario debe estar entre 1 y 500.');
  const previous = conversations.filter(c => c.campaignId === campaign.id);
  const preparedToday = new Set(previous.filter(c => {
    try { return dates.format(new Date(c.createdAt)) === day; } catch { return; }
  }).map(c => c.contactId));
  if(campaign.maxContacts !== undefined && (!Number.isInteger(campaign.maxContacts)||campaign.maxContacts<1||campaign.maxContacts>500))return result('El máximo total de contactos no es válido.');
  const threadsByContact = new Map<string, Conversation[]>();
  const contactMap = new Map(contacts.map(c => [c.id, c]));
  const usedRecipients = new Set<string>();
  for (const thread of previous) {
    const threads = threadsByContact.get(thread.contactId) || [];
    threads.push(thread);
    threadsByContact.set(thread.contactId, threads);
    const contact = contactMap.get(thread.contactId);
    const recipient = thread.channel === 'whatsapp' ? whatsappPhone(contact?.phone || '') : contact?.email?.trim().toLowerCase();
    if (recipient) usedRecipients.add(`${thread.channel}:${recipient}`);
    for (const message of thread.messages) {
      if (message.approvedRecipient) usedRecipients.add(`${message.channel}:${message.approvedRecipient}`);
    }
  }
  const responded = new Set(conversations.filter(c => c.appId === app.id &&
    c.messages.some(m => m.direction === 'inbound')).map(c => c.contactId));
  const countries = campaign.country.split(',').map(normalized);
  const recipientKeyFor = (contact: Contact, channel: PromotionChannel) =>
    channel === 'whatsapp' ? `whatsapp:${whatsappPhone(contact.phone)}` : `email:${contact.email.trim().toLowerCase()}`;
  const prepare = (contact: Contact, channel: PromotionChannel, threads: Conversation[], original?: Message) => {
    const recipientKey = recipientKeyFor(contact, channel);
    if (usedRecipients.has(recipientKey)) { skip('Ya preparado en esta campaña'); return; }
    if (!original && campaign.maxContacts !== undefined && threadsByContact.size >= campaign.maxContacts) {
      skip('Máximo total de contactos alcanzado'); return;
    }
    if (!original && !unlimited && preparedToday.size >= campaign.dailyLimit && !preparedToday.has(contact.id)) {
      skip('Límite diario alcanzado'); return;
    }
    const values: Record<string, string> = { nombre: contact.contactPerson || contact.orgName, organizacion: contact.orgName, cargo: contact.role || '', pais: contact.country, aplicacion: app.name, web: app.website || '' };
    const id = `conv-${randomUUID()}`;
    const timestamp = now.toISOString();
    const messageId = `msg-${randomUUID()}`;
    const draft: Conversation = { id, contactId: contact.id, appId: app.id, campaignId: campaign.id, channel, classification: 'sin_clasificar', requiresHumanIntervention: campaign.mode !== 'automatico', createdAt: timestamp, lastMessageAt: timestamp, messages: [{ id: messageId, conversationId: id, direction: 'outbound', channel, content: campaign.messageTemplate.replace(/\{([^{}]+)\}/g, (_, key) => values[key]), status: 'preparado', createdAt: timestamp }] };
    drafts.push(draft);
    preparedToday.add(contact.id);
    if (original) replacements.push({ original, replacementId: messageId });
    threadsByContact.set(contact.id, [...threads, draft]);
    usedRecipients.add(recipientKey);
  };
  for (const contact of contacts) {
    if (!contact.interestedAppIds?.includes(app.id) || !countries.includes(normalized(contact.country || '')) || normalized(contact.language || '') !== normalized(campaign.language)) { skip('Fuera de aplicación, país o idioma'); continue; }
    if (campaign.segment?.trim() && normalized(contact.orgType || '') !== normalized(campaign.segment)) { skip('Otro segmento'); continue; }
    const whatsappAllowed = campaign.channels.includes('whatsapp') && whatsappCampaignEligible(contact, now);
    const emailAllowed = campaign.channels.includes('email') &&
      (contact.permission === 'autorizado' || (contact.permission === 'desconocido' &&
        campaign.allowPublicEmail === true && contact.outreachBasis === 'public_business_contact'));
    if ((!emailAllowed && !whatsappAllowed) || ['cliente', 'descartado', 'baja_solicitada'].includes(contact.status)) { skip('Sin autorización o fuera de prospección'); continue; }
    const reviewedAt = Date.parse(contact.sourceReviewDate);
    if (!contact.source?.trim() || !Number.isFinite(reviewedAt) || reviewedAt > now.getTime()) { skip('Fuente sin revisar'); continue; }
    if (responded.has(contact.id)) { skip('Ya respondió: revisar conversación'); continue; }
    const email = contact.email?.trim().toLowerCase() || '';
    const emailUsable = emailAllowed && usableContactEmail(email) && contact.undeliverableEmail !== email;
    const threads = threadsByContact.get(contact.id);
    if (!threads) {
      if (whatsappAllowed && (campaign.autoSendWhatsApp !== false || !emailUsable)) prepare(contact, 'whatsapp', []);
      else if (emailUsable) prepare(contact, 'email', []);
      else skip('Sin WhatsApp disponible ni correo utilizable');
      continue;
    }
    const [thread] = threads;
    const [message] = thread.messages;
    if (threads.length === 1 && thread.messages.length === 1 && message.direction === 'outbound' &&
        message.channel === thread.channel && !message.replyToProviderId && !message.replacementMessageId &&
        message.reviewStatus !== 'rejected') {
      const rejectedEmail = definitelyRejectedEmail(message) ||
        (message.status === 'fallido' && Boolean(email) &&
          message.approvedRecipient === email && contact.undeliverableEmail === email);
      if (message.channel === 'email' && whatsappAllowed && campaign.autoSendWhatsApp && rejectedEmail) {
        prepare(contact, 'whatsapp', threads, message);
        continue;
      }
      if (message.channel === 'whatsapp' && emailUsable && campaign.autoSendEmail &&
          message.status === 'fallido' && message.attemptedAt && !message.serviceConfirmationId) {
        prepare(contact, 'email', threads, message);
        continue;
      }
      if (campaign.mode === 'automatico' && !thread.requiresHumanIntervention && !message.reviewStatus &&
          ['preparado', 'pendiente'].includes(message.status) && !message.attemptedAt &&
          !message.sentAt && !message.serviceConfirmationId) {
        const channel = message.channel === 'email' && whatsappAllowed && campaign.autoSendWhatsApp
          ? 'whatsapp' : message.channel === 'whatsapp' && !whatsappAllowed && emailUsable && campaign.autoSendEmail
            ? 'email' : undefined;
        if (channel) {
          const key = recipientKeyFor(contact, channel);
          if (usedRecipients.has(key)) { skip('Ya preparado en esta campaña'); continue; }
          usedRecipients.add(key);
          moves.push({ thread, message, channel });
          continue;
        }
      }
    }
    skip('Ya preparado en esta campaña');
  }

  return result();
}
