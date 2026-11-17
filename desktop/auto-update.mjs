import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
const runtime=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'CentralComercial','runtime');
const releases=path.join(runtime,'releases'),pointer=path.join(runtime,'active-release.json');
const valid=sha=>/^[a-f0-9]{40}$/.test(sha);
const run=(cmd,args,cwd,timeout=300000)=>new Promise((resolve,reject)=>{
 const windowsNpm=process.platform==='win32' && cmd==='npm.cmd';
 const npmCli=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
 if(windowsNpm && !fs.existsSync(npmCli))throw new Error('npm-cli.js no encontrado junto a Node.js');
 const executable=windowsNpm?process.execPath:cmd;
 const commandArgs=windowsNpm?[npmCli,...args]:args;
 const child=spawn(executable,commandArgs,{cwd,stdio:'ignore',windowsHide:true});
 const timer=setTimeout(()=>child.kill(),timeout);
 child.once('error',e=>{clearTimeout(timer);reject(e);});
 child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(cmd+' exit '+code));});
});
export function activeRoot(fallback){
 try{const {sha}=JSON.parse(fs.readFileSync(pointer,'utf8'));const root=path.join(releases,sha);
 return valid(sha)&&fs.existsSync(path.join(root,'dist','index.html'))?root:fallback;}catch{return fallback;}
}
export async function latestCommit(){
 const response=await fetch('https://api.github.com/repos/gervasiomeana-arg/central-comercial/commits/main',{headers:{'User-Agent':'CentralComercial'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('GitHub HTTP '+response.status);
 const {sha}=await response.json();if(!valid(sha))throw new Error('Commit no válido');return sha;
}
export async function stageRelease(sha){
 if(!valid(sha))throw new Error('Commit no válido');
 const dest=path.join(releases,sha);if(fs.existsSync(path.join(dest,'dist','index.html')))return dest;
 fs.mkdirSync(releases,{recursive:true});
 const stage=path.join(releases,sha+'.staging');fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage);
 try{
  const response=await fetch('https://api.github.com/repos/gervasiomeana-arg/central-comercial/tarball/'+sha,{headers:{'User-Agent':'CentralComercial'},signal:AbortSignal.timeout(120000)});
  if(!response.ok||!response.body)throw new Error('Descarga GitHub HTTP '+response.status);
  const archive=path.join(stage,'release.tar.gz');
  await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(archive));
  if(fs.statSync(archive).size>100*1024*1024)throw new Error('Descarga demasiado grande');
  const unpack=path.join(stage,'unpack');fs.mkdirSync(unpack);
  await run('tar',['-xzf',archive,'-C',unpack],stage,120000);
  const entries=fs.readdirSync(unpack,{withFileTypes:true}).filter(x=>x.isDirectory());
  if(entries.length!==1)throw new Error('Estructura de release inesperada');
  const src=path.join(unpack,entries[0].name);
  if(!fs.existsSync(path.join(src,'desktop','start.mjs'))||!fs.existsSync(path.join(src,'package-lock.json')))throw new Error('Release incompleto');
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  // Some published commits have a package-lock.json missing a declared dev dependency.
  // Repair the lock only inside this isolated staged release; never touch the user's records.
  await run(npm,['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],src,180000);
  await run(npm,['ci','--include=dev','--ignore-scripts','--no-audit','--no-fund'],src,600000);
  await run(npm,['run','build'],src,180000);
  if(!fs.existsSync(path.join(src,'dist','index.html')))throw new Error('Build incompleto');
  fs.renameSync(src,dest);return dest;
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
export function activateRelease(sha){
 if(!valid(sha)||!fs.existsSync(path.join(releases,sha,'dist','index.html')))throw new Error('Release sin validar');
 fs.writeFileSync(pointer+'.tmp',JSON.stringify({sha,at:new Date().toISOString()}));
 fs.renameSync(pointer+'.tmp',pointer);
}
