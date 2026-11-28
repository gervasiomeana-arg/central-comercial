import type { Contact } from '../src/types.js';
import { normalize } from './campaign-markets.js';

const governmentDomain = /(?:^|\.)(?:gov|gob|gouv|govt|gub|mil)(?:\.[a-z]{2,3})?\.?$/i;
const governmentIdentity = /\b(?:gobernacion|gobierno (?:del?|estatal|municipal|provincial|regional|nacional)|ayuntamiento|alcaldia|municipalidad|minist[ée]rio|gobierno federal|governo (?:federal|estadual|municipal)|prefeitura|oficina (?:de )?recaudacion|recaudacion tributaria|administracion tributaria|agencia tributaria|secretaria de (?:hacienda|finanzas|educacion)|government (?:of|department|office)|ministry of|tax (?:office|authority|administration|collection)|collectivite territoriale|ministere de)\b/;

export function isGovernmentAudience({ urls = [], email, names = [] }: {
  urls?: string[]; email?: string; names?: string[];
}) {
  if (governmentDomain.test(email?.split('@').pop() || '')) return true;
  if (names.some(name => governmentIdentity.test(normalize(name)))) return true;
  return urls.some(value => {
    if (!value) return false;
    try { return governmentDomain.test(new URL(value.includes('://') ? value : `https://${value}`).hostname); }
    catch { return false; }
  });
}

export function governmentCampaignContact(contact: Contact, email = contact.email) {
  return isGovernmentAudience({
    urls: [contact.website, contact.source, contact.publishedWhatsApp?.source ?? ''],
    names: [contact.orgName, contact.orgType],
    email,
  });
}
