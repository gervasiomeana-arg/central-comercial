import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import nodemailer from 'nodemailer';
import { sendEmailTest, sendWhatsAppTest } from './transports.mjs';
const job = { recipient: 'owner@example.test', subject: 'Test', text: 'Local transport test' };
test('SMTP does not accept a local message ID as confirmation', async () => {
  const result = await sendEmailTest({ sendMail: async () => ({ messageId: 'local-id', accepted: [] }) }, job, job.recipient);
  assert.equal(result.state, 'resultado_desconocido');
});
test('SMTP real socket exchange with local fixture yields server confirmation', async (t) => {
  const server = net.createServer(socket => {
    socket.write('220 localhost ESMTP\r\n'); let input = '', data = false;
    socket.on('data', chunk => {
      input += chunk.toString();
      while (input.includes('\r\n')) {
        const pos = input.indexOf('\r\n'), line = input.slice(0, pos); input = input.slice(pos + 2);
        if (data) { if (line === '.') { data = false; socket.write('250 accepted-local-test\r\n'); } continue; }
        if (/^EHLO/.test(line)) socket.write('250-localhost\r\n250 OK\r\n');
        else if (/^DATA/.test(line)) { data = true; socket.write('354 End with dot\r\n'); }
        else if (/^QUIT/.test(line)) socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  } catch (error) {
    if (error.code === 'EPERM') { t.skip('El entorno no permite abrir sockets locales.'); return; }
    throw error;
  }
  const transport = nodemailer.createTransport({ host: '127.0.0.1', port: server.address().port, secure: false, ignoreTLS: true });
  try { const result = await sendEmailTest(transport, job, job.recipient); assert.equal(result.state, 'aceptado_servicio'); assert.ok(result.providerId); }
  finally { transport.close(); await new Promise(resolve => server.close(resolve)); }
});
class WA extends EventEmitter {
  async getNumberId() { return { _serialized: 'test@c.us' }; }
  async sendMessage() { return { id: { _serialized: 'local-id' }, ack: 0 }; }
}
test('WhatsApp ID without server ACK is unknown', async () => {
  const wa = new WA(); const result = await sendWhatsAppTest(wa, job, 10);
  assert.equal(result.state, 'resultado_desconocido'); assert.equal(wa.listenerCount('message_ack'), 0);
});
test('WhatsApp confirmation arriving during send is retained', async () => {
  const wa = new WA(); wa.sendMessage = async () => { const m = { id: { _serialized: 'server-ack-id' }, ack: 0 }; wa.emit('message_ack', m, 1); return m; };
  assert.equal((await sendWhatsAppTest(wa, job, 10)).state, 'aceptado_servicio');
});
test('WhatsApp error ACK is not reported as success', async () => {
  const wa = new WA(); wa.sendMessage = async () => ({ id: { _serialized: 'id' }, ack: -1 });
  assert.equal((await sendWhatsAppTest(wa, job, 10)).state, 'fallido');
});
