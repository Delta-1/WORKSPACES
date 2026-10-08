"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square, Trash2 } from "lucide-react";

/** A recording remains local until the user explicitly sends it. Key by conversation. */
export default function VoiceRecorder({ disabled, hidden, onSend, onRecordingChange }: {
 disabled: boolean; hidden: boolean; onSend: (file: File) => Promise<void>; onRecordingChange: (recording: boolean) => void;
}) {
 const [recording,setRecording]=useState(false); const [starting,setStarting]=useState(false);
 const [draft,setDraft]=useState<{file:File;url:string}|null>(null);
 const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [seconds,setSeconds]=useState(0);
 const recorder=useRef<MediaRecorder|null>(null); const stream=useRef<MediaStream|null>(null);
 const alive=useRef(false); const url=useRef<string|null>(null); const timer=useRef<ReturnType<typeof setInterval>|null>(null);
 useEffect(()=>{alive.current=true;return ()=>{
  alive.current=false;
  if(recorder.current){recorder.current.onstop=null;if(recorder.current.state!=="inactive")recorder.current.stop();}
  stream.current?.getTracks().forEach(t=>t.stop());
  if(timer.current)clearInterval(timer.current);
  if(url.current)URL.revokeObjectURL(url.current);
 };},[]);
 function discard(){if(url.current)URL.revokeObjectURL(url.current);url.current=null;setDraft(null);setError("");}
 async function start(){
  if(starting||disabled||busy)return;
  setStarting(true);setError("");
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")throw new Error("Este navegador não permite gravar. Use um navegador atualizado e HTTPS.");
   const input=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!alive.current){input.getTracks().forEach(t=>t.stop());return;}
   stream.current=input;
   const mime=["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4"].find(m=>MediaRecorder.isTypeSupported(m));
   const rec=new MediaRecorder(input,mime?{mimeType:mime}:undefined);recorder.current=rec;
   const chunks:Blob[]=[];let failed=false;
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   rec.onerror=()=>{failed=true;if(alive.current)setError("A gravação falhou. Grave novamente.");if(rec.state!=="inactive")rec.stop();};
   rec.onstop=()=>{
    input.getTracks().forEach(t=>t.stop());stream.current=null;
    if(timer.current)clearInterval(timer.current);timer.current=null;
    if(!alive.current)return;
    setRecording(false);onRecordingChange(false);
    const type=rec.mimeType||chunks[0]?.type||"audio/webm";
    const blob=new Blob(chunks,{type});
    if(failed||!blob.size){setError("Nenhum áudio foi capturado. Confira o microfone e grave novamente.");return;}
    if(blob.size>16*1024*1024){setError("Áudio muito grande. Grave um áudio menor (até 16 MB).");return;}
    const ext=type.includes("mp4")?"m4a":type.includes("ogg")?"ogg":"webm";
    const file=new File([blob],`audio-${Date.now()}.${ext}`,{type});
    url.current=URL.createObjectURL(file);setDraft({file,url:url.current});
   };
   rec.start(250);setRecording(true);onRecordingChange(true);setSeconds(0);
   const started=Date.now();timer.current=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);setSeconds(s);if(s>=600&&rec.state!=="inactive")rec.stop();},250);
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setError(e instanceof Error&&e.name!=="NotAllowedError"?e.message:"Permita o acesso ao microfone para gravar áudio.");}
  finally{if(alive.current)setStarting(false);}
 }
 async function send(){if(!draft||busy||disabled)return;setBusy(true);setError("");try{await onSend(draft.file);if(alive.current)discard();}catch(e){if(alive.current)setError(e instanceof Error?e.message:"Falha no envio. Seu áudio está aqui para tentar novamente.");}finally{if(alive.current)setBusy(false);}}
 return <>
  {!hidden&&!draft&&<button aria-label={recording?"Parar gravação":"Gravar áudio"} onClick={()=>recording?recorder.current?.stop():void start()} disabled={starting||busy||(!recording&&disabled)} className={`p-2.5 rounded-full shrink-0 disabled:opacity-50 ${recording?"bg-red-600 animate-pulse":"bg-white/10 hover:bg-white/20"}`}>{recording?<Square size={18}/>:<Mic size={18}/>}</button>}
  {(recording||draft||error)&&<div className="absolute bottom-full inset-x-2 mb-2 rounded-xl border border-white/15 bg-[#111826] p-3 shadow-2xl z-30" role="region" aria-label="Revisão do áudio">
   {recording?<div className="flex items-center justify-between gap-2 text-sm"><span className="text-red-300">● Gravando {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</span><button aria-label="Parar e revisar áudio" onClick={()=>recorder.current?.stop()} className="p-2 bg-red-600 rounded-lg"><Square size={16}/></button></div>:draft?<>
    <p className="text-xs text-gray-300 mb-2">Ouça o áudio antes de enviar e confira o microfone.</p>
    <audio aria-label="Ouvir áudio gravado" controls src={draft.url} className="w-full min-w-0 h-10"/>
    <div className="flex justify-between mt-2 gap-2"><button disabled={busy} onClick={discard} className="flex gap-2 items-center p-2 text-sm text-red-300"><Trash2 size={16}/>Descartar</button><button disabled={busy||disabled} onClick={()=>void send()} className="flex gap-2 items-center bg-emerald-600 rounded-lg p-2 text-sm disabled:opacity-50"><Send size={16}/>{busy?"Enviando…":"Enviar áudio"}</button></div>
   </>:null}
   {error&&<p role="alert" className="text-sm text-red-300 mt-2">{error}<button onClick={()=>setError("")} className="ml-2 underline">Fechar</button></p>}
  </div>}
 </>;
}
