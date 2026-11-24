import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareCampaign } from '../server/campaign-preparation.js';
import type { Application, Campaign, Contact, Conversation } from '../src/types.js';

const now = new Date('2026-11-12T01:00:00Z');
const app = { id: 'voley', name: 'Open Voley', status: 'lista', campaignsAllowed: true, website: 'https://openvoley.com' } as Application;
const campaign = { id: 'campaign', appId: 'voley', status: 'lista', channels: ['email'], country: 'Argentina', language: 'es', segment: 'club', dailyLimit: 2, timezone: 'America/Argentina/Buenos_Aires', startDate: '2026-11-11', endDate: '2026-11-30', messageTemplate: 'Hola {nombre}, presentamos {aplicacion} a {organizacion}. {web}' } as Campaign;
const contact = (id: string, overrides: Partial<Contact> = {}) => ({ id, orgName: `Club ${id}`, contactPerson: 'Ana', orgType: 'club', country: 'Argentina', language: 'es', email: `${id}@club.test`, interestedAppIds: ['voley'], permission: 'autorizado', status: 'prospecto', source: 'https://example.org', sourceReviewDate: '2026-11-01', ...overrides } as Contact);

test('personalizes drafts without mutating contacts, creating send evidence or claiming delivery', () => {
  const contacts = [contact('one')]; const before = JSON.stringify(contacts);
  const result = prepareCampaign(campaign, app, contacts, [], now);
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].messages[0].status, 'preparado');
  assert.equal(result.drafts[0].messages[0].content, 'Hola Ana, presentamos Open Voley a Club one. https://openvoley.com');
  assert.equal(result.drafts[0].messages[0].sentAt, undefined);
  assert.equal(JSON.stringify(contacts), before);
});
test('repeated execution and duplicate email aliases do not create new drafts', () => {
  const contacts = [contact('one'), contact('two', { email: ' ONE@CLUB.TEST ' })];
  const first = prepareCampaign(campaign, app, contacts, [], now);
  assert.equal(first.drafts.length, 1);
  assert.equal(prepareCampaign(campaign, app, contacts, first.drafts, now).drafts.length, 0);
});
test('respects quota by campaign local day including previous drafts', () => {
  const contacts = ['one', 'two', 'three'].map(id => contact(id));
  const previous = prepareCampaign(campaign, app, contacts.slice(0, 1), [], now).drafts;
  assert.equal(prepareCampaign(campaign, app, contacts, previous, now).drafts.length, 1);
  assert.equal(prepareCampaign({ ...campaign, startDate: '2026-11-12' }, app, contacts, [], now).drafts.length, 0);
});
test('excludes revoked, unreviewed, malformed and irrelevant contacts', () => {
  const contacts = [contact('one', { permission: 'revocado' }), contact('two', { source: '' }), contact('three', { country: 'Brasil' }), contact('four', { status: 'baja_solicitada' }), contact('five', { email: 'bad' }), contact('six', { sourceReviewDate: '2027-01-01' }), contact('seven', { language: 'en' }), contact('eight', { orgType: 'agencia' })];
  const result = prepareCampaign(campaign, app, contacts, [], now);
  assert.equal(result.drafts.length, 0);
  assert.equal(Object.values(result.skipped).reduce((a, b) => a + b, 0), 8);
});
test('rejects unknown placeholders, invalid timezone, invalid limits and disabled applications', () => {
  for (const patch of [{ messageTemplate: '{precio_inventado}' }, { timezone: 'Invalid/Zone' }, { dailyLimit: -1 }, { dailyLimit: 0 }, { endDate: '2026-01-01' }]) {
    assert.ok(prepareCampaign({ ...campaign, ...patch }, app, [contact('one')], [], now).blockedReason);
  }
  assert.ok(prepareCampaign(campaign, { ...app, status: 'en_desarrollo' }, [contact('one')], [], now).blockedReason);
  assert.ok(prepareCampaign(campaign, { ...app, campaignsAllowed: false }, [contact('one')], [], now).blockedReason);
});
test('WhatsApp-only campaigns remain untouched; responses stop new outreach', () => {
  assert.equal(prepareCampaign({ ...campaign, channels: ['whatsapp'] }, app, [contact('one')], [], now).drafts.length, 0);
  const conversation = { contactId: 'one', appId: 'voley', messages: [{ direction: 'inbound' }] } as Conversation;
  assert.equal(prepareCampaign(campaign, app, [contact('one')], [conversation], now).drafts.length, 0);
});
test('accepts multiple countries from the existing campaign wizard', () => {
  assert.equal(prepareCampaign({ ...campaign, country: 'Uruguay, Argentina' }, app, [contact('one')], [], now).drafts.length, 1);
});

