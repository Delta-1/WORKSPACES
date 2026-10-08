"use client";
import { useEffect, useState } from "react";
import { FileText, Send, X } from "lucide-react";
export default function AttachmentPreview({file,caption,onSend,onClose,disabled}:{file:File;caption:string;onSend:(file:File,caption:string)=>Promise<void>;onClose:()=>void;disabled:boolean}){
 const [url,setUrl]=useState("");const [text,setText]=useState(caption);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 useEffect(()=>{const src=URL.createObjectURL(file);let alive=true;queueMicrotask(()=>{if(alive)setUrl(src);});return()=>{alive=false;URL.revokeObjectURL(src);};},[file]);
 async function send(){if(busy||disabled)return;setBusy(true);setError("");try{await onSend(file,text);onClose();}catch(e){setError(e instanceof Error?e.message:"Falha ao enviar. Tente novamente.");}finally{setBusy(false);}}
 return <div role="dialog" aria-modal="true" aria-label="Revisar anexo" className="fixed inset-0 z-[110] bg-black/80 grid place-items-center p-3"><div className="bg-[#111826] rounded-2xl p-4 w-full max-w-xl max-h-[90dvh] overflow-y-auto border border-white/15">
  <div className="flex items-center justify-between gap-3 mb-3"><h3 className="font-semibold min-w-0 break-all">{file.name}</h3><button aria-label="Descartar anexo" disabled={busy} onClick={onClose}><X size={20}/></button></div>
  <p className="text-xs text-gray-400 mb-3">{(file.size/1024/1024).toFixed(2)} MB • Confira antes de enviar</p>
  {/* eslint-disable-next-line @next/next/no-img-element */}
  {file.type.startsWith("image/")?<img alt={file.name} src={url} className="w-full max-h-[50dvh] object-contain rounded-lg"/>:file.type.startsWith("video/")?<video aria-label="Prévia do vídeo" src={url} controls playsInline className="w-full max-h-[50dvh] rounded-lg"/>:file.type.startsWith("audio/")?<audio aria-label="Prévia do áudio" src={url} controls className="w-full"/>:<div className="flex items-center gap-3 bg-white/5 p-4 rounded-lg"><FileText/><span className="break-all">{file.name}</span></div>}
  <textarea aria-label="Legenda do anexo" value={text} onChange={e=>setText(e.target.value)} placeholder="Legenda (opcional)" className="w-full bg-black/20 rounded-lg p-3 mt-3 text-sm" disabled={busy}/>
  {error&&<p role="alert" className="text-sm text-red-300 my-2">{error}</p>}
  <button disabled={busy||disabled} onClick={()=>void send()} className="w-full flex justify-center items-center gap-2 bg-emerald-600 rounded-lg p-3 disabled:opacity-50"><Send size={18}/>{busy?"Enviando…":"Enviar anexo"}</button>
 </div></div>;
}
