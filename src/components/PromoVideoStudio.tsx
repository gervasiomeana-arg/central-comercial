import React,{useEffect,useRef,useState} from 'react';
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
 const app=ready.find(a=>a.id===selected)||ready[0];
 const draft=app?(drafts[app.id]||{appId:app.id,headline:app.description,cta:'Conocé más en '+app.website,duration:20,approved:false}):undefined;
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(drafts))}catch{}},[drafts]);
 const edit=(changes:Partial<Draft>)=>{if(!app||!draft)return;setDrafts(prev=>({...prev,[app.id]:{...draft,...changes,approved:false}}));};
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
 const captureAutomatic=async()=>{if(!app)return;setRecording(true);setError('');try{const response=await fetch('/api/promo/capture',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({url:app.website})});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'No se pudo capturar la web.');}const blob=await response.blob();if(footageUrl)URL.revokeObjectURL(footageUrl);setFootageUrl(URL.createObjectURL(blob));}catch(e:any){setError(e.message||'No se pudo capturar la aplicación.');}finally{setRecording(false);}};
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
 <p>Creá un video vertical de 15 a 30 segundos en WebM para revisar. No se envía ni publica automáticamente. Los borradores de texto se guardan solo en este navegador.</p>
 <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:20}}>
 <div style={{flex:'1 1 280px',display:'grid',gap:12,alignContent:'start'}}>
 <label>Aplicación<select value={app.id} onChange={e=>{setSelected(e.target.value);setPreview(0);}}>{ready.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 <p><strong>Fuente de demostración:</strong> {app.website}. La captura automática visita páginas públicas de la aplicación; las funciones que requieren ingreso no se mostrarán sin autorización.</p>
 <button className="cc-button cc-button-secondary" disabled={recording} onClick={captureAutomatic}>{recording?'Capturando la web…':'Capturar automáticamente la aplicación'}</button>
 <label>Grabación real de la aplicación (alternativa opcional)<input type="file" accept="video/*" onChange={e=>{const f=e.target.files?.[0];if(f){if(footageUrl)URL.revokeObjectURL(footageUrl);setFootageUrl(URL.createObjectURL(f));edit({});}}}/></label>
 <label>Música instrumental con derechos de uso (opcional)<input type="file" accept="audio/*" onChange={e=>{const f=e.target.files?.[0];if(f){if(audioUrl)URL.revokeObjectURL(audioUrl);setAudioUrl(URL.createObjectURL(f));edit({});}}}/></label>
 <p><small>Los archivos permanecen en este navegador. Cada aplicación requiere su propia grabación auténtica; el generador no inventa pantallas.</small></p>
 <label>Mensaje principal<textarea rows={4} value={draft.headline} onChange={e=>edit({headline:e.target.value})}/></label>
 <label>Cierre / llamado a la acción<textarea rows={3} value={draft.cta} onChange={e=>edit({cta:e.target.value})}/></label>
 <label>Duración<select value={draft.duration} onChange={e=>edit({duration:Number(e.target.value)})}><option value={15}>15 segundos</option><option value={20}>20 segundos</option><option value={30}>30 segundos</option></select></label>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{[0,1,2,3].map(i=><button className="cc-button cc-button-secondary" key={i} onClick={()=>setPreview(i)}>Escena {i+1}</button>)}</div>
 <label><input type="checkbox" checked={draft.approved} onChange={e=>setDrafts(prev=>({...prev,[app.id]:{...draft,approved:e.target.checked}}))}/> Revisé y aprobé el guion</label>
 <button className="cc-button cc-button-primary" disabled={!draft.approved||recording} onClick={exportVideo}>{recording?'Generando video…':'Generar video WebM para revisar'}</button>
 {error&&<p role="alert">{error}</p>}
 <p><small>Instagram, Facebook, YouTube y X suelen requerir formatos, permisos y conexiones diferentes. Este módulo no publica, no envía mensajes y no convierte a MP4. Podés revisar el WebM antes de decidir dónde compartirlo.</small></p>
 </div><div style={{flex:'0 1 260px'}}><video ref={footage} src={footageUrl} muted playsInline preload="auto" style={{display:'none'}}/><audio ref={audio} src={audioUrl} preload="auto"/><canvas ref={canvas} width={720} height={1280} aria-label="Vista previa de escena del video" style={{width:'100%',maxWidth:300,aspectRatio:'9/16',borderRadius:16}}/></div></div>
 </section>;
}