test('public business outreach must be explicitly enabled and never overrides revocation', () => {
  const publicContact = contact('public', { permission:'desconocido', outreachBasis:'public_business_contact' });
  assert.equal(prepareCampaign(campaign, app, [publicContact], [], now).drafts.length,0);
  assert.equal(prepareCampaign({...campaign,allowPublicEmail:true}, app, [publicContact], [], now).drafts.length,1);
  assert.equal(prepareCampaign({...campaign,allowPublicEmail:true}, app, [{...publicContact,permission:'revocado'}], [], now).drafts.length,0);
});

const whatsappCampaign = {...campaign, channels: ['email', 'whatsapp'], autoSendWhatsApp: true, mode: 'automatico'} as Campaign;
const optIn = { phone: '+54 911 5555-1234', whatsappConsent: { granted: true, evidence: 'Aceptó promociones por WhatsApp', at: '2026-11-01' } };

test('selects WhatsApp when email is unusable, only with recorded permission', () => {
  const allowed = contact('one', {...optIn, email: 'bad'});
  assert.equal(prepareCampaign(whatsappCampaign, app, [allowed], [], now).drafts[0]?.channel, 'whatsapp');
  assert.equal(prepareCampaign(whatsappCampaign, app, [{...allowed, whatsappConsent: undefined}], [], now).drafts.length, 0);
  assert.equal(prepareCampaign(whatsappCampaign, app, [{...allowed, email:'info@club.test'}], [], now).drafts[0]?.channel, 'email');
});

test('replaces definitely bounced email once and never switches on uncertain or refused delivery', () => {
  const lead = contact('one', optIn);
  const original = prepareCampaign(whatsappCampaign, app, [lead], [], now).drafts[0];
  const [email] = original.messages;
  email.attemptedAt = now.toISOString();
  email.status = 'resultado_desconocido';
  assert.equal(prepareCampaign(whatsappCampaign, app, [lead], [original], now).drafts.length, 0);
  email.status = 'fallido'; email.serviceError = '550 5.7.1 Rejected by policy';
  assert.equal(prepareCampaign(whatsappCampaign, app, [lead], [original], now).drafts.length, 0);
  email.serviceError = 'Rebote permanente confirmado: 5.1.1';
  const alternate = prepareCampaign(whatsappCampaign, app, [lead], [original], now);
  assert.equal(alternate.drafts[0]?.channel, 'whatsapp');
  assert.equal(alternate.replacements[0]?.email.id, email.id);
  assert.equal(alternate.replacements[0]?.whatsappId, alternate.drafts[0]?.messages[0].id);
  assert.equal(prepareCampaign(whatsappCampaign, app, [lead], [original, ...alternate.drafts], now).drafts.length, 0);
});

test('prepares beyond the usual daily limit for an uncapped director campaign', () => {
  const director = {...whatsappCampaign, id:'goal-2026-11-voley-argentina', goalMonth:'2026-11', dailyLimit:0};
  const leads = ['one','two','three'].map(id => contact(id));
  assert.equal(prepareCampaign(director, app, leads, [], now).drafts.length, 3);
});

test('channel-specific WhatsApp authorization works independently of the general contact field', () => {
  const lead = contact('one', {...optIn, permission:'desconocido', email:'info@club.test'});
  assert.equal(prepareCampaign(whatsappCampaign, app, [lead], [], now).drafts[0]?.channel, 'whatsapp');
  assert.equal(prepareCampaign(campaign, app, [lead], [], now).drafts.length, 0);
  assert.equal(prepareCampaign(whatsappCampaign, app, [{...lead, permission:'revocado'}], [], now).drafts.length, 0);
  assert.equal(prepareCampaign(whatsappCampaign, app, [{...lead, whatsappConsent:undefined}], [], now).drafts.length, 0);
});

test('la prioridad explícita de WhatsApp cambia un borrador sin intento y conserva el correo de quienes no autorizaron', () => {
  const granted = contact('one', optIn);
  const ungranted = contact('two');
  const emailDraft = prepareCampaign(whatsappCampaign, app, [granted], [], now).drafts[0];
  const priority = {...whatsappCampaign, dailyLimit:3, channels:['whatsapp','email']} as Campaign;
  const selected = prepareCampaign(priority, app, [granted, ungranted], [emailDraft], now);
  assert.deepEqual(selected.drafts.map(d=>d.channel), ['whatsapp','email']);
  assert.equal(selected.replacements[0]?.email.id,emailDraft.messages[0].id);
  emailDraft.messages[0].status='aceptado_proveedor';
  assert.equal(prepareCampaign(priority, app, [granted], [emailDraft], now).drafts.length,0);
});
