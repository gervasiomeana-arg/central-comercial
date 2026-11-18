import type {Express} from 'express';
import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {requireAdminAuth} from './auth.js';
let busy=false;
export function registerPromoCaptureRoutes(app:Express){
 app.post('/api/promo/capture',requireAdminAuth,async(req,res)=>{
  if(busy)return res.status(429).json({error:'Ya hay una captura en proceso.'});
  const raw=String(req.body?.url||'');
  let url:URL;try{url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{return res.status(400).json({error:'URL HTTPS invalida.'});}
  // Prevent arbitrary requests to private addresses and unrelated websites.
  if(!['openvoley.com','www.openvoley.com','visibility-ia.ai.studio','funeraria-control.ai.studio','neuroplaneta.ai.studio',...String(process.env.NEUROPLANETA_PUBLIC_URL||'').split(' ').filter(Boolean).map(x=>{try{return new URL(x).hostname}catch{return ''}})].includes(url.hostname))return res.status(403).json({error:'Solo se permiten las webs publicas verificadas de las aplicaciones.'});
  busy=true;let browser;const dir=await mkdtemp(path.join(os.tmpdir(),'central-promo-'));
  try{
   const candidates=[process.env.CHROME_PATH,process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
     ...(process.platform==='win32'?[path.join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')]:['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'])];
   const executablePath=candidates.find(p=>p&&fs.existsSync(p));
   browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
   const context=await browser.newContext({viewport:{width:720,height:1280},recordVideo:{dir,size:{width:720,height:1280}}});
   const page=await context.newPage();const video=page.video();
   const stories:Record<string,{name:string;tagline:string;scenes:string[]}>={
    'visibility-ia.ai.studio':{name:'VISIBILITY AI',tagline:'Tu negocio merece ser encontrado',scenes:['Auditoría SEO y diagnóstico digital','Detectá oportunidades para mejorar tu presencia','Seguimiento, informes y planes de acción','Consultá por nuestros servicios']},
    'funeraria-control.ai.studio':{name:'FUNERARIA CONTROL',tagline:'Gestión que acompaña cada momento',scenes:['Expedientes y seguimiento de servicios','Agenda, recursos y personal coordinados','Inventario, administración y control','Conocé una gestión funeraria más organizada']},
    'neuroplaneta.ai.studio':{name:'NEUROPLANETA',tagline:'Un espacio para aprender jugando',scenes:['Juegos y actividades para acompañar el foco','Rutinas y herramientas visuales','Acompañamiento para familias y educadores','Descubrí NeuroPlaneta']},
    'openvoley.com':{name:'OPEN VOLEY',tagline:'Cada jugada cuenta',scenes:['Registrá acciones y rotaciones','Analizá el rendimiento de tu equipo','Video y estadísticas para entrenar mejor','Descubrí Open Voley']}
   };
   const story=stories[url.hostname]||stories['openvoley.com'];
   await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:25000});
   await page.waitForTimeout(1000);
   // Narrative cards are promotional claims, not a simulated product demonstration.
   await page.evaluate(({name,tagline})=>{
     const overlay=document.createElement('div');overlay.id='central-promo-story';
     overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:flex;align-items:end;justify-content:center;padding:0 35px 115px;background:linear-gradient(180deg,transparent 20%,rgba(7,15,29,.86) 100%);font-family:Arial,sans-serif;color:white;box-sizing:border-box';
     overlay.innerHTML='<div style="width:100%;text-align:center"><div id="central-promo-brand" style="font-size:19px;font-weight:800;letter-spacing:3px;margin-bottom:22px"></div><div id="central-promo-line" style="font-size:42px;line-height:1.13;font-weight:800;text-shadow:0 3px 12px #000"></div><div id="central-promo-tag" style="font-size:17px;margin-top:20px"></div></div>';
     document.body.appendChild(overlay);
     document.getElementById('central-promo-brand')!.textContent=name;
     document.getElementById('central-promo-tag')!.textContent=tagline;
   },{name:story.name,tagline:story.tagline});
   for(let i=0;i<story.scenes.length;i++){
     await page.evaluate(({line,i})=>{
       const label=document.getElementById('central-promo-line');if(label)label.textContent=line;
       const overlay=document.getElementById('central-promo-story');
       if(overlay)overlay.style.background=i%2===0?'linear-gradient(180deg,transparent 12%,rgba(7,15,29,.9) 100%)':'linear-gradient(180deg,rgba(7,15,29,.22),rgba(16,49,80,.95))';
       window.scrollTo({top:Math.round(document.body.scrollHeight*i/4),behavior:'smooth'});
     },{line:story.scenes[i],i});
     await page.waitForTimeout(2600);
   }
   await context.close();const videoPath=await video?.path();if(!videoPath)throw Error('No se genero video.');
   res.setHeader('Content-Type','video/webm');res.setHeader('Cache-Control','no-store');res.sendFile(videoPath,async()=>{await rm(dir,{recursive:true,force:true})});
  }catch(e:any){await rm(dir,{recursive:true,force:true});const reason=String(e?.message||e).slice(0,350);console.error('[promo-capture]',reason);if(!res.headersSent)res.status(503).json({error:'No fue posible capturar la aplicación.',detail:reason});}
  finally{await browser?.close();busy=false;}
 });
}
