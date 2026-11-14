// Syntax is not proof of ownership or publication. This final guard also rejects
// common form examples; legitimate addresses on free-mail domains remain valid.
export function usableContactEmail(value: unknown): value is string {
 if(typeof value!=='string')return false;
 const email=value.trim().toLowerCase();
 if(email.length>200||!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)||/\.(png|jpg|webp|svg|css|js)$/.test(email))return false;
 const [local,domain]=email.split('@');
 if(/^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply)$/.test(local))return false;
 if(/(^|\.)(?:example\.(?:com|org|net)|ejemplo\.(?:com|org|net)|example|invalid|localhost)$/.test(domain))return false;
 const exampleDomain=/^(?:email|correo|domain|dominio|tudominio|yourdomain|tuempresa|empresa|company)\.(?:com|org|net|es)$/;
 const exampleName=/^(?:tu|tucorreo|tuemail|you|your|yourname|nombre|usuario|name|email|correo|test|example|ejemplo)(?:[._+-]?(?:name|email|correo|\d+))?$/;
 return !(exampleDomain.test(domain)&&exampleName.test(local));
}
