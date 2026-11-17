import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { retryDelay } from './recovery.mjs';
import {activeRoot, latestCommit, stageRelease, activateRelease} from './auto-update.mjs';
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
const writeUpdate=(status,detail)=>{try{fs.writeFileSync(updateStatus+'.tmp',JSON.stringify({at:new Date().toISOString(),status,detail}));fs.renameSync(updateStatus+'.tmp',updateStatus);}catch{}};
let updating=false;
let pendingSha=null;
async function checkGitHubUpdate() {
 if(process.env.CENTRAL_AUTO_UPDATE==='false'||stopped||updating||fs.existsSync(manualStop))return;
 updating=true;
 try{
   const sha=await latestCommit();
   const current=activeRoot(root);
   if(current===path.join(state,'releases',sha)){writeUpdate('current',sha);return;}
   writeUpdate('preparing',sha);
   await stageRelease(sha);
   // Do not replace files while the backend, Gmail or WhatsApp are running.
   // Activate the prepared release only at the next natural start.
   pendingSha=sha;
   writeUpdate('ready_for_restart',sha);
 }catch(error){writeUpdate('error',String(error.message).slice(0,240));}
 finally{updating=false;}
}
setTimeout(()=>void checkGitHubUpdate(),20000).unref();
setInterval(()=>void checkGitHubUpdate(),30*60*1000).unref();

function start() {
  if (stopped || fs.existsSync(manualStop)) return finish();
  if(pendingSha){try{activateRelease(pendingSha);writeUpdate('activated',pendingSha);pendingSha=null;}catch(error){writeUpdate('activation_failed',String(error.message));pendingSha=null;}}
  const at = Date.now();
  const currentRoot=activeRoot(root);
  child = spawn(process.execPath, [path.join(currentRoot, 'desktop', 'start.mjs')], { cwd: currentRoot, stdio: 'inherit', windowsHide: false });
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
