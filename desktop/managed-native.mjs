import { spawn } from 'node:child_process';
const [command, ...args] = process.argv.slice(2);
if (!process.send || !command) throw new Error('Este componente solo se inicia desde Central Comercial.');
const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
let ending = false;
function stop(code = 75) {
  if (ending) return; ending = true;
  if (child.pid) {
    if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 1000);
}
child.on('error', () => stop(75)); child.on('exit', code => { if (!ending) process.exit(code ?? 75); });
process.on('disconnect', () => stop()); process.on('SIGINT', () => stop(0)); process.on('SIGTERM', () => stop(0));
process.on('uncaughtException', () => stop()); process.on('unhandledRejection', () => stop());
