import type {Contact} from './types.js';
export const campaignWhatsAppPaused = true;

export const whatsappPhone=(value:string)=>String(value||'').replace(/[\s()+.-]/g,'');
export function whatsappAuthorized(contact:Contact,now=new Date()){
 const consent=contact.whatsappConsent;
 return (contact.permission==='autorizado'||contact.permission==='desconocido')&&contact.status!=='baja_solicitada'&&contact.status!=='descartado'&&Boolean(consent?.granted===true&&consent.evidence?.trim().length>=5&&Number.isFinite(Date.parse(consent.at))&&Date.parse(consent.at)<=now.getTime())&&/^[1-9]\d{9,14}$/.test(whatsappPhone(contact.phone));
}


export function whatsappCampaignEligible(contact: Contact, now = new Date()) {
 const number = whatsappPhone(contact.phone);
 if (contact.status === 'baja_solicitada' || contact.status === 'descartado' ||
     contact.permission === 'revocado' || contact.whatsappConsent?.granted === false ||
     !/^[1-9]\d{9,14}$/.test(number)) return false;
 if (whatsappAuthorized(contact, now)) return true;
 const reviewedAt = Date.parse(contact.sourceReviewDate);
 if (!Number.isFinite(reviewedAt) || reviewedAt > now.getTime()) return false;
 if (contact.publishedWhatsApp) return contact.publishedWhatsApp.number === number;
 // Earlier research saved institutional WhatsApp links in the contact notes or history.
 return (contact.outreachBasis === 'public_business_contact' && contact.role === 'Contacto institucional público' &&
   /^https?:\/\//i.test(contact.source) && contact.notes?.includes('WhatsApp solo se registra, sin enviar.')) ||
   Boolean(contact.history?.some(item => item.description.startsWith('Enlace institucional de WhatsApp verificado en ')));
}
