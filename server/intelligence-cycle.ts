import {prospectQuery} from './discovery-plan.js';
import {db} from './db.js';
import type {JarvisQueue} from './openjarvis.js';
import {enqueueJarvisPlan,planningQuotaMessage} from './openjarvis.js';
import {normalize,prospectingTerms,unlimitedDirectorOutreach} from './sales-director.js';
import type {JarvisStrategy} from '../src/openjarvis-types.js';
import type {Application,Campaign} from '../src/types.js';
let queue:JarvisQueue|undefined;
export const configureIntelligence=(q:JarvisQueue)=>{queue=q;};
export function strategyQueries(strategy:JarvisStrategy,app:Application,country:string){
 const terms=prospectingTerms(app,country).map(normalize);
 const queries=[...new Set(strategy.searchQueries.map(q=>q.trim()))];
 const institutionalOnly=normalize(app.slug+' '+app.name).includes('neuro');
 const institutional=/(centro|institu|escuela|escola|colegio|fundac|asociac|associac|clinica|consultorio|educativ|jardin|center|school|foundation|clinic|education|stichting|onderwijs|fondation|ecole|clinique)/;
 const vetted=queries.filter(q=>prospectQuery(q,app,country)&&terms.some(t=>normalize(q).includes(t))&&(!institutionalOnly||institutional.test(normalize(q))));
 if(!vetted.length)throw new Error('Ninguna búsqueda incluye el país y la actividad institucional requeridos.');
 return vetted;
}
export function applyStrategy(q:JarvisQueue,planId:string,campaign:Campaign){
 const plan=q.completed(planId),app=db.getApplicationById(campaign.appId),goal=db.getMonthlyGoal();
 if(!plan||!app||app.status!=='lista'||!app.campaignsAllowed||plan.context.app.id!==campaign.appId||normalize(plan.context.country)!==normalize(campaign.country)||plan.context.goal.month!==goal.month||campaign.goalMonth!==goal.month)throw new Error('La estrategia no corresponde a esta aplicación, país y mes.');
 let queries:string[];try{queries=strategyQueries(plan.strategy,app,campaign.country);}catch(error){q.rejectStrategy(planId);throw error;}
 if(campaign.intelligencePlanId===planId)return;
 delete campaign.catalogStrategy;campaign.researchQueries=queries;campaign.researchQueryVersion=2;campaign.researchQueryIndex=0;campaign.researchSegment=plan.strategy.segments.map(s=>s.name).join('; ');campaign.intelligenceEnabled=true;campaign.intelligencePlanId=planId;delete campaign.intelligenceRequestId;delete campaign.intelligenceNextAttemptAt;delete campaign.intelligenceError;db.save();
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
 const report=db.getSalesGoalProgress();if(!report.goal.enabled||!report.remaining)return;
 const campaigns=db.getCampaigns().filter(c=>db.campaignInActiveRun(c.id)&&c.goalMonth===report.goal.month&&['activa','lista','bloqueada_por_configuracion'].includes(c.status));
 const assignedByApp=new Map<string,number>();
 for(const c of campaigns){
  if(c.intelligencePlanId || c.intelligenceRequestId)assignedByApp.set(c.appId,(assignedByApp.get(c.appId)||0)+1);
 }
 const directorLocal = unlimitedDirectorOutreach(report.goal);
 const pending=campaigns.filter(c=>!c.funeralShiftPilot&&!c.intelligencePlanId).sort((a,b)=>
  Number(Boolean(a.intelligenceNextAttemptAt && a.intelligenceError !== planningQuotaMessage)) -
  Number(Boolean(b.intelligenceNextAttemptAt && b.intelligenceError !== planningQuotaMessage)) ||
  (assignedByApp.get(a.appId)||0)-(assignedByApp.get(b.appId)||0));
 let queued=false;
 const ready=queue.status().ready && !queue.pendingPlanning();
 for(const c of pending){
  if(c.intelligenceRequestId){
   const id=c.intelligenceRequestId;
   const plan=queue.completed(id);
   if(plan){
    try{applyStrategy(queue,id,c);continue;}
    catch(error){c.intelligenceError=error instanceof Error?error.message:String(error);}
   }else{
    const status=queue.planState(id);
    if(status==='queued'||status==='running')continue;
    c.intelligenceError='La estrategia local no quedó disponible. Continúa la búsqueda con el catálogo verificado.';
   }
   delete c.intelligenceRequestId;
   c.intelligenceNextAttemptAt=Date.now()+6*60*60*1000;
   db.save();
   continue;
  }
  const obsoleteQuota = directorLocal && c.intelligenceError === planningQuotaMessage;
  if(!ready||queued||(!obsoleteQuota&&(c.intelligenceNextAttemptAt||0)>Date.now()))continue;
  try{
   c.intelligenceRequestId=enqueueJarvisPlan(queue,c.appId,c.country,{directorLocal});
   delete c.intelligenceNextAttemptAt;
   delete c.intelligenceError;
   queued=true;
   db.save();
  }catch(error){
   c.intelligenceError=error instanceof Error?error.message:String(error);
   c.intelligenceNextAttemptAt=Date.now()+3600000;
   db.save();
   if(c.intelligenceError===planningQuotaMessage)break;
  }
 }
}
