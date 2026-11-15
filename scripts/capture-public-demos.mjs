import { chromium } from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const apps=[{slug:'open-voley',url:'https://openvoley.com'},{slug:'neuroplaneta',url:process.env.NEUROPLANETA_PUBLIC_URL},{slug:'visibility-ai',url:'https://visibility-ia.ai.studio'},{slug:'funeraria-control',url:'https://funeraria-control.ai.studio'}];
const out=path.resolve('promo-captures');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const app of apps){
  if(!app.url){console.log(app.slug+': URL publica no configurada');continue;}
  const origin=new URL(app.url).origin;
  const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});
  const page=await context.newPage();const visited=[];
  try{
   await page.goto(app.url,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(2000);
   await page.screenshot({path:path.join(out,app.slug+'-inicio.png')});
   visited.push({url:page.url(),headings:(await page.locator('h1,h2').allTextContents()).slice(0,8)});
   const links=await page.locator('a[href]').evaluateAll((els,origin)=>els.map(a=>({url:a.href,text:(a.textContent||'').trim()})).filter(x=>{try{const u=new URL(x.url);return u.origin===origin&&!/login|auth|logout|admin|pago|checkout|delete|eliminar|borrar|suscri/i.test(u.pathname+' '+x.text)}catch{return false}}).slice(0,15),origin);
   for(const link of links.slice(0,3)){try{await page.goto(link.url,{waitUntil:'domcontentloaded',timeout:15000});await page.waitForTimeout(2000);visited.push({url:page.url(),headings:(await page.locator('h1,h2').allTextContents()).slice(0,8)});}catch(e){visited.push({url:link.url,error:String(e)})}}
  }catch(e){visited.push({error:String(e)})}
  finally{await context.close();await writeFile(path.join(out,app.slug+'.json'),JSON.stringify(visited,null,2));console.log(app.slug,visited.length,'escenas; video guardado por Playwright');}
 }
}finally{await browser.close()}
