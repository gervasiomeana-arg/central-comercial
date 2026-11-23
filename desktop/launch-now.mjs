import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {findConfig} from './config.mjs';
import {reconcileRuntime} from './reconcile-data.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=findConfig(root);if(!config)throw new Error('No se encontró la conexión guardada. No se cambiaron claves.');
const locks=[];
try{
 for(const port of [37378,37379,39300]){
  const lock=net.createServer(socket=>socket.end());
  await new Promise((resolve,reject)=>{lock.once('error',()=>reject(new Error('Central sigue abierta. Cerrá el iniciador anterior con Ctrl+C y volvé a abrir PONER_EN_MARCHA_CENTRAL.bat. No se modificó la base.')));lock.listen(port,'127.0.0.1',resolve);});locks.push(lock);
 }
 const runtime=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'CentralComercial','runtime');
 const report=await reconcileRuntime(runtime,config,{activate:true});
 console.log(`Conciliación completada: ${report.after.contacts} contactos y ${report.after.conversations} conversaciones.`);
 console.log(`Investigación: ${report.requestsPreserved} solicitudes conservadas; sin cupo diario. Correo: ${report.emailLimit} por día. Países: ${report.countries.join(', ')}.`);
 console.log('Se conservaron ambas copias, la planificación local, los pagos y las sesiones. Iniciando operación autónoma.');
}finally{for(const lock of locks)await new Promise(resolve=>lock.close(resolve));}
