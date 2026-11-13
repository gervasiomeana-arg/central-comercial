import type {Contact} from './types.js';
export const whatsappPhone=(value:string)=>String(value||'').replace(/[\s()+.-]/g,'');
export function whatsappAuthorized(contact:Contact,now=new Date()){
 const consent=contact.whatsappConsent;
 return contact.permission==='autorizado'&&contact.status!=='baja_solicitada'&&contact.status!=='descartado'&&Boolean(consent?.granted&&consent.evidence?.trim().length>=5&&Number.isFinite(Date.parse(consent.at))&&Date.parse(consent.at)<=now.getTime())&&/^[1-9]\d{9,14}$/.test(whatsappPhone(contact.phone));
}
