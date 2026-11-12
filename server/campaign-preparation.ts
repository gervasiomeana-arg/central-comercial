import { randomUUID } from 'node:crypto';
import type { Application, Campaign, Contact, Conversation } from '../src/types.js';

const normalized = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const localDay = (date: Date, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

// Preparation only: this module has no transport, credentials or sending capability.
export function prepareCampaign(campaign: Campaign, app: Application | undefined, contacts: Contact[], conversations: Conversation[], now = new Date()) {
  const skipped: Record<string, number> = {};
  const drafts: Conversation[] = [];
  const result = (blockedReason?: string) => ({ drafts, skipped, blockedReason });
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  if (!app || app.status !== 'lista' || !app.campaignsAllowed) return result('La aplicación no está habilitada para campañas.');
  if (['pausada', 'finalizada'].includes(campaign.status)) return result('La campaña está pausada o finalizada.');
  if (!campaign.channels?.includes('email')) return result('Esta etapa prepara únicamente correos. WhatsApp permanece pendiente.');
  if (!campaign.country?.trim() || !campaign.language?.trim()) return result('Definí un país y un idioma para seleccionar destinatarios.');
  if (!campaign.messageTemplate?.trim()) return result('Falta escribir la nota de promoción.');
  const allowed = new Set(['nombre', 'organizacion', 'cargo', 'pais', 'aplicacion', 'web']);
  const variables = [...campaign.messageTemplate.matchAll(/\{([^{}]+)\}/g)].map(m => m[1]);
  if (variables.some(v => !allowed.has(v))) return result('La plantilla contiene variables desconocidas.');
  let day: string;
  try { day = localDay(now, campaign.timezone); } catch { return result('La zona horaria de la campaña no es válida.'); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(campaign.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(campaign.endDate) || campaign.endDate < campaign.startDate) return result('Revisá las fechas de la campaña.');
  if (day < campaign.startDate || day > campaign.endDate) return result('La campaña está fuera de su período de preparación.');
  if (!Number.isInteger(campaign.dailyLimit) || campaign.dailyLimit < 1 || campaign.dailyLimit > 500) return result('El límite diario debe estar entre 1 y 500.');
  const previous = conversations.filter(c => c.campaignId === campaign.id);
  const alreadyToday = previous.filter(c => {
    try { return localDay(new Date(c.createdAt), campaign.timezone) === day; } catch { return false; }
  }).length;
  const remaining = Math.max(0, campaign.dailyLimit - alreadyToday);
  const usedIds = new Set(previous.map(c => c.contactId));
  const contactMap = new Map(contacts.map(c => [c.id, c]));
  const usedEmails = new Set(previous.map(c => contactMap.get(c.contactId)?.email?.trim().toLowerCase()).filter(Boolean));
  for (const contact of contacts) {
    const countries = campaign.country.split(',').map(normalized);
    if (!contact.interestedAppIds?.includes(app.id) || !countries.includes(normalized(contact.country || '')) || normalized(contact.language || '') !== normalized(campaign.language)) { skip('Fuera de aplicación, país o idioma'); continue; }
    if (campaign.segment?.trim() && normalized(contact.orgType || '') !== normalized(campaign.segment)) { skip('Otro segmento'); continue; }
    if (!(contact.permission === 'autorizado' || (contact.permission === 'desconocido' && campaign.allowPublicEmail === true && contact.outreachBasis === 'public_business_contact')) || ['cliente', 'descartado', 'baja_solicitada'].includes(contact.status)) { skip('Sin autorización o fuera de prospección'); continue; }
    const reviewedAt = Date.parse(contact.sourceReviewDate);
    if (!contact.source?.trim() || !Number.isFinite(reviewedAt) || reviewedAt > now.getTime()) { skip('Fuente sin revisar'); continue; }
    const email = contact.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skip('Correo no válido'); continue; }
    if (usedIds.has(contact.id) || usedEmails.has(email)) { skip('Ya preparado en esta campaña'); continue; }
    if (conversations.some(c => c.contactId === contact.id && c.appId === app.id && c.messages.some(m => m.direction === 'inbound'))) { skip('Ya respondió: revisar conversación'); continue; }
    if (drafts.length >= remaining) { skip('Límite diario alcanzado'); continue; }
    const values: Record<string, string> = { nombre: contact.contactPerson || contact.orgName, organizacion: contact.orgName, cargo: contact.role || '', pais: contact.country, aplicacion: app.name, web: app.website || '' };
    const id = `conv-${randomUUID()}`;
    const timestamp = now.toISOString();
    drafts.push({ id, contactId: contact.id, appId: app.id, campaignId: campaign.id, channel: 'email', classification: 'sin_clasificar', requiresHumanIntervention: true, createdAt: timestamp, lastMessageAt: timestamp, messages: [{ id: `msg-${randomUUID()}`, conversationId: id, direction: 'outbound', channel: 'email', content: campaign.messageTemplate.replace(/\{([^{}]+)\}/g, (_, key) => values[key]), status: 'preparado', createdAt: timestamp }] });
    usedIds.add(contact.id); usedEmails.add(email);
  }
  return result();
}
