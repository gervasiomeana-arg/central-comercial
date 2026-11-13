import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export async function sendWithAck(client,job,onChat,timeoutMs=60000){
 const chat=await client.getNumberId(job.recipient);if(!chat)return {outcome:'rejected'};
 await onChat(chat._serialized);
 let id,resolveAck;const observed=new Map();const confirmation=new Promise(resolve=>{resolveAck=resolve;});
 const listener=(message,ack)=>{const key=message?.id?._serialized;if(!key)return;observed.set(key,ack);if(key===id&&(ack>=1||ack===-1))resolveAck(ack);};client.on('message_ack',listener);
 let timer;
 try{const sent=await client.sendMessage(chat._serialized,job.content);const chatId=typeof sent?.to==='string'&&/^[\w.-]+@(?:c\.us|lid)$/.test(sent.to)?sent.to:chat._serialized;await onChat(chatId);id=sent?.id?._serialized;let ack=observed.get(id)??sent?.ack;if(!(ack>=1||ack===-1))ack=await Promise.race([confirmation,new Promise(resolve=>{timer=setTimeout(()=>resolve(0),timeoutMs);})]);return {outcome:ack>=1?'accepted':ack===-1?'rejected':'unknown',ack,providerId:id,chatId};}
 finally{clearTimeout(timer);client.removeListener('message_ack',listener);}
}
export function commercialWhatsAppRunner({client,stateDir,call}){
 const file=path.join(stateDir,'commercial-outbox.json');
 const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{done:{},outcomes:{},routes:{},inbound:{}};
 const save=()=>{const fd=fs.openSync(file+'.tmp','w',0o600);try{fs.writeFileSync(fd,JSON.stringify(state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(file+'.tmp',file);};
 const inbound=async message=>{
  const chatId=message.from,providerId=message.id?._serialized;
  if(message.fromMe||!providerId||!state.routes[chatId]||!/@(?:c\.us|lid)$/.test(chatId)||typeof message.body!=='string'||!message.body.trim()||Object.keys(state.inbound).length>=100)return;
  state.inbound[providerId]={chatId,providerId,text:message.body.slice(0,30000)};save();
 };
 client.on('message',inbound);
 async function flush(){for(const [id,result]of Object.entries(state.outcomes)){try{await call('complete',result);}catch(error){if(error.httpStatus!==409)throw error;}delete state.outcomes[id];save();}}
 async function tick(){
  await flush();const routing=await call('routing');state.routes=Object.fromEntries(routing.routes.map(r=>[r.chatId,true]));save();
  for(const [id,message]of Object.entries(state.inbound)){try{await call('inbound',message);}catch(error){if(error.httpStatus!==409)throw error;}delete state.inbound[id];save();}
  const {job}=await call('claim');if(!job)return;
  const fingerprint=createHash('sha256').update(JSON.stringify([job.recipient,job.content])).digest('hex'),known=state.done[job.messageId];
  if(known){state.outcomes[job.messageId]={...job,...(known.fingerprint===fingerprint?known.result:{outcome:'unknown'})};save();await flush();return;}
  state.done[job.messageId]={fingerprint,result:{outcome:'unknown'}};state.outcomes[job.messageId]={...job,outcome:'unknown'};save();
  let result;
  try{result=await sendWithAck(client,job,async chatId=>{state.routes[chatId]=true;state.outcomes[job.messageId].chatId=chatId;state.done[job.messageId].result.chatId=chatId;save();});}catch{result={...state.done[job.messageId].result,outcome:'unknown'};}
  state.done[job.messageId]={fingerprint,result};state.outcomes[job.messageId]={...job,...result};save();await flush();
 }
 return {tick,close:()=>client.removeListener('message',inbound)};
}
