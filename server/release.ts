import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
// Fingerprint actual runtime sources, including packaged installs without .git.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = createHash('sha256');
function include(relative:string) {
  const full=path.join(root,relative);
  if(!fs.existsSync(full))return;
  if(fs.statSync(full).isDirectory()) {
    for(const name of fs.readdirSync(full).sort())if(!name.startsWith('.')&&!['node_modules','private-state','central-worker-backups'].includes(name))include(path.posix.join(relative,name));
  } else if((/\.(ts|tsx|js|mjs|bat|css)$/.test(relative)||['package.json','package-lock.json'].includes(relative)))hash.update(relative+'\0').update(fs.readFileSync(full)).update('\0');
}
for(const relative of ['server.ts','server','src','desktop','email-worker','openjarvis-worker','package.json','package-lock.json'])include(relative);
export const release = {version:'2026-11-15.1',sourceFingerprint:hash.digest('hex')};
