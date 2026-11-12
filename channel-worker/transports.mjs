export async function sendEmailTest(transport, job, sender) {
  const info = await transport.sendMail({ from: sender, to: job.recipient,
    subject: job.subject, text: job.text, disableFileAccess: true, disableUrlAccess: true });
  const accepted = (info.accepted || []).map(v => String(v).toLowerCase());
  if (!accepted.includes(job.recipient.toLowerCase()) || !/^250\b/.test(String(info.response || ''))) {
    return { state: 'resultado_desconocido', evidence: 'SMTP no confirmó la aceptación del destinatario. No se reenvía automáticamente.' };
  }
  return { state: 'aceptado_servicio', providerId: info.messageId,
    evidence: 'El servidor SMTP respondió 250 y aceptó el destinatario. Esto no confirma lectura.' };
}

export async function sendWhatsAppTest(client, job, timeoutMs = 60000) {
  const chat = await client.getNumberId(job.recipient);
  if (!chat) return { state: 'fallido', evidence: 'WhatsApp no identificó una cuenta activa para el número de prueba.' };
  // Watch before sendMessage: ACK may arrive before its promise resolves.
  const observed = new Map();
  let messageId;
  let finish;
  const confirmation = new Promise(resolve => { finish = resolve; });
  const listener = (message, ack) => {
    const id = message?.id?._serialized;
    if (!id) return;
    observed.set(id, ack);
    if (messageId === id && (ack >= 1 || ack === -1)) finish(ack);
  };
  client.on('message_ack', listener);
  let timer;
  try {
    const message = await client.sendMessage(chat._serialized, job.text);
    messageId = message?.id?._serialized;
    if (!messageId) return { state: 'resultado_desconocido', evidence: 'WhatsApp no devolvió referencia del mensaje.' };
    const initialAck = observed.get(messageId) ?? message.ack;
    const ack = initialAck >= 1 || initialAck === -1 ? initialAck : await Promise.race([
      confirmation, new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })
    ]);
    if (ack === -1) return { state: 'fallido', providerId: messageId, evidence: 'WhatsApp informó un error de envío.' };
    if (ack === null) return { state: 'resultado_desconocido', providerId: messageId,
      evidence: 'Existe ID local, pero no llegó confirmación del servidor. No se declara enviado ni se reenvía.' };
    return { state: 'aceptado_servicio', providerId: messageId,
      evidence: 'WhatsApp confirmó recepción por su servidor (ACK >= 1). No se afirma lectura.' };
  } finally { clearTimeout(timer); client.removeListener('message_ack', listener); }
}
