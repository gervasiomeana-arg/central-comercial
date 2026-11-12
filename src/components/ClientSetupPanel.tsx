import React from 'react';
import { CheckCircle2, Circle, ArrowUpRight } from 'lucide-react';
import type { Application, Client, ClientSubscription, Contact, PaymentRecord } from '../types.js';

export function ClientSetupPanel({client, contacts, applications, subscriptions, payments, selectedApp, onPlan, onPayment}: {
  client: Client; contacts: Contact[]; applications: Application[]; subscriptions: ClientSubscription[]; payments: PaymentRecord[];
  selectedApp: string; onPlan: (appId:string)=>void; onPayment: (appId:string,subscription?:ClientSubscription)=>void;
}) {
  const contact=contacts.find(c=>c.id===client.contactId);
  const relatedApps=applications.filter(app=>(selectedApp==='all'||selectedApp===app.id) && (contact?.interestedAppIds?.includes(app.id)||subscriptions.some(s=>s.clientId===client.id&&s.appId===app.id)||payments.some(p=>p.clientId===client.id&&p.appId===app.id)));
  if(!relatedApps.length)return null;
  return <section className="cc-client-setup" aria-label="Incorporación del cliente"><p className="cc-eyebrow">INCORPORACIÓN DEL CLIENTE</p><h3>De la consulta al primer pago</h3>
    {relatedApps.map(app=>{
      const subscription=subscriptions.find(s=>s.clientId===client.id&&s.appId===app.id&&['activa','en_prueba'].includes(s.status));
      const paid=payments.some(p=>p.clientId===client.id&&p.appId===app.id&&p.status==='confirmado'&&p.reviewedAt&&p.amount>0);
      const pending=payments.filter(p=>p.clientId===client.id&&p.appId===app.id&&p.status==='pendiente_confirmacion_manual').length;
      const steps=[{label:'Ficha registrada',done:true},{label:subscription?`${subscription.planName} · ${subscription.currency} ${subscription.agreedAmount}`:'Plan por acordar',done:Boolean(subscription)},{label:paid?'Primer pago confirmado':pending?`${pending} pago(s) para revisar`:'Primer pago pendiente',done:paid}];
      return <article key={app.id}><div className="cc-client-setup-heading"><strong>{app.name}</strong><span>{!app.campaignsAllowed||app.status!=='lista'?'En desarrollo o pausada':paid?'Con pago confirmado':subscription?'Plan registrado':'Ficha abierta'}</span></div>
        <ol>{steps.map((step,index)=><li key={index} className={step.done?'is-complete':''}>{step.done?<CheckCircle2 size={15}/>:<Circle size={15}/>}<span>{step.label}</span></li>)}</ol>
        {app.status==='lista'&&app.campaignsAllowed&&(!subscription?<button className="cc-text-button" onClick={()=>onPlan(app.id)}>Elegir plan <ArrowUpRight size={14}/></button>:!paid&&!pending?<button className="cc-text-button" onClick={()=>onPayment(app.id,subscription)}>Registrar pago para revisión <ArrowUpRight size={14}/></button>:null)}
      </article>;
    })}
    <small>La ficha no suma una venta ni habilita el acceso en otra app. La meta avanza con tu confirmación del primer pago.</small>
  </section>;
}
