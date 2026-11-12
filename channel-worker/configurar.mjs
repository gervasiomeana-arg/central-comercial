import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import dotenv from 'dotenv';

const dir = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(dir, '.env');
const config = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
if ((config.CHANNEL_TEST_WORKER_KEY || '').length >= 32 && config.SMTP_APP_PASSWORD) process.exit(0);
if (!process.stdin.isTTY) throw new Error('Abra iniciar-windows.bat en su computadora para completar la configuración.');
let muted = false;
const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
const save = () => {
  const text = Object.entries(config).map(([key, value]) => key + '=' + JSON.stringify(value)).join('\n') + '\n';
  fs.writeFileSync(file, text, { mode: 0o600 });
};
try {
  config.CENTRAL_URL ||= 'https://central-comercial.ai.studio';
  config.ENABLE_WHATSAPP ||= 'true';
  if ((config.CHANNEL_TEST_WORKER_KEY || '').length < 32) {
    config.CHANNEL_TEST_WORKER_KEY = crypto.randomBytes(32).toString('hex');
    save();
    let copied = false;
    if (process.platform === 'win32') {
      const clip = spawnSync('clip', [], { input: config.CHANNEL_TEST_WORKER_KEY, windowsHide: true });
      copied = clip.status === 0;
    }
    console.log('\nSe generó la clave privada de conexión y se guardó solamente en esta computadora.');
    console.log(copied ? 'La clave ya está copiada al portapapeles.' : 'Abra el archivo local .env y copie el valor de CHANNEL_TEST_WORKER_KEY.');
    console.log('En AI Studio > Secrets, agregue CHANNEL_TEST_WORKER_KEY y pegue el valor. Aplique los cambios y publique.');
    await prompt.question('Cuando termine, presione Enter aquí. ');
  }
  if (!config.SMTP_APP_PASSWORD) {
    console.log('\nCorreo de prueba: gervasiomeana@gmail.com');
    console.log('Use una contraseña DE APLICACIÓN de Google (16 caracteres). No use su contraseña habitual.');
    console.log('Puede crearla en https://myaccount.google.com/apppasswords si su cuenta lo permite.');
    process.stdout.write('Contraseña de aplicación (no se mostrará; Enter para omitir correo): ');
    muted = true;
    const password = (await prompt.question('')).replace(/\s/g, '');
    muted = false; process.stdout.write('\n');
    if (password && !/^[A-Za-z0-9]{16}$/.test(password)) throw new Error('La contraseña de aplicación debe tener 16 caracteres. Vuelva a iniciar el archivo.');
    config.SMTP_APP_PASSWORD = password;
  }
  save();
  console.log('Configuración guardada. A continuación aparecerá el QR de WhatsApp.');
} finally { muted = false; prompt.close(); }
