import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { retryDelay } from './recovery.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'CentralComercial', 'runtime');
fs.mkdirSync(state, { recursive: true });
const manualStop = path.join(state, 'manual-stop');
const guard = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
try { await new Promise((resolve, reject) => { guard.once('error', reject); guard.listen(37378, '127.0.0.1', resolve); }); }
catch { console.log('Central Comercial ya tiene un guardián activo.'); process.exit(0); }
// A new launch or logon is an explicit new session. A stop during this session is respected.
fs.rmSync(manualStop, { force: true });
if (process.argv.includes('--login')) await new Promise(resolve => setTimeout(resolve, 20000));
let stopped = false, child, timer, attempts = 0;

const updateStatus = path.join(state,'auto-update-status.json');
const writeUpdate = (status,detail) => {
  try { fs.writeFileSync(updateStatus+'.tmp',JSON.stringify({at:new Date().toISOString(),status,detail}),{mode:0o600});fs.renameSync(updateStatus+'.tmp',updateStatus); } catch {}
};
async function checkGitHubUpdate() {
  if (process.env.CENTRAL_AUTO_UPDATE === 'false' || stopped || fs.existsSync(manualStop)) return;
  try {
    if (!fs.existsSync(path.join(root,'.git'))) {
      writeUpdate('requires_git_checkout','El paquete ZIP no permite actualizarse con git pull. No se modifica la instalación.');return;
    }
    const run = args => execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:45000,windowsHide:true}).trim();
    const origin=run(['remote','get-url','origin']);
    if (!['https://github.com/gervasiomeana-arg/central-comercial','https://github.com/gervasiomeana-arg/central-comercial.git','git@github.com:gervasiomeana-arg/central-comercial.git'].includes(origin)) {
      writeUpdate('blocked','Repositorio de origen no autorizado.');return;
    }
    if (run(['branch','--show-current'])!=='main' || run(['status','--porcelain'])) {
      writeUpdate('blocked','Rama distinta de main o archivos locales modificados.');return;
    }
    run(['fetch','--quiet','--no-tags','origin','main']);
    const local=run(['rev-parse','HEAD']),remote=run(['rev-parse','FETCH_HEAD']);
    if (local===remote) {writeUpdate('current',local);return;}
    if (run(['merge-base','HEAD','FETCH_HEAD'])!==local) {writeUpdate('blocked','Historial divergente.');return;}
    writeUpdate('update_available',remote);
    // Do not replace live server files: a controlled restart is required.
  } catch(error) {writeUpdate('error',String(error.message).slice(0,240));}
}
setTimeout(()=>void checkGitHubUpdate(),20000).unref();
setInterval(()=>void checkGitHubUpdate(),30*60*1000).unref();

function start() {
  if (stopped || fs.existsSync(manualStop)) return finish();
  const at = Date.now();
  child = spawn(process.execPath, [path.join(root, 'desktop', 'start.mjs')], { cwd: root, stdio: 'inherit', windowsHide: false });
  let handled = false;
  const ended = code => {
    if (handled) return; handled = true;
    if (stopped || code === 0 || code === 78 || fs.existsSync(manualStop)) return finish();
    attempts = Date.now() - at > 600000 ? 1 : attempts + 1;
    const wait = retryDelay(attempts);
    console.log(`Central Comercial se interrumpió. Se intentará recuperar en ${Math.round(wait / 1000)} segundos.`);
    timer = setTimeout(start, wait);
  };
  child.once('error', () => ended(1)); child.once('exit', ended);
}
function finish() { stopped = true; if (timer) clearTimeout(timer); guard.close(); }
function stop() {
  stopped = true; fs.writeFileSync(manualStop, String(Date.now()));
  if (timer) clearTimeout(timer);
  if (child?.pid) {
    if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
    else child.kill('SIGTERM');
  }
  finish(); setTimeout(() => process.exit(0), 1000);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop); start();
