import 'dotenv/config';
import fs from 'node:fs';
import { cloudOperationsEnabled } from './execution-role.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const configured = process.env.CENTRAL_DATA_DIR?.trim();
if (configured && !path.isAbsolute(configured)) throw new Error('CENTRAL_DATA_DIR debe ser una carpeta absoluta en almacenamiento persistente.');
export const DATA_DIR = configured || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

if (cloudOperationsEnabled()) {
  if (process.env.REQUIRE_ADMIN_AUTH !== 'true' || (process.env.CHANNEL_TEST_WORKER_KEY?.length ?? 0) < 32) {
    throw new Error('La operación en la nube requiere autenticación administrativa y una clave privada de ejecutor.');
  }
  if (!configured || !fs.existsSync(path.join(configured, 'central_comercial_db.json'))) {
    throw new Error('Restaurá primero la base comercial en el volumen persistente. No se creó una base vacía.');
  }
}
