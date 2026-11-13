import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findConfig } from './config.mjs';
import { copyCode } from './package-code.mjs';
import { installDependencies } from './local-app.mjs';
if (process.platform !== 'win32') throw new Error('Configurar únicamente en la computadora Windows dedicada.');
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const startup = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Central Comercial.cmd');
if (process.argv.includes('--disable')) {
  fs.rmSync(startup, { force: true }); console.log('Inicio automático desactivado. Las conexiones y datos se conservan.');
} else {
  const config = findConfig(source);
  if (!config) throw new Error('No se encontró la conexión de la computadora dedicada. No se activó el inicio automático.');
  const runtimeDir = path.join(process.env.LOCALAPPDATA, 'CentralComercial', 'runtime');fs.mkdirSync(runtimeDir,{recursive:true});fs.writeFileSync(path.join(runtimeDir,'config-path.txt'),config.file,{mode:0o600});
  const target = path.join(process.env.LOCALAPPDATA, 'CentralComercial', 'App');
  copyCode(source,target);await installDependencies(target);
  fs.mkdirSync(path.dirname(startup), { recursive: true });
  const quote = value => '"' + value.replace(/%/g, '%%') + '"';
  fs.writeFileSync(startup, '@echo off\r\n' + quote(process.execPath) + ' ' + quote(path.join(target, 'desktop', 'watchdog.mjs')) + ' --login\r\n');
  console.log('Inicio automático configurado para este usuario. Central Comercial arrancará después de iniciar sesión en Windows.');
  console.log('No se cambió el inicio de sesión ni se almacenó la contraseña de Windows.');
}
