import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { findConfig, findJarvis, executable, jarvisEnvironment, selectedModel } from './config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_INSTALLER = 'https://raw.githubusercontent.com/open-jarvis/OpenJarvis/afdbd5b35cb21f51564588c8cdbf6b74889c4f1f/deploy/windows/install.ps1';
const INSTALLER_HASH = '2d0089611ae9d62cb03b87197a7e9d7168505c48d05b41f343302f885741f433';
const ramGB = Math.round(os.totalmem() / 1024 ** 3);
const local = process.env.LOCALAPPDATA;
console.log('CENTRAL COMERCIAL — Preparación del inicio único');
console.log(`Memoria de este equipo: ${ramGB} GB. Procesador: ${os.cpus()[0]?.model || 'sin identificar'}.`);
console.log('No se inicia correo, WhatsApp ni campañas durante esta revisión.');
if (process.platform !== 'win32') throw new Error('Este preparador es para la computadora Windows dedicada. No se instaló nada.');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Actualizar Node.js a 22 o posterior desde https://nodejs.org.');
const config = findConfig(root);
console.log(config ? 'Conexión privada existente: encontrada. No se muestran ni cambian claves.' : 'Conexión privada: pendiente. Usar este paquete en la computadora ya vinculada.');
if (!config) process.exit(1);
const jarvis = findJarvis();
console.log(jarvis ? 'Motor OpenJarvis: instalado.' : 'Motor OpenJarvis: pendiente de instalación inicial.');
let model = selectedModel(ramGB, process.env.OPENJARVIS_MODEL), modelReady = false;
try {
  const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000), redirect: 'error' });
  if (!response.ok) throw new Error();
  const tags = await response.json();
  if (!process.env.OPENJARVIS_MODEL && !tags.models?.some(m => m.name === model) && tags.models?.some(m => m.name === 'qwen3.5:2b')) model = 'qwen3.5:2b';
  modelReady = Boolean(tags.models?.some(m => m.name === model || m.model === model));
  console.log(modelReady ? `Modelo local disponible: ${model}.` : `Ollama está disponible; falta el modelo elegido: ${model}.`);
} catch { console.log('Ollama o su modelo: pendientes de comprobar.'); }
if (ramGB < 6) {
  console.log('Este equipo no alcanza el mínimo elegido para iniciar automáticamente IA local. No se descargó ni instaló nada.');
  process.exitCode = 1;
} else if (!jarvis || !modelReady) {
  console.log('\nLa preparación inicial requiere descargar software y un modelo local. No tiene una tarifa de suscripción; puede requerir varios GB y tiempo de instalación.');
  console.log('El instalador oficial puede requerir Python, Git, uv y herramientas de compilación de Microsoft. Si falta algún requisito, se mostrará el motivo.');
  console.log('No se desactivan protecciones de Windows ni se crea un servicio de inicio automático.');
  console.log('Fuente oficial: https://github.com/open-jarvis/OpenJarvis');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('¿Preparar OpenJarvis con el instalador oficial ahora? Escribí SI para continuar: '); prompt.close();
  if (answer.trim().toUpperCase() !== 'SI') { console.log('Instalación pospuesta. Tus conexiones y archivos siguen intactos.'); process.exitCode = 1; }
  else {
    const staging = path.join(local, 'CentralComercial', 'setup'); fs.mkdirSync(staging, { recursive: true });
    const response = await fetch(VENDOR_INSTALLER, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('No se pudo obtener el instalador oficial. No se ejecutó ningún archivo.');
    const content = (await response.text()).replace(/\r\n/g, '\n').trimEnd() + '\n';
    if (createHash('sha256').update(content).digest('hex') !== INSTALLER_HASH) throw new Error('El instalador no coincide con la versión revisada. No se ejecutó.');
    const script = path.join(staging, 'openjarvis-install.ps1'); fs.writeFileSync(script, content, { mode: 0o600 });
    const env = { ...jarvisEnvironment(path.join(local, 'OpenJarvis')), OPENJARVIS_SKIP_SERVICE: '1' };
    const exit = await new Promise(resolve => {
      const child = spawn('powershell.exe', ['-NoProfile', '-File', script, '-SkipService'], { stdio: 'inherit', env, windowsHide: false });
      child.once('error', () => resolve(-1)); child.once('exit', code => resolve(code));
    });
    if (exit !== 0) {
      console.log('\nLa instalación no finalizó. Conservar el mensaje mostrado. No se cambió la política de ejecución ni se intentó eludir un bloqueo de Windows.');
      process.exitCode = 1;
    } else if (!findJarvis()) {
      console.log('El instalador terminó, pero no se pudo localizar el motor. Revisar la instalación antes de iniciar.'); process.exitCode = 1;
    } else console.log('\nMotor localizado. Cerrá los iniciadores anteriores y abrí INICIAR_CENTRAL_COMERCIAL.bat. El panel verificará la conexión real.');
  }
} else console.log('\nLa revisión local encontró motor y modelo. Para iniciar, cerrar los iniciadores anteriores y abrir INICIAR_CENTRAL_COMERCIAL.bat.');
