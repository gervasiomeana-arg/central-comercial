import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const configured = process.env.CENTRAL_DATA_DIR?.trim();
if (configured && !path.isAbsolute(configured)) throw new Error('CENTRAL_DATA_DIR debe ser una carpeta absoluta en almacenamiento persistente.');
export const DATA_DIR = configured || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
