import fs from 'node:fs';
import path from 'node:path';
export function copyCode(source,target){
  const rootFiles=['package.json','package-lock.json','tsconfig.json','INICIAR_CENTRAL_COMERCIAL.bat','PREPARAR_CENTRAL_COMERCIAL.bat','ACTIVAR_INICIO_AUTOMATICO.bat','DESACTIVAR_INICIO_AUTOMATICO.bat','server.ts'];
  const copy=(from,to)=>{if(path.resolve(from)===path.resolve(to))return;fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
  for(const name of rootFiles)copy(path.join(source,name),path.join(target,name));
  const walk=(dir,relative='')=>{
    for(const entry of fs.readdirSync(path.join(source,dir,relative),{withFileTypes:true})){
      if(entry.isSymbolicLink()||entry.name.startsWith('.')||['private-state','node_modules','central-worker-backups'].includes(entry.name))continue;
      const file=path.join(dir,relative,entry.name);
      if(entry.isDirectory())walk(dir,path.join(relative,entry.name));
      else if(dir==='dist'||/\.(?:ts|tsx|js|mjs|css|md|bat|txt)$/.test(entry.name))copy(path.join(source,file),path.join(target,file));
    }
  };
  for(const dir of ['server','src','dist','desktop','email-worker','openjarvis-worker'])walk(dir);
}
