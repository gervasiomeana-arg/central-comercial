import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { executable, jarvisEnvironment } from './config.mjs';

// Standard package-manager installation, not execution of the blocked vendor script.
// No execution-policy changes, inline PowerShell, browser-warning changes or services.
export const OPENJARVIS_REVISION = 'afdbd5b35cb21f51564588c8cdbf6b74889c4f1f';
export const PACKAGES = Object.freeze({git: 'Git.Git', uv: 'astral-sh.uv', rust: 'Rustlang.Rustup',
  msvc: 'Microsoft.VisualStudio.2022.BuildTools', ollama: 'Ollama.Ollama'});

export function run(exe, args, { env = process.env, cwd, capture = false, verbatim = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { env, cwd, shell: false, windowsHide: false, windowsVerbatimArguments: verbatim,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '';
    if (capture) {
      child.stdout.on('data', b => { output = (output + b).slice(-100000); });
      child.stderr.on('data', b => { output = (output + b).slice(-100000); });
    }
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(
      `${path.basename(exe)} terminó con código ${code}. ${capture ? output.slice(-2000) : 'Revisar el mensaje de Windows de arriba.'}`)));
  });
}

export function nativePaths(env = process.env) {
  return [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'cmd'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Git', 'cmd'),
    env.USERPROFILE && path.join(env.USERPROFILE, '.local', 'bin'),
    env.USERPROFILE && path.join(env.USERPROFILE, '.cargo', 'bin'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Ollama')].filter(Boolean);
}
export function setupEnvironment(env = process.env) {
  const safe = jarvisEnvironment(path.join(env.LOCALAPPDATA, 'CentralComercial', 'runtime', 'intelligence'), env);
  for (const key of ['ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'CommonProgramFiles', 'CommonProgramFiles(x86)', 'ProgramData', 'ALLUSERSPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']) if (env[key]) safe[key] = env[key];
  const result = { ...safe, PATH: [...nativePaths(env), env.PATH || env.Path || ''].join(path.delimiter),
    RUSTUP_TOOLCHAIN: 'stable', OLLAMA_HOST: '127.0.0.1:11434',
    UV_NO_PROGRESS: '1', UV_PYTHON_DOWNLOADS: 'automatic' };
  delete result.Path;
  return result;
}
export function wingetArguments(id, msvc = false) {
  if (!Object.values(PACKAGES).includes(id)) throw new Error('Paquete no permitido.');
  return ['install', '--exact', '--id', id, '--source', 'winget', ...(msvc ? ['--override',
    '--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'] : [])];
}
async function has(command, env) {
  const exe = executable(command, env);
  if (!exe) return null;
  try { await run(exe, ['--version'], { env, capture: true }); return exe; } catch { return null; }
}
async function ensure(command, id, env) {
  const found = await has(command, env);
  if (found) return found;
  const winget = executable('winget', env);
  if (!winget) throw new Error('Falta el Instalador de aplicaciones de Microsoft (winget). No se descargó un reemplazo ni se cambiaron protecciones.');
  console.log(`Instalando ${id} desde el catálogo de Windows. Puede pedir confirmación o permisos.`);
  await run(winget, wingetArguments(id), { env });
  const installed = await has(command, env);
  if (!installed) throw new Error(`${id} no quedó disponible. Cerrar y volver a abrir PREPARAR_CENTRAL_COMERCIAL; no se continuará sin comprobarlo.`);
  return installed;
}
async function findMsvc(env) {
  const base = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles;
  const where = base && path.join(base, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (!where || !fs.existsSync(where)) return null;
  try {
    const output = await run(where, ['-latest', '-products', '*', '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { env, capture: true });
    const folder = output.split(/\r?\n/).find(p => fs.existsSync(path.join(p, 'Common7', 'Tools', 'VsDevCmd.bat')));
    return folder || null;
  } catch { return null; }
}
async function compilerEnvironment(env) {
  let folder = await findMsvc(env);
  if (!folder) {
    const winget = executable('winget', env);
    if (!winget) throw new Error('Falta winget para instalar las herramientas C++ de Microsoft.');
    console.log('Instalando herramientas C++ de Microsoft: descarga de varios GB. Autorizar solamente el instalador de Microsoft.');
    await run(winget, wingetArguments(PACKAGES.msvc, true), { env });
    folder = await findMsvc(env);
  }
  if (!folder) throw new Error('Las herramientas C++ no están listas. Si Windows pidió reiniciar, reiniciar y volver a preparar.');
  const script = path.join(folder, 'Common7', 'Tools', 'VsDevCmd.bat');
  // This is Microsoft's installed Developer Command Prompt, not the blocked .ps1.
  // Refuse shell metacharacters in the discovered installation path.
  if (/["%\r\n!&|<>^]/.test(script)) throw new Error('Ruta de herramientas C++ no válida.');
  const cmd = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
  const text = await run(cmd, ['/d', '/s', '/c', `"call "${script}" -no_logo -arch=x64 -host_arch=x64 >nul && set"`], { env, capture: true, verbatim: true });
  const result = { ...env };
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf('='); if (i < 1) continue;
    const key = line.slice(0, i), value = line.slice(i + 1);
    if (/^(PATH|LIB|LIBPATH|INCLUDE|WindowsSdkDir|WindowsSDKVersion|UniversalCRTSdkDir|UCRTVersion|VCToolsInstallDir|VCINSTALLDIR|VSINSTALLDIR)$/i.test(key)) result[key.toUpperCase() === 'PATH' ? 'PATH' : key] = value;
  }
  return result;
}
async function ollamaReady() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { redirect: 'error', signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}
export async function prepareNative({ model, needJarvis = true }) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Este preparador requiere Windows Intel/AMD de 64 bits.');
  let env = setupEnvironment();
  if (needJarvis) {
    const git = await ensure('git', PACKAGES.git, env);
    const uv = await ensure('uv', PACKAGES.uv, env);
    env = await compilerEnvironment(env);
    await ensure('rustup', PACKAGES.rust, env);
    await run(executable('rustup', env), ['toolchain', 'install', 'stable', '--profile', 'minimal'], { env });
    await run(executable('cargo', env), ['--version'], { env });
    await run(uv, ['python', 'install', '3.12'], { env });
    const source = path.join(process.env.LOCALAPPDATA, 'OpenJarvis', 'central-src');
    fs.mkdirSync(source, { recursive: true });
    if (!fs.existsSync(path.join(source, '.git'))) {
      if (fs.readdirSync(source).length) throw new Error('La carpeta del motor contiene archivos ajenos. Se conservaron sin modificarlos.');
      await run(git, ['init', source], { env });
    }
    let head = '';
    try { head = await run(git, ['-C', source, 'rev-parse', 'HEAD'], { env, capture: true }); } catch {}
    if (head && head !== OPENJARVIS_REVISION) throw new Error('Hay otra versión del motor en la carpeta reservada. No se reemplazó.');
    if (!head) {
      await run(git, ['-C', source, 'fetch', '--depth=1', 'https://github.com/open-jarvis/OpenJarvis.git', OPENJARVIS_REVISION], { env });
      await run(git, ['-C', source, 'checkout', '--detach', 'FETCH_HEAD'], { env });
    }
    const verified = await run(git, ['-C', source, 'rev-parse', 'HEAD'], { env, capture: true });
    if (verified !== OPENJARVIS_REVISION) throw new Error('No se pudo verificar la versión oficial.');
    console.log('Preparando el motor oficial, Python y su extensión nativa. Puede demorar.');
    await run(uv, ['sync', '--locked', '--python', '3.12', '--extra', 'desktop', '--group', 'desktop-native'], { env, cwd: source });
    const python = path.join(source, '.venv', 'Scripts', 'python.exe');
    await run(python, ['-c', 'import openjarvis._rust_bridge; import fastapi; import uvicorn; import openjarvis.cli'], { env, cwd: source });
    await run(path.join(source, '.venv', 'Scripts', 'jarvis.exe'), ['--help'], { env, cwd: source, capture: true });
  }
  const ollama = await ensure('ollama', PACKAGES.ollama, env);
  let owned;
  try {
    if (!await ollamaReady()) {
      owned = spawn(ollama, ['serve'], { env, stdio: 'ignore', shell: false, windowsHide: true });
      let startError; owned.once('error', e => { startError = e; });
      for (let i = 0; i < 45 && !await ollamaReady(); i++) {
        if (startError) throw startError;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!await ollamaReady()) throw new Error('Ollama no respondió. No se marcó el modelo como preparado.');
    }
    await run(ollama, ['pull', model], { env });
    const r = await fetch('http://127.0.0.1:11434/api/tags', { redirect: 'error', signal: AbortSignal.timeout(5000) });
    const tags = await r.json();
    if (!r.ok || !tags.models?.some(m => m.name === model || m.model === model)) throw new Error('El modelo no quedó disponible.');
  } finally { if (owned && owned.exitCode === null) owned.kill(); }
}
