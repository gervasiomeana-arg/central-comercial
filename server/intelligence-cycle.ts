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
 if(!queries.length||queries.some(q=>!normalize(q).includes(normalize(country))||!terms.some(t=>normalize(q).includes(t))))throw new Error('La estrategia no verifica país y actividad de las búsquedas. Requiere revisión.');
 return queries;
}
export function applyStrategy(q:JarvisQueue,planId:string,campaign:Campaign){
 const plan=q.completed(planId),app=db.getApplicationById(campaign.appId),goal=db.getMonthlyGoal();
 if(!plan||!app||app.status!=='lista'||!app.campaignsAllowed||plan.context.app.id!==campaign.appId||normalize(plan.context.country)!==normalize(campaign.country)||plan.context.goal.month!==goal.month||campaign.goalMonth!==goal.month)throw new Error('La estrategia no corresponde a esta aplicación, país y mes.');
 campaign.researchQueries=strategyQueries(plan.strategy,app,campaign.country);campaign.researchQueryVersion=2;campaign.researchQueryIndex=0;campaign.researchSegment=plan.strategy.segments.map(s=>s.name).join('; ');campaign.intelligenceEnabled=true;campaign.intelligencePlanId=planId;delete campaign.intelligenceError;db.save();
 // The verified promotional template, limits, consent, prices and payment policies stay in force.
}
export function intelligenceCycle(){
 if(!queue||db.getSchedulerState().automationsPaused)return;
 const report=db.getSalesGoalReport();if(!report.goal.enabled||!report.remaining)return;
 for(const c of db.getCampaigns().filter(c=>db.campaignInActiveRun(c.id)&&c.goalMonth===report.goal.month&&c.intelligenceEnabled&&!c.intelligencePlanId&&['activa','lista','bloqueada_por_configuracion'].includes(c.status))){
  if((c.intelligenceNextAttemptAt||0)>Date.now())continue;
  try{
   if(c.intelligenceRequestId){const plan=queue.completed(c.intelligenceRequestId);if(plan){applyStrategy(queue,plan.id,c);continue;}const job=queue.status().plans.find(p=>p.id===c.intelligenceRequestId);if(job?.state==='failed'){c.intelligenceError=job.error||'OpenJarvis no completó la estrategia; se reintentará con el motor local.';delete c.intelligenceRequestId;c.intelligenceNextAttemptAt=Date.now()+600000;db.save();}continue;}
   if(queue.status().ready){c.intelligenceRequestId=enqueueJarvisPlan(queue,c.appId,c.country);delete c.intelligenceError;db.save();}
   else{c.intelligenceError='Esperando el motor local de OpenJarvis antes de investigar y enviar.';db.save();}
  }catch(error:any){c.intelligenceError=error.message;c.intelligenceNextAttemptAt=Date.now()+3600000;db.save();}
 }
}
