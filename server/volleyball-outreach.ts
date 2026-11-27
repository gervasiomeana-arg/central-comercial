import type { Application, Contact } from '../src/types.js';
import { normalize } from './campaign-markets.js';

const sport = /\b(?:voley|voleibol|volei|volley(?:ball|bal)?|volleyballtrainer|volleybal(?:club|bond|school))\b/;
const institution = /\b(?:club(?:e)?|federacion|federacao|federation|asociacion|associacao|association|escuela|escola|school|ecole|academia|academy|academie|equipo|equipe|team|liga|league|ligue|volleybal(?:club|bond|school))\b/;
const coach = /\b(?:entrenador(?:a)?|director(?:a)? tecnico|tecnico|treinador(?:a)?|coach|entraineur|entraineuse|volleyballtrainer)\b/;
const editorialHeadline = /\b(?:sera sede|albergara|will host|vence a|gana el|campeonato comienza|se disputara)\b/;
const press = /\b(?:radio\s+(?:nacional|oficial)|emisora|periodico|portal de noticias|sala de prensa|agencia de noticias)\b/;
const newsPath = /\/(?:noticias?|news|actualidad|prensa|articles?|articulos?|deportes\/noticias)(?:\/|$)/;

export function isOpenVoley(app: Application) {
  return app.slug === 'open-voley';
}

export function volleyballMediaDomain(domain: string) {
  return /(?:^|\.)radionacional\.co$/i.test(domain);
}

export function volleyballMediaPage(url: URL) {
  return volleyballMediaDomain(url.hostname) || newsPath.test(normalize(url.pathname));
}

export function volleyballProfile(heading: string, title: string, url: URL, editorial: boolean) {
  const identity = normalize(heading);
  if (editorial || volleyballMediaPage(url) || press.test(normalize(title)) || editorialHeadline.test(identity)) return undefined;
  if (!sport.test(identity)) return undefined;
  if (coach.test(identity) && !institution.test(identity)) return 'coach';
  if (institution.test(identity) || /\/(?:voley|volleyball|voleibol|volei)\/?$/i.test(url.pathname)) return 'organization';
  return undefined;
}

export function volleyballRecipientAllowed(app: Application, contact: Contact, recipient = contact.email) {
  if (!isOpenVoley(app)) return true;
  if (volleyballMediaDomain(recipient?.split('@').pop() || '')) return false;
  if (!contact.volleyballSource) return false;
  try {
    const site = new URL(contact.website);
    const proof = new URL(contact.volleyballSource);
    return proof.protocol === 'https:' && !volleyballMediaPage(proof) &&
      proof.hostname.replace(/^www\./, '') === site.hostname.replace(/^www\./, '');
  } catch { return false; }
}
