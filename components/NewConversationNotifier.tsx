"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, CheckCheck, MessageSquare, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { contactDisplayName } from "@/lib/attendance";
import type { Profile } from "@/lib/types";

type Notice = { id:string; title:string; body:string; at:string; kind:"queue"|"whatsapp"|"team"; phone?:string; numberId?:string };
type ContactInfo = { saved_name:string|null; name:string|null; push_name:string|null; phone:string|null; jid:string|null };
type QueueRow = {id:string;number_id:string;created_at:string;last_message_at:string|null;last_message:string|null;contacts:ContactInfo|ContactInfo[]|null};
type MessageRow = {id:string;text:string|null;at:string;media_type:string|null;conversations:{number_id:string;contacts:ContactInfo|ContactInfo[]|null}|{number_id:string;contacts:ContactInfo|ContactInfo[]|null}[]};
const first = <T,>(value:T|T[]|null):T|null => Array.isArray(value)?value[0]??null:value;
const MUTE_KEY="notif:muted";

/** The inbox stays in the header; it never opens a popup or requests OS notifications. */
export default function NewConversationNotifier({profile,onOpen}:{profile:Profile;onOpen:(target?:{phone:string;name:string;numberId?:string})=>void}){
 const [open,setOpen]=useState(false);const [items,setItems]=useState<Notice[]>([]);
 const [read,setRead]=useState<Set<string>>(new Set());const [muted,setMuted]=useState(false);
 const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const panel=useRef<HTMLDivElement>(null);const button=useRef<HTMLButtonElement>(null);
 const mutedRef=useRef(false);const previous=useRef<Set<string>|null>(null);const audio=useRef<AudioContext|null>(null);
 const scope=`notifications:v1:${profile.company_id}:${profile.id}`;
 const numbers=useRef<{ids:string[];expires:number}|null>(null);
 const running=useRef(false);const alive=useRef(false);
 useEffect(()=>{
  alive.current=true;
  let ids:string[]=[];let savedMuted=false;
  try{const saved=JSON.parse(localStorage.getItem(scope)||"[]");ids=Array.isArray(saved)?saved.filter(id=>typeof id==="string"):[];savedMuted=localStorage.getItem(MUTE_KEY)==="1";}catch{}
  mutedRef.current=savedMuted;queueMicrotask(()=>{if(alive.current){setRead(new Set(ids));setMuted(savedMuted);}});
  const storage=(e:StorageEvent)=>{if(e.key===MUTE_KEY){mutedRef.current=e.newValue==="1";setMuted(mutedRef.current);}if(e.key===scope){try{const ids=JSON.parse(e.newValue||"[]");if(Array.isArray(ids))setRead(new Set(ids.filter(id=>typeof id==="string")));}catch{}}};
  window.addEventListener("storage",storage);
  return()=>{alive.current=false;window.removeEventListener("storage",storage);void audio.current?.close();};
 },[scope]);
 function mark(ids:string[]){const next=new Set([...read,...ids].slice(-1000));setRead(next);try{localStorage.setItem(scope,JSON.stringify([...next]));window.dispatchEvent(new StorageEvent("storage",{key:scope,newValue:JSON.stringify([...next])}));}catch{}}
 function toggleSound(){const v=!mutedRef.current;mutedRef.current=v;setMuted(v);try{localStorage.setItem(MUTE_KEY,v?"1":"0");window.dispatchEvent(new StorageEvent("storage",{key:MUTE_KEY,newValue:v?"1":"0"}));}catch{}}
 function chime(){try{audio.current??=new AudioContext();const ctx=audio.current;void ctx.resume();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(0.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.25);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.3);}catch{}}
 const check=useCallback(async()=>{
  if(!supabase||!profile.company_id||running.current)return;
  running.current=true;
  try{
   const client=supabase;
   if(!numbers.current||numbers.current.expires<Date.now()){
    const {data,error}=await client.from("whatsapp_numbers").select("id").eq("company_id",profile.company_id);
    if(error)throw error;
    const allowed=await Promise.all((data??[]).map(async n=>{const {data:ok,error}=await client.rpc("can_access_number",{nid:n.id});if(error)throw error;return ok?n.id:null;}));
    numbers.current={ids:allowed.filter((id):id is string=>!!id),expires:Date.now()+60000};
   }
   const ids=numbers.current.ids;const since=new Date(Date.now()-7*86400000).toISOString();
   const [queue,messages,team]=await Promise.all([
    ids.length?client.from("conversations").select("id,number_id,created_at,last_message_at,last_message,contacts(saved_name,name,push_name,phone,jid)").eq("company_id",profile.company_id).in("number_id",ids).eq("status","espera").order("last_message_at",{ascending:false,nullsFirst:false}).limit(200):Promise.resolve({data:[],error:null}),
    ids.length?client.from("whatsapp_messages").select("id,text,at,media_type,conversations!inner(company_id,number_id,contacts(saved_name,name,push_name,phone,jid))").eq("conversations.company_id",profile.company_id).in("conversations.number_id",ids).eq("direction","in").gte("at",since).order("at",{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
    client.from("internal_messages").select("id,text,at").eq("recipient_id",profile.id).eq("company_id",profile.company_id).gte("at",since).order("at",{ascending:false}).limit(100),
   ]);
   for(const result of [queue,messages,team])if(result.error)throw result.error;
   const rows:Notice[]=[
    ...((queue.data??[]) as unknown as QueueRow[]).map(c=>{const contact=first(c.contacts);return {id:`queue:${c.id}`,title:`Aguardando: ${contactDisplayName(contact)}`,body:c.last_message||"Cliente aguardando atendimento",at:c.last_message_at||c.created_at,kind:"queue" as const,phone:contact?.phone||undefined,numberId:c.number_id};}),
    ...((messages.data??[]) as unknown as MessageRow[]).map(m=>{const contact=first(first(m.conversations)?.contacts??null);return {id:`whatsapp:${m.id}`,title:contactDisplayName(contact),body:m.text||({audio:"Áudio recebido",video:"Vídeo recebido",image:"Foto recebida",sticker:"Figurinha recebida",document:"Arquivo recebido"}[m.media_type||""]||"Nova mensagem"),at:m.at,kind:"whatsapp" as const,phone:contact?.phone||undefined,numberId:first(m.conversations)?.number_id};}),
    ...(team.data??[]).map(m=>({id:`team:${m.id}`,title:"Mensagem da equipe",body:m.text||"Nova mensagem interna",at:m.at,kind:"team" as const})),
   ].sort((a,b)=>b.at.localeCompare(a.at));
   if(!alive.current)return;
   if(previous.current&&rows.some(row=>!previous.current!.has(row.id))&&!mutedRef.current)chime();
   previous.current=new Set(rows.map(row=>row.id));setItems(rows);setError("");
  }catch{if(alive.current)setError("Não consegui atualizar as notificações. Tente novamente.");}
  finally{running.current=false;if(alive.current)setLoading(false);}
 },[profile.company_id,profile.id]);
 useEffect(()=>{
  void check();const interval=setInterval(check,15000);
  const refresh=()=>void check();window.addEventListener("focus",refresh);
  const channel=supabase?.channel(`notifications:${profile.company_id}:${profile.id}`)
   .on("postgres_changes",{event:"*",schema:"public",table:"conversations",filter:`company_id=eq.${profile.company_id}`},refresh)
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"whatsapp_messages",filter:`company_id=eq.${profile.company_id}`},refresh)
   .on("postgres_changes",{event:"INSERT",schema:"public",table:"internal_messages",filter:`recipient_id=eq.${profile.id}`},refresh).subscribe();
  return()=>{clearInterval(interval);window.removeEventListener("focus",refresh);if(channel&&supabase)void supabase.removeChannel(channel);};
 },[check,profile.company_id,profile.id]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!panel.current?.contains(e.target as Node)&&!button.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);button.current?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[open]);
 const unread=items.filter(item=>!read.has(item.id)).length;
 return <div className="relative shrink-0">
  <button ref={button} aria-label={`Notificações${unread?`: ${unread} não lidas`:""}`} aria-expanded={open} aria-controls="workspace-notifications" title="Notificações" onClick={()=>{setOpen(v=>!v);void check();}} className="relative p-2 rounded-lg border border-white/10 hover:bg-white/10"><Bell size={20}/>{unread>0&&<span className="absolute -top-1 -right-1 min-w-4 px-1 h-4 text-[9px] flex items-center justify-center rounded-full bg-red-600 text-white">{unread>99?"99+":unread}</span>}</button>
  {open&&<div ref={panel} id="workspace-notifications" role="dialog" aria-label="Central de notificações" className="fixed top-[4.25rem] right-2 sm:right-6 w-[calc(100vw-1rem)] sm:w-96 max-h-[calc(100dvh-5rem)] flex flex-col rounded-2xl border border-white/15 bg-[#111826] text-slate-100 shadow-2xl z-[150]">
   <div className="flex justify-between items-center gap-2 p-4 border-b border-white/10"><h3 className="font-semibold">Notificações</h3><button aria-label="Fechar notificações" onClick={()=>setOpen(false)}><X size={18}/></button></div>
   <div className="flex justify-between gap-2 p-3 text-xs border-b border-white/10"><button disabled={!unread} onClick={()=>mark(items.map(item=>item.id))} className="flex items-center gap-1 disabled:opacity-40"><CheckCheck size={15}/>Marcar todas como lidas</button><button onClick={toggleSound} aria-label={muted?"Ativar som de notificações":"Silenciar notificações"} className="p-1">{muted?<BellOff size={16}/>:<Bell size={16}/>}</button></div>
   {error&&<div role="alert" className="px-4 py-2 text-xs text-amber-300">{error}<button onClick={()=>void check()} className="underline ml-2">Tentar novamente</button></div>}
   <div className="overflow-y-auto min-h-0 flex-1" aria-busy={loading}>{loading?<p className="text-sm p-6 text-center">Carregando…</p>:!items.length?<p className="text-sm p-6 text-center text-slate-400">Nenhuma notificação por enquanto.</p>:items.map(item=><button key={item.id} onClick={()=>{mark([item.id]);setOpen(false);onOpen(item.phone?{phone:item.phone,name:item.title.replace(/^Aguardando: /,""),numberId:item.numberId}:undefined);}} className={`w-full text-left p-3 flex gap-3 border-b border-white/5 hover:bg-white/10 ${read.has(item.id)?"opacity-65":"bg-emerald-500/5"}`}>
    <span className={`mt-1 shrink-0 ${item.kind==="queue"?"text-amber-300":"text-emerald-300"}`}>{item.kind==="team"?<Users size={17}/>:<MessageSquare size={17}/>}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-medium text-sm"><span className="truncate">{item.title}</span>{!read.has(item.id)&&<span aria-label="Não lida" className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"/>}</span><span className="block text-xs text-slate-300 break-words line-clamp-2">{item.body.slice(0,160)}</span><time dateTime={item.at} className="block mt-1 text-[10px] text-slate-400">{new Date(item.at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</time></span>
   </button>)}</div>
   <div className="p-3 border-t border-white/10"><p className="text-[10px] text-slate-400 mb-2">Fila atual e mensagens recentes dos últimos 7 dias.</p><button onClick={()=>{setOpen(false);onOpen();}} className="w-full rounded-lg bg-emerald-600 p-2 text-xs font-medium">Abrir Mensagens</button></div>
  </div>}
 </div>;
}
