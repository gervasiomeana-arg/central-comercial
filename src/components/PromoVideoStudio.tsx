import React,{useEffect,useRef,useState} from 'react';
import { api, authStorage } from '../api.js';
import type {Application} from '../types.js';

type Draft={appId:string;headline:string;cta:string;duration:number;approved:boolean};
const key='central-promo-video-drafts-v1';
export function PromoVideoStudio({applications}:{applications:Application[]}){
 const ready=applications.filter(a=>a.status==='lista'&&a.campaignsAllowed);
 const [drafts,setDrafts]=useState<Record<string,Draft>>(()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}});
 const [selected,setSelected]=useState(ready[0]?.id||'');
 const [recording,setRecording]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(0);
 const canvas=useRef<HTMLCanvasElement>(null);
 const footage=useRef<HTMLVideoElement>(null);
 const audio=useRef<HTMLAudioElement>(null);
 const [footageUrl,setFootageUrl]=useState('');
 const [audioUrl,setAudioUrl]=useState('');
 const [generated,setGenerated]=useState<{appId:string;url:string;scenes:number}|null>(null);
 const [videoApproved,setVideoApproved]=useState(false);
 const [scriptRequest,setScriptRequest]=useState<string|null>(null);
 const [script,setScript]=useState('');
 const [scriptBusy,setScriptBusy]=useState(false);
 const app=ready.find(a=>a.id===selected)||ready[0];
 const draft=app?(drafts[app.id]||{appId:app.id,headline:app.verifiedFeatures[0]?.slice(0,95)||app.name,cta:'Conocé más en '+app.website,duration:20,approved:false}):undefined;
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(drafts))}catch{}},[drafts]);
 useEffect(()=>()=>{if(generated)URL.revokeObjectURL(generated.url);},[generated]);
 const edit=(changes:Partial<Draft>)=>{if(!app||!draft)return;setVideoApproved(false);setGenerated(null);setDrafts(prev=>({...prev,[app.id]:{...draft,...changes,approved:false}}));};
 const draw=(ctx:CanvasRenderingContext2D,step:number,w=720,h=1280)=>{
   if(!app||!draft)return;
   const colors=['#102820','#183d32','#264a40','#132e27'];ctx.fillStyle=colors[step%colors.length];ctx.fillRect(0,0,w,h);
   if(footageUrl && footage.current && footage.current.readyState>=2){const v=footage.current;const scale=Math.max(w/v.videoWidth,h/v.videoHeight);const sw=w/scale,sh=h/scale;ctx.drawImage(v,(v.videoWidth-sw)/2,(v.videoHeight-sh)/2,sw,sh,0,0,w,h);ctx.fillStyle='rgba(8,22,22,.72)';ctx.fillRect(0,0,w,250);ctx.fillRect(0,1030,w,250);}

   ctx.fillStyle='#c5dbb5';ctx.font='bold 28px sans-serif';ctx.fillText('CENTRAL COMERCIAL',56,95);
   ctx.fillStyle='#fff';ctx.font='bold 56px sans-serif';
   const lines=(step===0?app.name:step===1?draft.headline:step===2?app.verifiedFeatures.slice(0,2).join(' · '):draft.cta).split(/\s+/);
   let y=360,line='';for(const word of lines){if(ctx.measureText(line+' '+word).width>610){ctx.fillText(line,56,y);line=word;y+=78;}else line+=(line?' ':'')+word;}ctx.fillText(line,56,y);
   ctx.fillStyle='#c5dbb5';ctx.font='26px sans-serif';ctx.fillText(step===3?'CONOCÉ LA APLICACIÓN':'PRESENTACIÓN · '+(step+1)+'/4',56,1130);
   ctx.fillStyle='#fff';ctx.font='24px sans-serif';ctx.fillText('Borrador para revisión · Sin publicación',56,1200);
 };
 useEffect(()=>{const c=canvas.current;if(c){const ctx=c.getContext('2d');if(ctx)draw(ctx,preview);}},[app?.id,draft?.headline,draft?.cta,preview]);
 const requestScript=async()=>{
   if(!app||!draft)return;
   setError('');setScript('');setScriptBusy(true);
   try{
     const result=await api.askAssistant(
       'Prepará un guion promocional de '+draft.duration+' segundos para '+app.name+
       '. Proponé un titular de hasta 95 caracteres, escenas con material verificable y un llamado a la acción de hasta 100 caracteres. Usá solo información comprobada.',
       app.id
     );
     setScriptRequest(result.id);
   }catch(e:any){setError(e.message);setScriptBusy(false);}
 };
 useEffect(()=>{
   if(!scriptRequest)return;
   let active=true;
   let timer:ReturnType<typeof setTimeout>;
   const refresh=async()=>{
     try{
       const state=await api.getAssistant();
       if(!active)return;
       const entry=state.entries.find(entry=>entry.id===scriptRequest);
       if(entry?.state==='completed'&&entry.source==='openjarvis'&&entry.answer&&
         !entry.model?.toLowerCase().includes('gemini')){
         setScript(entry.answer);setScriptBusy(false);setScriptRequest(null);
       }else if(!entry||entry.state==='failed'||entry.state==='completed'){
         setError(entry?.error||'No se obtuvo un guion de OpenJarvis. Revisá la conexión.');
         setScriptBusy(false);setScriptRequest(null);
       }else timer=setTimeout(refresh,5000);
     }catch(e:any){
       if(active){setError(e.message);setScriptBusy(false);setScriptRequest(null);}
     }
   };
   void refresh();
   return ()=>{active=false;clearTimeout(timer);};
 },[scriptRequest]);
 const captureAutomatic=async()=>{
   if(!app||!draft)return;
   setRecording(true);setError('');setVideoApproved(false);setGenerated(null);
   try{
     const token=authStorage.getToken();
     const response=await fetch('/api/promo/capture',{
       method:'POST',
       headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
       body:JSON.stringify({appId:app.id,url:app.website,headline:draft.headline,cta:draft.cta,duration:draft.duration})
     });
     if(!response.ok){
       const body=await response.json().catch(()=>({}));
       throw new Error(body.error||'No se pudo generar el MP4.');
     }
     if(!response.headers.get('Content-Type')?.startsWith('video/mp4'))throw new Error('El servidor no devolvió un MP4.');
     setGenerated({appId:app.id,url:URL.createObjectURL(await response.blob()),scenes:Number(response.headers.get('X-Promo-Scenes'))});
   }catch(e:any){setError(e.message||'No se pudo capturar la aplicación.');}
   finally{setRecording(false);}
 };
 const exportVideo=async()=>{const c=canvas.current;if(!c||!app||!draft)return;setError('');if(!('MediaRecorder'in window)||!c.captureStream){setError('Este navegador no permite grabar el video. Probá Chrome actualizado.');return;}
 if(!footageUrl){setError('No se obtuvo todavía una captura real. Utilizá «Capturar automáticamente la aplicación»; si falla, se mostrará el motivo.');return;}
 const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime){setError('No se encontró un formato WebM compatible.');return;}
 setRecording(true);
 try{const stream=c.captureStream(12),chunks:BlobPart[]=[];
 if(footage.current){footage.current.currentTime=0;await footage.current.play();}
 let audioContext:AudioContext|undefined;let audioSource:MediaElementAudioSourceNode|undefined;
 if(audioUrl&&audio.current){audioContext=new AudioContext();audioSource=audioContext.createMediaElementSource(audio.current);const dest=audioContext.createMediaStreamDestination();audioSource.connect(dest);dest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));audio.current.currentTime=0;await audio.current.play();}
 const rec=new MediaRecorder(stream,{mimeType:mime});
 rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 const finished=new Promise<void>((resolve,reject)=>{rec.onerror=()=>reject(new Error('Falló la grabación'));rec.onstop=()=>{const blob=new Blob(chunks,{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='central-'+app.slug+'-borrador.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);resolve();};});
 rec.start();const started=performance.now(),ms=draft.duration*1000;
 await new Promise<void>(resolve=>{const tick=()=>{const elapsed=performance.now()-started;const stage=Math.min(3,Math.floor(elapsed/ms*4));const ctx=c.getContext('2d');if(ctx)draw(ctx,stage);if(elapsed<ms)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
 rec.stop();await finished;stream.getTracks().forEach(t=>t.stop());footage.current?.pause();audio.current?.pause();if(audioContext)await audioContext.close();
 }catch(e:any){setError(e.message||'No se pudo crear el video.');}finally{setRecording(false);}};
 if(!app||!draft)return <p>No hay aplicaciones listas para promocionar.</p>;
 return <section className="cc-panel" style={{padding:24}}><p className="cc-eyebrow">CONTENIDO PROMOCIONAL · REVISIÓN OBLIGATORIA</p><h1>Videos cortos de tus aplicaciones</h1>
 <p>Creá un MP4 vertical de 15 a 30 segundos y revisalo antes de descargarlo. Los borradores de texto se guardan en este navegador.</p>
 <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:20}}>
 <div style={{flex:'1 1 280px',display:'grid',gap:12,alignContent:'start'}}>
 <label>Aplicación<select disabled={recording||scriptBusy} value={app.id} onChange={e=>{setScript('');setError('');setSelected(e.target.value);setPreview(0);setVideoApproved(false);setGenerated(null);if(footageUrl)URL.revokeObjectURL(footageUrl);setFootageUrl('');}}>{ready.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 <p><strong>Fuente de demostración:</strong> {app.website}. La captura automática visita páginas públicas de la aplicación; las funciones que requieren ingreso no se mostrarán sin autorización.</p>

 <label>Grabación propia para exportación WebM (opcional)<input type="file" accept="video/*" onChange={e=>{const f=e.target.files?.[0];if(f){if(footageUrl)URL.revokeObjectURL(footageUrl);setFootageUrl(URL.createObjectURL(f));edit({});}}}/></label>
 <label>Música para la exportación WebM (opcional)<input type="file" accept="audio/*" onChange={e=>{const f=e.target.files?.[0];if(f){if(audioUrl)URL.revokeObjectURL(audioUrl);setAudioUrl(URL.createObjectURL(f));edit({});}}}/></label>
 <p><small>Los archivos permanecen en este navegador. Cada aplicación requiere su propia grabación auténtica; el generador no inventa pantallas.</small></p>
 <button className="cc-button cc-button-secondary" disabled={recording||scriptBusy} onClick={requestScript}>{scriptBusy?'OpenJarvis está preparando el guion…':'Pedir guion a OpenJarvis'}</button>
 {script&&<p style={{whiteSpace:'pre-wrap'}}>{script}</p>}
 <label>Mensaje principal<textarea rows={4} maxLength={95} disabled={recording} value={draft.headline} onChange={e=>edit({headline:e.target.value})}/></label>
 <label>Cierre / llamado a la acción<textarea rows={3} maxLength={100} disabled={recording} value={draft.cta} onChange={e=>edit({cta:e.target.value})}/></label>
 <label>Duración<select disabled={recording} value={draft.duration} onChange={e=>edit({duration:Number(e.target.value)})}><option value={15}>15 segundos</option><option value={20}>20 segundos</option><option value={30}>30 segundos</option></select></label>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{[0,1,2,3].map(i=><button className="cc-button cc-button-secondary" key={i} onClick={()=>setPreview(i)}>Escena {i+1}</button>)}</div>
 <label><input type="checkbox" checked={draft.approved} onChange={e=>setDrafts(prev=>({...prev,[app.id]:{...draft,approved:e.target.checked}}))}/> Revisé y aprobé el guion</label>
 <button className="cc-button cc-button-primary" disabled={!draft.approved||recording} onClick={captureAutomatic}>{recording?'Generando video…':'Generar MP4 con escenas públicas'}</button>
 {footageUrl&&<button className="cc-button cc-button-secondary" disabled={!draft.approved||recording} onClick={exportVideo}>Exportar grabación propia como WebM</button>}
 {error&&<p role="alert">{error}</p>}

 </div><div style={{flex:'0 1 260px'}}>
 {generated?.appId===app.id&&<div>
   <p>{generated.scenes} escenas de secciones públicas</p>
   <video src={generated.url} controls playsInline style={{width:'100%',aspectRatio:'9/16',borderRadius:16}}/>
   <label><input type="checkbox" checked={videoApproved} onChange={e=>setVideoApproved(e.target.checked)}/> Revisé y aprobé este MP4</label>
   {videoApproved&&<a className="cc-button cc-button-secondary" href={generated.url} download={`central-${app.slug}.mp4`}>Descargar MP4</a>}
 </div>}
 <video ref={footage} src={footageUrl} muted playsInline preload="auto" style={{display:'none'}}/><audio ref={audio} src={audioUrl} preload="auto"/><canvas ref={canvas} width={720} height={1280} aria-label="Vista previa de escena del video" style={{width:'100%',maxWidth:300,aspectRatio:'9/16',borderRadius:16}}/></div></div>
 </section>;
}
