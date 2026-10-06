"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
export default function AutomationAudio({companyId,url,onChange,onBusyChange}:{companyId:string;url?:string;onChange:(audio:{url:string;mime:string;name:string})=>void;onBusyChange:(busy:boolean)=>void}) {
 const [recording,setRecording]=useState(false),[busy,setBusy]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState("");
 useEffect(()=>{onBusyChange(recording||busy);},[onBusyChange,recording,busy]);
 useEffect(()=>()=>onBusyChange(false),[onBusyChange]);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),alive=useRef(true),file=useRef<HTMLInputElement>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(recorder.current?.state==="recording")recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[recording]);
 useEffect(()=>{if(seconds>=60&&recorder.current?.state==="recording")recorder.current.stop();},[seconds]);
 async function upload(blob:Blob,name:string) {
  if(!supabase)return;setBusy(true);setError("");
  try {
   if(!blob.size||blob.size>10*1024*1024)throw Error("Use um áudio de até 10 MB.");
   if(!blob.type.startsWith("audio/"))throw Error("Escolha um arquivo de áudio.");
   const ext=blob.type.includes("mp4")?"m4a":blob.type.includes("ogg")?"ogg":blob.type.includes("mpeg")?"mp3":blob.type.includes("wav")?"wav":"webm";
   const path=`automations/${companyId}/${crypto.randomUUID()}.${ext}`;
   const {error:e}=await supabase.storage.from("wa-media").upload(path,blob,{contentType:blob.type});if(e)throw e;
   const {data}=supabase.storage.from("wa-media").getPublicUrl(path);
   if(alive.current)onChange({url:data.publicUrl,mime:blob.type,name});
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Falha ao salvar áudio.");}finally{if(alive.current)setBusy(false);}
 }
 async function record() {
  setError("");
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Este navegador não grava áudio. Use Adicionar arquivo.");return;}
  try {
   const media=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;
   const mime=["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(media,mime?{mimeType:mime}:undefined),chunks:BlobPart[]=[];recorder.current=rec;
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   rec.onerror=()=>{media.getTracks().forEach(t=>t.stop());if(alive.current){setRecording(false);setError("Não foi possível gravar. Tente novamente.");}};
   rec.onstop=()=>{media.getTracks().forEach(t=>t.stop());if(alive.current){setRecording(false);void upload(new Blob(chunks,{type:rec.mimeType}),"Áudio gravado");}};
   rec.start();setSeconds(0);setRecording(true);
  }catch{stream.current?.getTracks().forEach(t=>t.stop());setError("Permita o microfone para gravar ou adicione um arquivo.");}
 }
 return <div className="space-y-3">
  {url&&<audio controls src={url} className="w-full" aria-label="Prévia do áudio programado"/>}
  <div className="flex gap-2"><button disabled={busy} onClick={()=>recording?recorder.current?.stop():void record()} aria-label={recording?"Parar gravação":"Gravar áudio"} className={`flex-1 flex items-center justify-center gap-2 rounded-lg p-3 text-xs ${recording?"bg-red-600":"bg-emerald-600"}`}>{recording?<Square size={16}/>:<Mic size={16}/>} {recording?`Parar · ${seconds}s`:busy?"Salvando…":"Gravar áudio"}</button><button disabled={busy||recording} onClick={()=>file.current?.click()} className="rounded-lg bg-white/10 p-3" aria-label="Adicionar arquivo de áudio"><Upload size={16}/></button></div>
  <input ref={file} aria-label="Arquivo de áudio" type="file" accept="audio/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,f.name);e.target.value="";}}/>
  <p className="text-[11px] text-slate-400">Gravação de até 60 segundos ou arquivo de até 10 MB. Será enviado como nota de voz.</p>
  {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
 </div>;
}
