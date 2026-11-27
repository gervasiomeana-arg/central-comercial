import fs from 'node:fs';
import path from 'node:path';
export const retryDelay = attempts => Math.min(300000, 5000 * 2 ** Math.min(6, Math.max(0, attempts - 1)));
export function waitForChildExit(child, timeoutMs) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = exited => {
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
  });
}
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

const reportClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});

export function readOwnerReport(file, now = new Date()) {
  const parts = Object.fromEntries(reportClock.formatToParts(now).map(({ type, value }) => [type, value]));
  const today = [parts.year, parts.month, parts.day].join('-');
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const day = Number(parts.hour) >= 20 ? today : yesterday;
  if (!fs.existsSync(file)) return { day, status: 'sin_intento' };
  try {
    const reports = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entry = reports['manual-' + day] ?? reports['daily-' + day];
    if (!entry) return { day, status: 'sin_intento' };
    if (!['aceptado_proveedor', 'entrega_confirmada', 'rechazado', 'resultado_desconocido'].includes(entry.status) ||
        typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at))) {
      return { day, status: 'registro_no_disponible' };
    }
    return { day, status: entry.status, at: entry.at };
  } catch {
    return { day, status: 'registro_no_disponible' };
  }
}

/**
 * @param {{
 *   savedBrowser?: string;
 *   explicitlyConfigured?: string;
 *   installedChrome?: string[];
 *   installedEdge?: string[];
 *   hasSavedProfile?: boolean;
 *   profileHint?: string;
 *   exists?: (file: string) => boolean;
 * }} options
 */
export function selectWhatsAppBrowser({
  savedBrowser = '',
  explicitlyConfigured = '',
  installedChrome = [],
  installedEdge = [],
  hasSavedProfile = false,
  profileHint = '',
  exists = file => {
    try { return Boolean(file) && fs.statSync(file).isFile(); } catch { return false; }
  },
}) {
  const family = file => /chrome[.]exe$/i.test(file || '') ? 'chrome' : /msedge[.]exe$/i.test(file || '') ? 'edge' : '';
  const savedFamily = family(savedBrowser);
  const sameFamily = savedFamily === 'chrome' ? installedChrome : savedFamily === 'edge' ? installedEdge : [];
  const matchingProfile = profileHint === 'edge' ? installedEdge : profileHint === 'chrome' ? installedChrome : [];
  const candidates = savedBrowser
    ? [savedBrowser, ...sameFamily, ...(savedFamily && family(explicitlyConfigured) === savedFamily ? [explicitlyConfigured] : [])]
    : [(!hasSavedProfile || !profileHint || family(explicitlyConfigured) === profileHint) ? explicitlyConfigured : '',
      ...(hasSavedProfile ? matchingProfile : [...installedEdge, ...installedChrome])];
  return candidates.find(exists) || '';
}
