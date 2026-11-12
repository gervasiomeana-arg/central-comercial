import type { Application, Client } from './types.js';
const key=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function clientCatalogPlans(app: Application | undefined, client: Client | undefined) {
  const country=key(client?.country||'');
  return app?.plans.filter(plan=>{
    if(!plan.verified||plan.archived||plan.price===null)return false;
    const market=key(plan.market||'');
    if(!market||market==='todos')return true;
    if(market==='general, excepto brasil')return country!==''&&country!=='brasil';
    return market===country;
  })||[];
}
