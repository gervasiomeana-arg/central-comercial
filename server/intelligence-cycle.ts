import { GoogleGenAI } from '@google/genai';
import {prospectQuery} from './discovery-plan.js';
import {db} from './db.js';
import type {JarvisQueue} from './openjarvis.js';
import {enqueueJarvisPlan} from './openjarvis.js';
import {normalize,playbook} from './sales-director.js';
import type {JarvisStrategy} from '../src/openjarvis-types.js';
import type {Application,Campaign} from '../src/types.js';
let queue:JarvisQueue|undefined;
export const configureIntelligence=(q:JarvisQueue)=>{queue=q;};
export function strategyQueries(strategy:JarvisStrategy,app:Application,country:string){
 const terms=playbook(app).terms.map(normalize);
 const queries=[...new Set(strategy.searchQueries.map(q=>q.trim()))];
 const institutionalOnly=normalize(app.slug+' '+app.name).includes('neuro');
 const institutional=/(centro|institu|escuela|escola|colegio|fundac|asociac|associac|clinica|consultorio|educativ|jardin)/;
 const vetted=queries.filter(q=>prospectQuery(q,app,country)&&terms.some(t=>normalize(q).includes(t))&&(!institutionalOnly||institutional.test(normalize(q))));
 if(!vetted.length)throw new Error('Ninguna búsqueda incluye el país y la actividad institucional requeridos.');
 return vetted;
}
export function applyStrategy(q:JarvisQueue,planId:string,campaign:Campaign){
 const plan=q.completed(planId),app=db.getApplicationById(campaign.appId),goal=db.getMonthlyGoal();
 if(!plan||!app||app.status!=='lista'||!app.campaignsAllowed||plan.context.app.id!==campaign.appId||normalize(plan.context.country)!==normalize(campaign.country)||plan.context.goal.month!==goal.month||campaign.goalMonth!==goal.month)throw new Error('La estrategia no corresponde a esta aplicación, país y mes.');
 let queries:string[];try{queries=strategyQueries(plan.strategy,app,campaign.country);}catch(error){q.rejectStrategy(planId);throw error;}
 delete campaign.catalogStrategy;campaign.researchQueries=queries;campaign.researchQueryVersion=2;campaign.researchQueryIndex=0;campaign.researchSegment=plan.strategy.segments.map(s=>s.name).join('; ');campaign.intelligenceEnabled=true;campaign.intelligencePlanId=planId;delete campaign.intelligenceError;db.save();
 // The verified promotional template, limits, consent, prices and payment policies stay in force.
}
let planning=false;
export async function intelligenceCycle(){
 if(planning)return;
 planning=true;
 try { await runIntelligenceCycle(); } finally { planning=false; }
}
async function runIntelligenceCycle(){
 if(!queue||db.getSchedulerState().automationsPaused)return;
 const report=db.getSalesGoalReport();if(!report.goal.enabled||!report.remaining)return;
 for(const c of db.getCampaigns().filter(c=>db.campaignInActiveRun(c.id)&&c.goalMonth===report.goal.month&&c.intelligenceEnabled&&['activa','lista','bloqueada_por_configuracion'].includes(c.status))){
  if(c.intelligenceRecoveryVersion!==2){
   c.intelligenceRecoveryVersion=2;delete c.intelligenceNextAttemptAt;delete c.intelligenceError;
   const previous=queue.status().plans.find(p=>p.id===c.intelligenceRequestId);
   if(previous?.state==='failed')delete c.intelligenceRequestId;
   db.save();
  }
  // An empty research result triggers a fresh AI-led prospecting approach, not a fixed retry loop.
  const empty=c.researchLastOutcome && c.researchLastOutcome.created===0 && c.researchLastOutcome.reused===0 && (c.researchLastOutcome.checked>0 || Object.keys(c.researchLastOutcome.reasons||{}).length>0);
  if(empty && !queue.status().ready && process.env.CENTRAL_GEMINI_FREE_ONLY==='true' && process.env.GEMINI_API_KEY && (c.intelligenceNextAttemptAt||0)<=Date.now()){
   c.intelligenceNextAttemptAt=Date.now()+6*60*60*1000;db.save();
   try {
    const app=db.getApplicationById(c.appId);
    if(!app)continue;
    const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
    const response=await ai.models.generateContent({model:process.env.CENTRAL_GEMINI_MODEL||'gemini-2.5-flash-lite',contents:JSON.stringify({app:{name:app.name,audience:playbook(app).audience,terms:playbook(app).terms},country:c.country,previousQueries:c.researchQueries,lastOutcome:c.researchLastOutcome}),config:{temperature:0.7,maxOutputTokens:500,responseMimeType:'application/json',systemInstruction:'Sos el planificador de investigación comercial de Central Comercial. Devolvé JSON con searchQueries: array de 2 a 5 cadenas distintas. Cada búsqueda debe incluir explícitamente el país y un término de actividad del producto. Cambiá segmentos, sin repetir las consultas previas. No inventes empresas, datos ni contactos. No envíes mensajes ni ejecutes acciones.'}});
    const result=JSON.parse(response.text||'{}');
    const candidate={searchQueries:result.searchQueries,segments:[],campaignAngle:'',nextSteps:[],ownerQuestions:[]} as JarvisStrategy;
    if(!Array.isArray(candidate.searchQueries))throw new Error('Gemini no devolvió búsquedas estructuradas.');
    const queries=strategyQueries(candidate,app,c.country).filter(q=>!(c.researchQueries||[]).some(old=>normalize(old)===normalize(q)));
    if(!queries.length)throw new Error('Gemini no encontró una nueva estrategia válida.');
    c.researchQueries=queries;c.researchQueryIndex=0;c.researchQueriesToday=0;c.researchQueryVersion=2;c.researchLastOutcome=undefined;
    c.intelligenceError=undefined;db.addLog('info','contactos',`Gemini cambió la estrategia de búsqueda de ${app.name} tras resultados vacíos.`,{campaignId:c.id,queries});db.save();
   }catch(error:any){c.intelligenceError=/429|quota|RESOURCE_EXHAUSTED/i.test(String(error?.message))?'Gemini alcanzó su cuota; investigación conservada para el próximo intento.':'Gemini no pudo proponer nuevas consultas verificables.';db.save();}
   continue;
  }
  if((c.intelligenceNextAttemptAt||0)>Date.now())continue;
  try{
   if(c.intelligenceRequestId){const plan=queue.completed(c.intelligenceRequestId);if(plan){if(empty){delete c.intelligenceRequestId;delete c.intelligencePlanId;}else{applyStrategy(queue,plan.id,c);continue;}}const job=queue.status().plans.find(p=>p.id===c.intelligenceRequestId);if(job?.state==='failed'){c.intelligenceError=job.error||'OpenJarvis no completó la estrategia; se reintentará con el motor local.';delete c.intelligenceRequestId;c.intelligenceNextAttemptAt=Date.now()+600000;db.save();}continue;}
   if(queue.status().ready){c.intelligenceRequestId=enqueueJarvisPlan(queue,c.appId,c.country);delete c.intelligenceError;db.save();}
   else{c.intelligenceError='Esperando el motor local de OpenJarvis antes de investigar y enviar.';db.save();}
  }catch(error:any){c.intelligenceError=error.message;const invalid=c.intelligenceRequestId&&queue.status().plans.some(p=>p.id===c.intelligenceRequestId&&p.state==='failed');if(invalid)delete c.intelligenceRequestId;c.intelligenceNextAttemptAt=Date.now()+(invalid?30000:3600000);db.save();}
 }
}
