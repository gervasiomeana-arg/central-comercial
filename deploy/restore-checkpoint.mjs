import fs from 'node:fs';
import path from 'node:path';
import { verifyCheckpoint } from '../desktop/reconcile-data.mjs';
import { atomicJSON } from '../desktop/recovery.mjs';

const [source, target] = process.argv.slice(2);
if (!source || !target || !path.isAbsolute(target)) {
  throw new Error('Uso: node deploy/restore-checkpoint.mjs respaldo.json /ruta/absoluta/registros');
}

const checkpoint = JSON.parse(fs.readFileSync(source, 'utf8'));
const database = verifyCheckpoint(checkpoint);
const files = {
  'central_comercial_db.json': database,
  'channel_test_jobs.json': checkpoint.payload.files['channel_test_jobs.json'],
  'openjarvis_plans.json': checkpoint.payload.files['openjarvis_plans.json'],
  'assistant_history.json': checkpoint.payload.files['assistant_history.json'],
};
if (fs.existsSync(target)) throw new Error('Usá un directorio nuevo. No se sobrescribieron registros.');
const staging = fs.mkdtempSync(path.join(path.dirname(target), '.central-restore-'));
try {
  // An interrupted assignment remains a review item. Starting the new service must not resend it.
  for (const { messages } of database.conversations) {
    for (const message of messages || []) {
      if (message.status === 'envio_intentado') {
        message.status = 'resultado_desconocido';
        message.serviceError = 'Traslado a la nube: revisar el intento anterior antes de reenviar.';
      }
    }
  }
  for (const [name, contents] of Object.entries(files)) {
    if (contents !== undefined) atomicJSON(path.join(staging, name), contents);
  }
  fs.renameSync(staging, target);
} catch (error) {
  fs.rmSync(staging, { recursive: true, force: true });
  throw error;
}
console.log('Base y colas restauradas en un directorio nuevo. SHA-256 del original:', checkpoint.sha256);
