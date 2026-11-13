import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
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
