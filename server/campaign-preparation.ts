import { campaignCountryAllowed } from './campaign-markets.js';
import {usableContactEmail} from '../src/email-policy.js';
import {campaignStrategyReady, unlimitedCampaignOutreach} from './sales-director.js';
import { randomUUID } from 'node:crypto';
import type { Application, Campaign, Contact, Conversation, Message } from '../src/types.js';
import {whatsappAuthorized,whatsappPhone} from '../src/whatsapp-policy.js';

const normalized = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function definitelyRejectedEmail(message: Message) {
  const error = message.serviceError || '';
  return message.status === 'fallido' &&
    (/^Rebote permanente confirmado: 5\.(?:1|2)\.\d+\b/.test(error) ||
      /^5[0-9]{2}[- ]5\.1\.(?:1|3|10)\b/.test(error));
}

// Preparation only: this module has no transport, credentials or sending capability.
export function prepareCampaign(campaign: Campaign, app: Application | undefined, contacts: Contact[], conversations: Conversation[], now = new Date()) {
  const skipped: Record<string, number> = {};
  const drafts: Conversation[] = [];
  const replacements: { email: Message; whatsappId: string }[] = [];
  const result = (blockedReason?: string) => ({ drafts, replacements, skipped, blockedReason });
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
  const alreadyToday = previous.filter(c => {
    try { return dates.format(new Date(c.createdAt)) === day; } catch { return false; }
  }).length;
  if(campaign.maxContacts !== undefined && (!Number.isInteger(campaign.maxContacts)||campaign.maxContacts<1||campaign.maxContacts>500))return result('El máximo total de contactos no es válido.');
  const remaining = unlimited ? Infinity : Math.max(0, campaign.dailyLimit - alreadyToday);
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
  for (const contact of contacts) {
    if (!contact.interestedAppIds?.includes(app.id) || !countries.includes(normalized(contact.country || '')) || normalized(contact.language || '') !== normalized(campaign.language)) { skip('Fuera de aplicación, país o idioma'); continue; }
    if (campaign.segment?.trim() && normalized(contact.orgType || '') !== normalized(campaign.segment)) { skip('Otro segmento'); continue; }
    const whatsappAllowed = campaign.channels.includes('whatsapp') && whatsappAuthorized(contact, now);
    const whatsappFirst = campaign.channels[0] === 'whatsapp' && campaign.autoSendWhatsApp === true;
    const emailAllowed = campaign.channels.includes('email') &&
      (contact.permission === 'autorizado' || (contact.permission === 'desconocido' &&
        campaign.allowPublicEmail === true && contact.outreachBasis === 'public_business_contact'));
    if ((!emailAllowed && !whatsappAllowed) || ['cliente', 'descartado', 'baja_solicitada'].includes(contact.status)) { skip('Sin autorización o fuera de prospección'); continue; }
    const reviewedAt = Date.parse(contact.sourceReviewDate);
    if (!contact.source?.trim() || !Number.isFinite(reviewedAt) || reviewedAt > now.getTime()) { skip('Fuente sin revisar'); continue; }
    if (responded.has(contact.id)) { skip('Ya respondió: revisar conversación'); continue; }
    const email = contact.email?.trim().toLowerCase() || '';
    const emailUsable = emailAllowed && usableContactEmail(email) && contact.undeliverableEmail !== email;
    const threads = threadsByContact.get(contact.id) || [];
    let replacedEmail: Message | undefined;
    if (threads.length) {
      const first = threads[0];
      if (threads.length === 1 && first.channel === 'email' && first.messages.length === 1 &&
          !first.requiresHumanIntervention && whatsappAllowed && campaign.autoSendWhatsApp) {
        const message = first.messages[0];
        const invalidAddress = !usableContactEmail(email) || contact.undeliverableEmail === email;
        const unsent = ['preparado', 'pendiente'].includes(message.status) &&
          !message.attemptedAt && !message.serviceConfirmationId;
        if (message.direction === 'outbound' && message.channel === 'email' &&
            !message.replyToProviderId && !message.replacementMessageId && message.reviewStatus !== 'rejected' &&
            (definitelyRejectedEmail(message) || (whatsappFirst && unsent && message.reviewStatus !== 'approved') ||
              (invalidAddress && (unsent ||
              (message.status === 'fallido' && message.approvedRecipient === email))))) replacedEmail = message;
      }
      if (!replacedEmail) { skip('Ya preparado en esta campaña'); continue; }
    }
    const channel = whatsappAllowed && (replacedEmail || whatsappFirst || contact.preferredChannel === 'whatsapp' || !emailUsable)
      ? 'whatsapp' : emailUsable ? 'email' : undefined;
    if (!channel) { skip('Sin correo utilizable ni WhatsApp autorizado'); continue; }
    const recipient = channel === 'whatsapp' ? whatsappPhone(contact.phone) : email;
    const recipientKey = `${channel}:${recipient}`;
    if (usedRecipients.has(recipientKey)) { skip('Ya preparado en esta campaña'); continue; }
    if (!replacedEmail && campaign.maxContacts !== undefined && threadsByContact.size >= campaign.maxContacts) {
      skip('Máximo total de contactos alcanzado'); continue;
    }
    if (drafts.length >= remaining) { skip('Límite diario alcanzado'); continue; }
    const values: Record<string, string> = { nombre: contact.contactPerson || contact.orgName, organizacion: contact.orgName, cargo: contact.role || '', pais: contact.country, aplicacion: app.name, web: app.website || '' };
    const id = `conv-${randomUUID()}`;
    const timestamp = now.toISOString();
    const messageId = `msg-${randomUUID()}`;
    const draft: Conversation = { id, contactId: contact.id, appId: app.id, campaignId: campaign.id, channel, classification: 'sin_clasificar', requiresHumanIntervention: campaign.mode !== 'automatico', createdAt: timestamp, lastMessageAt: timestamp, messages: [{ id: messageId, conversationId: id, direction: 'outbound', channel, content: campaign.messageTemplate.replace(/\{([^{}]+)\}/g, (_, key) => values[key]), status: 'preparado', createdAt: timestamp }] };
    drafts.push(draft);
    if (replacedEmail) replacements.push({ email: replacedEmail, whatsappId: messageId });
    threadsByContact.set(contact.id, [...threads, draft]);
    usedRecipients.add(recipientKey);
  }
  return result();
}
