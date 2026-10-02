"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { contactDisplayName } from "@/lib/attendance";
import type { Contact, WhatsappNumber } from "@/lib/types";
export default function ContactsPicker({ companyId, numbers, initialNumber, onSelect, onNew, onClose }: {
 companyId: string; numbers: WhatsappNumber[]; initialNumber: string | null;
 onSelect: (contact: Contact, numberId: string) => Promise<void>; onNew: () => void; onClose: () => void;
}) {
 const [query,setQuery] = useState(""); const [rows,setRows] = useState<Contact[]>([]);
 const [numberId,setNumberId] = useState(initialNumber ?? numbers.find(n=>n.status==="connected")?.id ?? "");
 const [page,setPage] = useState(0); const [more,setMore] = useState(false);
 const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(true); const [error,setError] = useState("");
 useEffect(()=>{
  let alive=true;
  const timeout=setTimeout(async()=>{
   if (!supabase) return;
   setLoading(true); setError("");
   let req=supabase.from("contacts").select("*").eq("company_id",companyId).order("saved_name",{nullsFirst:false}).order("name").order("id").range(page*50,page*50+50);
   const q=query.trim().replace(/[,%()\\]/g,"");
   if(q) {
    const phone=q.replace(/\D/g,"");
    req=req.or(`saved_name.ilike.%${q}%,name.ilike.%${q}%,push_name.ilike.%${q}%${phone ? `,phone.ilike.%${phone}%` : ""}`);
   }
   const {data,error:e}=await req;
   if(alive) {setRows((data??[]).slice(0,50));setMore((data??[]).length>50);setError(e?.message??"");setLoading(false);}
  },250);
  return ()=>{alive=false;clearTimeout(timeout);};
 },[query,page,companyId]);
 async function choose(c:Contact) {
  if(!numberId) {setError("Escolha um número conectado para enviar.");return;}
  setBusy(true);setError("");
  try {await onSelect(c,numberId);onClose();} catch(e) {setError(e instanceof Error?e.message:"Não consegui abrir a conversa.");} finally {setBusy(false);}
 }
 return <div className="fixed inset-0 z-[100] bg-black/70 grid place-items-center p-3" role="dialog" aria-modal="true" aria-label="Contatos do WhatsApp">
  <div className="w-full max-w-lg max-h-[90dvh] flex flex-col rounded-2xl bg-[#0b0f16] border border-white/15 p-4 gap-3">
   <div className="flex justify-between"><h3 className="font-bold">Contatos</h3><button aria-label="Fechar contatos" onClick={onClose}>✕</button></div>
   <input aria-label="Pesquisar contato" autoFocus placeholder="Nome salvo ou número…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} className="rounded-lg bg-white/5 p-3 border border-white/10" />
   <label className="text-xs">Enviar pelo número<select aria-label="Número de WhatsApp" value={numberId} onChange={e=>setNumberId(e.target.value)} className="w-full mt-1 p-2 bg-[#111826] rounded-lg"><option value="">Selecione</option>{numbers.filter(n=>n.status==="connected").map(n=><option key={n.id} value={n.id}>{n.label} {n.phone_number}</option>)}</select></label>
   {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
   <div className="overflow-y-auto flex-1 min-h-24">{loading?<p>Carregando…</p>:rows.length===0?<p className="text-sm text-gray-400 py-4">Nenhum contato encontrado.</p>:rows.map(c=><button disabled={busy} key={c.id} onClick={()=>void choose(c)} className="w-full text-left p-3 rounded-lg hover:bg-white/10 disabled:opacity-50"><p className="font-medium">{contactDisplayName(c)}</p><p className="text-xs text-gray-400">{c.is_group?"Grupo":c.phone}</p></button>)}</div>
   <div className="flex justify-between text-sm"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1}</span><button disabled={!more} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
   <button onClick={onNew} className="bg-emerald-600 rounded-lg p-2">Conversar com um novo número</button>
  </div>
 </div>;
}
