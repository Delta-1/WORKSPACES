"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase-client";
import type { Conversation, Profile } from "@/lib/types";
import AttendanceTimer from "./AttendanceTimer";
export default function AttendanceActions({ conversation:c, profile, colleagues, onChanged }: {
 conversation:Conversation; profile:Profile; colleagues:Profile[]; onChanged:()=>Promise<void>;
}) {
 const [mode,setMode]=useState<"finish"|"transfer"|null>(null);
 const [result,setResult]=useState("");const [note,setNote]=useState("");const [target,setTarget]=useState("");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const supervisor=profile.role==="gestor"||(profile.role==="gerente"&&profile.sector_id===c.sector_id);
 const owner=c.assignee_id===profile.id;
 const name=c.assignee_id===profile.id?"Você":colleagues.find(p=>p.id===c.assignee_id)?.full_name??"Outro atendente";
 async function act(action:string) {
  if(!supabase||busy)return;
  setBusy(true);setError("");
  const {error:e}=await supabase.rpc("attendance_action",{cid:c.id,action,target:target||null,result:result||null,observation:note||null});
  setBusy(false);
  if(e){setError(e.message);return;}
  setMode(null);setNote("");setResult("");setTarget("");await onChanged();
 }
 return <div className="px-3 py-2 border-b border-white/10 flex flex-wrap items-center gap-2 text-xs">
  {c.status==="atendendo"&&c.assignee_id?<><span>Responsável: {name}</span><AttendanceTimer start={c.accepted_at??null}/></>:<span>{c.status==="fechado"?"Atendimento finalizado":"Na fila de atendimento"}</span>}
  {(!c.assignee_id||c.status==="fechado"||c.status==="cancelado")&&<button disabled={busy} onClick={()=>void act("claim")} className="rounded-lg px-3 py-2 bg-emerald-600">{c.status==="fechado"?"Reabrir atendimento":"Assumir atendimento"}</button>}
  {c.status==="atendendo"&&c.assignee_id&&(owner||supervisor)&&<><button onClick={()=>{setMode("transfer");setError("");}} className="rounded-lg px-3 py-2 bg-white/10">Transferir</button><button onClick={()=>{setMode("finish");setError("");}} className="rounded-lg px-3 py-2 bg-emerald-600">Finalizar</button></>}
  {c.status==="fechado"&&c.resolution&&<span>{c.resolution==="resolved"?"Resolvido":"Não resolvido"}</span>}
  {error&&!mode&&<p role="alert" className="text-red-300">{error}</p>}
  {mode&&<div className="fixed inset-0 z-[110] bg-black/70 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={mode==="finish"?"Finalizar atendimento":"Transferir atendimento"}><div className="bg-[#111826] rounded-xl border border-white/15 p-5 w-full max-w-md space-y-3">
   <div className="flex justify-between"><h3 className="text-base font-bold">{mode==="finish"?"Como terminou o atendimento?":"Transferir atendimento"}</h3><button disabled={busy} aria-label="Fechar" onClick={()=>setMode(null)}>✕</button></div>
   {mode==="finish"?<select aria-label="Resultado do atendimento" value={result} onChange={e=>setResult(e.target.value)} className="w-full p-3 rounded-lg bg-[#0b0f16]"><option value="">Selecione o resultado</option><option value="resolved">Resolvido</option><option value="unresolved">Não resolvido</option></select>:<select aria-label="Novo responsável" value={target} onChange={e=>setTarget(e.target.value)} className="w-full p-3 rounded-lg bg-[#0b0f16]"><option value="">Escolha um funcionário</option>{[profile,...colleagues].filter(p=>p.id!==c.assignee_id).map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}</select>}
   <textarea aria-label="Observação opcional" placeholder="Observação (opcional)" value={note} onChange={e=>setNote(e.target.value)} maxLength={3000} className="w-full bg-white/5 p-3 rounded-lg" />
   {error&&<p role="alert" className="text-red-300">{error}</p>}
   <button disabled={busy||(mode==="finish"?!result:!target)} onClick={()=>void act(mode)} className="w-full bg-emerald-600 rounded-lg p-3 disabled:opacity-40">{busy?"Salvando…":"Confirmar"}</button>
  </div></div>}
 </div>;
}
