"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
type Sticker={id:string;title:string;url:string;created_by:string|null};
export async function saveReceivedSticker(profile:Profile,url:string) {
 if(!supabase||!profile.company_id)return;
 const {error}=await supabase.from("whatsapp_stickers").upsert({company_id:profile.company_id,created_by:profile.id,title:"Figurinha salva",url},{onConflict:"company_id,url",ignoreDuplicates:true});
 if(error)throw new Error(error.message);
}
async function toWebp(file:File):Promise<Blob> {
 if(file.type==="image/webp")return file; // Preserves animated WebP.
 if(!["image/png","image/jpeg"].includes(file.type))throw new Error("Escolha WebP, PNG ou JPG. Para animação, use WebP.");
 const bitmap=await createImageBitmap(file);const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;
 const ctx=canvas.getContext("2d");if(!ctx){bitmap.close();throw new Error("Não consegui converter a imagem.");}
 const scale=Math.min(512/bitmap.width,512/bitmap.height);
 ctx.drawImage(bitmap,(512-bitmap.width*scale)/2,(512-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);bitmap.close();
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Falha na conversão.")),"image/webp",0.85));
}
export default function StickersPicker({profile,onSend,onClose}:{profile:Profile;onSend:(media:{type:"sticker";url:string;name:string;mime:string})=>Promise<void>;onClose:()=>void}) {
 const [rows,setRows]=useState<Sticker[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [query,setQuery]=useState("");const fileRef=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{if(!supabase)return;const {data,error:e}=await supabase.from("whatsapp_stickers").select("*").eq("company_id",profile.company_id).order("created_at",{ascending:false}).limit(300);setRows(data??[]);if(e)setError(e.message);},[profile.company_id]);
 useEffect(()=>{void Promise.resolve().then(load);},[load]);
 async function upload(file:File) {
  if(!supabase||!profile.company_id)return;
  setBusy(true);setError("");
  try {
   if(file.size>1024*1024)throw new Error("A figurinha deve ter no máximo 1 MB.");
   const blob=await toWebp(file);const path=`stickers/${profile.company_id}/${crypto.randomUUID()}.webp`;
   const {error:e}=await supabase.storage.from("wa-media").upload(path,blob,{contentType:"image/webp"});if(e)throw e;
   const {data}=supabase.storage.from("wa-media").getPublicUrl(path);
   const {error:insertError}=await supabase.from("whatsapp_stickers").insert({company_id:profile.company_id,created_by:profile.id,title:file.name.replace(/\.[^.]+$/,"").slice(0,100),url:data.publicUrl});if(insertError){await supabase.storage.from("wa-media").remove([path]);throw insertError;}
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Falha ao salvar figurinha.");}finally{setBusy(false);}
 }
 async function send(row:Sticker) {setBusy(true);setError("");try{await onSend({type:"sticker",url:row.url,name:"figurinha.webp",mime:"image/webp"});onClose();}catch(e){setError(e instanceof Error?e.message:"Falha no envio.");}finally{setBusy(false);}}
 async function remove(row:Sticker){if(!supabase||!confirm("Remover esta figurinha do banco da empresa?"))return;const {error:e}=await supabase.from("whatsapp_stickers").delete().eq("id",row.id);if(e)setError(e.message);else await load();}
 return <div className="fixed inset-0 z-[100] bg-black/70 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Figurinhas"><div className="bg-[#111826] rounded-xl p-4 w-full max-w-lg max-h-[85dvh] flex flex-col gap-3">
  <div className="flex justify-between"><h3 className="font-bold">Figurinhas da empresa</h3><button aria-label="Fechar figurinhas" disabled={busy} onClick={onClose}>✕</button></div>
  <input aria-label="Pesquisar figurinha" placeholder="Pesquisar figurinha…" value={query} onChange={e=>setQuery(e.target.value)} className="p-2 rounded-lg bg-white/5"/>
  {error&&<p role="alert" className="text-red-300 text-xs">{error}</p>}
  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 overflow-y-auto min-h-24">{rows.filter(r=>r.title.toLowerCase().includes(query.toLowerCase())).map(r=><div key={r.id} className="rounded-lg p-1 bg-white/5"><button disabled={busy} onClick={()=>void send(r)} title={`Enviar ${r.title}`} className="w-full"><img src={r.url} alt={r.title} className="w-full h-20 object-contain"/><span className="text-[10px] truncate block">{r.title}</span></button>{(r.created_by===profile.id||profile.role==="gestor")&&<button onClick={()=>void remove(r)} className="text-[10px] text-gray-400">Remover</button>}</div>)}</div>
  {!rows.length&&<p className="text-xs text-gray-400">Salve uma figurinha recebida na conversa ou adicione uma imagem.</p>}
  <input ref={fileRef} type="file" accept="image/webp,image/png,image/jpeg" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value="";}}/>
  <button disabled={busy} onClick={()=>fileRef.current?.click()} className="p-3 rounded-lg bg-emerald-600">{busy?"Aguarde…":"Adicionar figurinha"}</button>
 </div></div>;
}
