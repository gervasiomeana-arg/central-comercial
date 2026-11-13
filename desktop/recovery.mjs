import fs from 'node:fs';
import path from 'node:path';
export const retryDelay = attempts => Math.min(300000, 5000 * 2 ** Math.min(6, Math.max(0, attempts - 1)));
export function atomicJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file + '.tmp', 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(file + '.tmp', file);
}
export function upgradeWorker(source, target) {
  if (!fs.existsSync(source)) return false;
  const content = fs.readFileSync(source);
  if (fs.existsSync(target) && content.equals(fs.readFileSync(target))) return true;
  const backups = path.join(path.dirname(target), 'central-worker-backups');
  fs.mkdirSync(backups, { recursive: true });
  if (fs.existsSync(target)) fs.copyFileSync(target, path.join(backups, path.basename(target) + '.' + Date.now() + '.bak'));
  fs.writeFileSync(target + '.central-update', content, { mode: 0o600 }); fs.renameSync(target + '.central-update', target);
  return true;
}
