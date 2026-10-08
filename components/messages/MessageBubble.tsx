"use client";
import { useEffect, useState } from "react";
import { Download, Forward, FileText, X } from "lucide-react";
import { messageAuthHeaders } from "@/lib/message-auth";
import { safeMediaName } from "@/lib/whatsapp-media";
import type { WhatsappMediaType } from "@/lib/types";
export default function MessageBubble({mine,at,text,mediaUrl,mediaType,mediaName,mediaMime,messageId,onForward,onSaveSticker}:{mine:boolean;at:string;text:string|null;mediaUrl?:string|null;mediaType?:WhatsappMediaType|null;mediaName?:string|null;mediaMime?:string|null;messageId?:string;onForward?:()=>void;onSaveSticker?:()=>Promise<void>}){
 const [viewer,setViewer]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const name=safeMediaName(mediaName,mediaType,mediaMime);
 const time=new Date(at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
 async function download(){
  if(!messageId||busy)return;setBusy(true);setError("");
  try{const res=await fetch(`/api/whatsapp/media/${encodeURIComponent(messageId)}`,{headers:await messageAuthHeaders()});
   if(!res.ok){const data=await res.json();throw new Error(data.error||"Não consegui baixar o arquivo.");}
   const blob=await res.blob();const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){setError(e instanceof Error?e.message:"Erro ao baixar. Tente novamente.");}finally{setBusy(false);}
 }
 return <div className={`flex ${mine?"justify-end":"justify-start"}`}><div className={`min-w-0 max-w-[90%] md:max-w-[72%] rounded-2xl px-3 py-2 text-sm ${mine?"bg-emerald-700 text-white":"bg-[#1c232e]"}`}>
  {mediaUrl&&(mediaType==="image"||mediaType==="sticker")&&<button aria-label={`Abrir ${mediaType==="sticker"?"figurinha":"foto"}`} onClick={()=>setViewer(true)} className="block max-w-full">
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={mediaUrl} alt={mediaName|| (mediaType==="sticker"?"Figurinha":"Foto recebida")} loading="lazy" className="rounded-lg max-w-full max-h-60 object-contain mb-1" onError={()=>setError("Imagem indisponível. Tente baixar o arquivo.")}/>
  </button>}
  {mediaUrl&&mediaType==="audio"&&<audio aria-label="Ouvir áudio da mensagem" src={mediaUrl} controls preload="none" className="w-[240px] max-w-full mb-1" onError={()=>setError("Não consegui reproduzir o áudio. Tente baixar o arquivo.")}/>}
  {mediaUrl&&mediaType==="video"&&<><video aria-label="Vídeo da mensagem" src={mediaUrl} controls playsInline preload="metadata" className="w-full max-h-60 rounded-lg mb-1" onError={()=>setError("Não consegui reproduzir o vídeo. Tente baixar o arquivo.")}/><button onClick={()=>setViewer(true)} className="underline text-xs">Ampliar vídeo</button></>}
  {mediaUrl&&mediaType==="document"&&<a href={mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-black/15 p-3 mb-1"><FileText size={20} className="shrink-0"/><span className="break-all">{name}</span></a>}
  {text&&<p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</p>}
  {error&&<p role="alert" className="text-xs text-amber-200 my-1">{error}</p>}
  {onSaveSticker&&<button onClick={()=>void onSaveSticker()} className="block text-[11px] underline py-1">Salvar figurinha</button>}
  <div className="flex items-center justify-end gap-2 mt-1 flex-wrap">
   {mediaUrl&&messageId&&<button aria-label={`Baixar ${name}`} disabled={busy} onClick={()=>void download()} className="flex items-center gap-1 text-[11px] p-1 hover:bg-white/10 rounded disabled:opacity-50"><Download size={14}/>{busy?"Baixando…":"Baixar"}</button>}
   {onForward&&<button aria-label="Encaminhar mensagem" onClick={onForward} className="flex items-center gap-1 text-[11px] p-1 hover:bg-white/10 rounded"><Forward size={14}/>Encaminhar</button>}
   <span className={`text-[10px] ${mine?"text-emerald-100/70":"text-gray-400"}`}>{time}</span>
  </div>
  {viewer&&mediaUrl&&<MediaViewer src={mediaUrl} type={mediaType} name={name} onClose={()=>setViewer(false)}/>}
 </div></div>;
}
function MediaViewer({src,type,name,onClose}:{src:string;type?:WhatsappMediaType|null;name:string;onClose:()=>void}){
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape);},[onClose]);
 return <div role="dialog" aria-modal="true" aria-label="Visualizar mídia" className="fixed inset-0 z-[120] bg-black/95 flex flex-col p-3 md:p-6" onClick={onClose}>
  <div className="flex justify-between items-center gap-3 mb-3"><span className="truncate text-sm">{name}</span><button autoFocus aria-label="Fechar visualização" onClick={onClose} className="p-2 rounded-lg bg-white/10"><X size={22}/></button></div>
  <div className="flex-1 min-h-0 grid place-items-center" onClick={e=>e.stopPropagation()}>{type==="video"?<video src={src} controls playsInline autoPlay className="max-h-full max-w-full"/>:
   /* eslint-disable-next-line @next/next/no-img-element */
   <img src={src} alt={name} className="max-h-full max-w-full object-contain"/>}</div>
 </div>;
}
