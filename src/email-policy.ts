import type {Conversation, Message} from './types.js';

// Syntax is not proof of ownership or publication. This final guard also rejects
// common form examples; legitimate addresses on free-mail domains remain valid.
export function exampleContactEmail(value: unknown): boolean {
 if(typeof value!=='string')return false;
 const email=value.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email))return false;
 const [local,domain]=email.split('@');
 if(/(^|\.)(?:example\.(?:com|org|net)|ejemplo\.(?:com|org|net)|example|invalid|localhost)$/.test(domain))return true;
 const exampleDomain=/^(?:email|correo|domain|dominio|tudominio|yourdomain|tuempresa|empresa|company)\.(?:com|org|net|es)$/;
 const exampleName=/^(?:tu|tucorreo|tuemail|you|your|yourname|nombre|usuario|name|email|correo|test|example|ejemplo)(?:[._+-]?(?:name|email|correo|\d+))?$/;
 return exampleDomain.test(domain)&&exampleName.test(local);
}
export function usableContactEmail(value: unknown): value is string {
 if(typeof value!=='string')return false;
 const email=value.trim().toLowerCase();
 return email.length<=200&&/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)&&!/\.(png|jpg|webp|svg|css|js)$/.test(email)&&!/^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply)@/.test(email)&&!exampleContactEmail(email);
}

export function emailPromotionHold(messages: Message[], now = Date.now()) {
  const windowMs = 60 * 60 * 1000;
  const failureTimes = new Map<string, number>();
  for (const message of messages) {
    if (message.channel !== 'email' || message.direction !== 'outbound' || message.replyToProviderId ||
        message.status !== 'fallido' || !message.emailFailureAt || !message.approvedRecipient) continue;
    const at = Date.parse(message.emailFailureAt);
    if (!Number.isFinite(at) || at > now || at <= now - windowMs) continue;
    const address = message.approvedRecipient.toLowerCase();
    failureTimes.set(address, Math.max(at, failureTimes.get(address) ?? 0));
  }
  const fifth = [...failureTimes.values()].sort((a,b) => b-a)[4];
  return fifth === undefined ? undefined : fifth + windowMs;
}

export function invalidEmailDestination(diagnostic: string, status?: string) {
  return ['5.1.1', '5.1.2', '5.1.3', '5.1.10'].includes(status || '') ||
    /\b5\.1\.(?:1|2|3|10)\b|\bNXDOMAIN\b|\bdomain name not found\b|\bnull MX\b|\b(?:correo|correio) (?:electronico|eletr[oô]nico) indispon[ií]vel\b|\b(?:no such (?:user|person|mailbox)|user unknown|unknown recipient|recipient unknown|(?:user|mailbox|email account) (?:doesn.t|does not) exist|recipient (?:address )?(?:does not exist|not found))\b/i.test(diagnostic);
}


export function isAutomaticNotice(content: string): boolean {
  const text = content.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /(?:fuera|fora) (?:de|do|del|dos) (?:nuestro |nosso )?horario (?:habil|de atencion|de atendimento)|horario de atencion al socio|estamos recibiendo un alto volumen de consultas|estamos recebendo um alto volume de (?:consultas|mensagens)|gracias por comunicar(?:te|se) con .{1,100}(?:en que podemos ayudar|como podemos ayudar|no podemos responder)|te interesa estudiar en .{1,80}pronto te enviaremos la informacion|(?:hemos recibido|recebemos) (?:su|seu|a sua) (?:mensaje|mensagem|contato)|(?:out of office|automatic reply|resposta automatica|respuesta automatica)/.test(text);
}

export function hasOnlyAutomaticReplies(conversation: Conversation): boolean {
  const replies = conversation.messages.filter(message => message.direction === 'inbound');
  return replies.length > 0 && replies.every(message => isAutomaticNotice(message.content));
}

export function isReferralAcknowledgement(content: string): boolean {
  const text = content.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /(?:enviamos|derivamos|remitimos) la informacion al sector correspondiente/.test(text) &&
    /en caso de que les interese/.test(text);
}

export function nonInterestOnlyContacts(conversations: Conversation[]): Set<string> {
  const nonInterest = new Set<string>();
  const other = new Set<string>();
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.direction !== 'inbound') continue;
      (isAutomaticNotice(message.content) || isReferralAcknowledgement(message.content) ? nonInterest : other).add(conversation.contactId);
    }
  }
  for (const contactId of other) nonInterest.delete(contactId);
  return nonInterest;
}
