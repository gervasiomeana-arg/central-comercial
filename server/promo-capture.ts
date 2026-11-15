import type {Express} from 'express';
import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {requireAdminAuth} from './auth.js';
let busy=false;
export function registerPromoCaptureRoutes(app:Express){
 app.post('/api/promo/capture',requireAdminAuth,async(req,res)=>{
  if(busy)return res.status(429).json({error:'Ya hay una captura en proceso.'});
  const raw=String(req.body?.url||'');
  let url:URL;try{url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{return res.status(400).json({error:'URL HTTPS invalida.'});}
  // Prevent arbitrary requests to private addresses and unrelated websites.
  if(!['openvoley.com','www.openvoley.com','visibility-ia.ai.studio','funeraria-control.ai.studio',...String(process.env.NEUROPLANETA_PUBLIC_URL||'').split(' ').filter(Boolean).map(x=>{try{return new URL(x).hostname}catch{return ''}})].includes(url.hostname))return res.status(403).json({error:'Solo se permiten las webs publicas verificadas de las aplicaciones.'});
  busy=true;let browser;const dir=await mkdtemp(path.join(os.tmpdir(),'central-promo-'));
  try{
   browser=await chromium.launch({headless:true});
   const context=await browser.newContext({viewport:{width:720,height:1280},recordVideo:{dir,size:{width:720,height:1280}}});
   const page=await context.newPage();const video=page.video();
   await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:25000});await page.waitForTimeout(2500);
   const links=await page.locator('a[href]').evaluateAll((nodes,origin)=>nodes.map(n=>(n as HTMLAnchorElement).href).filter(x=>{try{const u=new URL(x);return u.origin===origin&&!/login|auth|admin|checkout|pago|delete|eliminar/i.test(u.pathname)}catch{return false}}).slice(0,3),url.origin);
   for(const link of links){try{await page.goto(link,{waitUntil:'domcontentloaded',timeout:12000});await page.waitForTimeout(2500)}catch{}}
   await context.close();const videoPath=await video?.path();if(!videoPath)throw Error('No se genero video.');
   res.setHeader('Content-Type','video/webm');res.setHeader('Cache-Control','no-store');res.sendFile(videoPath,async()=>{await rm(dir,{recursive:true,force:true})});
  }catch(e:any){await rm(dir,{recursive:true,force:true});res.status(503).json({error:'No fue posible capturar la aplicacion. La instalacion automatica de Chromium no se completo en este entorno; revisa el registro de despliegue.'});}
  finally{await browser?.close();busy=false;}
 });
}
