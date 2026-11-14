import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { findConfig, findJarvis, selectedModel } from './config.mjs';
import { installDependencies } from './local-app.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { prepareNative } from './install-native.mjs';
const ramGB = Math.round(os.totalmem() / 1024 ** 3);
console.log('CENTRAL COMERCIAL — Preparación integrada v2 (winget)');
console.log(`Memoria de este equipo: ${ramGB} GB. Procesador: ${os.cpus()[0]?.model || 'sin identificar'}.`);
console.log('No se inicia correo, WhatsApp ni campañas durante esta revisión.');
if (process.platform !== 'win32') throw new Error('Este preparador es para la computadora Windows dedicada. No se instaló nada.');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Actualizar Node.js a 22 o posterior desde https://nodejs.org.');
const config = findConfig(root);
console.log(config ? 'Conexión privada existente: encontrada. No se muestran ni cambian claves.' : 'Conexión privada: pendiente. Usar este paquete en la computadora ya vinculada.');
if (!config) process.exit(1);
console.log('Preparando las dependencias de Central Comercial desde el registro npm.');await installDependencies(root);
let jarvis = findJarvis();
if (jarvis) {
  try {
    const { run, setupEnvironment } = await import('./install-native.mjs');
    await run(jarvis, ['--help'], { env: setupEnvironment(), capture: true });
  } catch { console.log('El motor encontrado no inicia; se preparará una instalación comprobada.'); jarvis = null; }
}
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
  console.log('Se instalarán los requisitos faltantes con winget: Git, uv, Rust y herramientas C++ de Microsoft; uv prepara Python 3.12. Puede aparecer una autorización de Windows.');
  console.log('No se desactivan protecciones de Windows ni se crea un servicio de inicio automático.');
  console.log('Fuente oficial: https://github.com/open-jarvis/OpenJarvis');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('¿Preparar el motor integrado con el gestor de Windows ahora? Escribí SI para continuar: '); prompt.close();
  if (answer.trim().toUpperCase() !== 'SI') { console.log('Instalación pospuesta. Tus conexiones y archivos siguen intactos.'); process.exitCode = 1; }
  else {
    try {
      await prepareNative({ model, needJarvis: !jarvis });
      if (!findJarvis()) throw new Error('El motor terminó de prepararse, pero no se localizó su ejecutable.');
      console.log('\nMotor y modelo comprobados. Cerrá los iniciadores anteriores y abrí INICIAR_CENTRAL_COMERCIAL.bat. El panel verificará los canales reales.');
    } catch (error) {
      console.log(`\nLa preparación no finalizó: ${error.message}`);
      console.log('Se conservaron claves y sesiones. No se modificaron protecciones de Windows. No se activaron campañas.');
      process.exitCode = 1;
    }
  }
} else console.log('\nLa revisión local encontró motor y modelo. Para iniciar, cerrar los iniciadores anteriores y abrir INICIAR_CENTRAL_COMERCIAL.bat.');
