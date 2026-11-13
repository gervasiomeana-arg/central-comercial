import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Express } from 'express';
import { db } from './db.js';
import { DATA_DIR } from './data-directory.js';
import { workerAuthorized } from './channelTests.js';
function withoutSecrets(value: any): any {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret|token|api.?key|lease/i.test(key)).map(([key, item]) => [key, withoutSecrets(item)]));
  return value;
}
export function checkpoint() {
  const files: Record<string, unknown> = { 'central_comercial_db.json': withoutSecrets(db.getRaw()) };
  for (const name of ['channel_test_jobs.json', 'openjarvis_plans.json', 'assistant_history.json']) {
    const file = path.join(DATA_DIR, name);if(fs.existsSync(file))files[name]=withoutSecrets(JSON.parse(fs.readFileSync(file,'utf8')));
  }
  const payload={format:1,createdAt:new Date().toISOString(),files};return {payload,sha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}
export function registerCheckpointRoute(app: Express) {
  app.post('/api/local-runtime/migrate',(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(!workerAuthorized(req.headers.authorization))return res.status(401).json({error:'Computadora no autorizada.'});
    if(process.env.CENTRAL_LOCAL_MODE==='true')return res.status(409).json({error:'Esta base ya trabaja en la computadora.'});
    try{
      const frozen=path.join(DATA_DIR,'local-handoff.json');
      if(db.getRaw().localMigration){if(fs.existsSync(frozen))return res.json(JSON.parse(fs.readFileSync(frozen,'utf8')));throw new Error('El traslado ya fue realizado. Conservar los archivos de la PC dedicada.');}
      const data=db.getRaw(),paused=data.localMigrationPending?.paused??data.scheduler.automationsPaused;data.localMigrationPending={paused};data.scheduler.automationsPaused=true;db.save();
      if(data.conversations.some(c=>c.messages.some(m=>m.status==='envio_intentado'&&(m.sendDeadline||Infinity)>Date.now())))return res.status(409).json({error:'Hay envíos en curso. Se pausaron nuevas tareas; esperar su resultado antes del traslado.'});
      const snapshot=checkpoint();(snapshot.payload.files['central_comercial_db.json'] as any).scheduler.automationsPaused=paused;
      snapshot.sha256=createHash('sha256').update(JSON.stringify(snapshot.payload)).digest('hex');
      fs.writeFileSync(frozen+'.tmp',JSON.stringify(snapshot),{mode:0o600});fs.renameSync(frozen+'.tmp',frozen);
      data.localMigration={at:new Date().toISOString()};delete data.localMigrationPending;db.save();res.json(snapshot);
    }catch(error:any){res.status(409).json({error:error.message});}
  });
  app.get('/api/local-runtime/checkpoint', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Computadora no autorizada.' });
    try {
      res.json(checkpoint());
    } catch { res.status(503).json({ error: 'No se pudo crear una copia coherente. Se conservó el respaldo anterior.' }); }
  });
}
