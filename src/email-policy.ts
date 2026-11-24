import type {Message} from './types.js';

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
