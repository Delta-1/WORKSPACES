"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import { attendanceMetrics, durationLabel, elapsedSeconds, type AttendanceSession } from "@/lib/attendance";
const labels={resolved:"Resolvido",unresolved:"Não resolvido",transferred:"Transferido",automatic:"Encerrado automaticamente"};
const day=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const escapeHtml=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export default function ReportsTab({profile}:{profile:Profile|null}) {
 const [from,setFrom]=useState(()=>day(new Date(new Date().getFullYear(),new Date().getMonth(),1)));
 const [to,setTo]=useState(()=>day(new Date()));const [employee,setEmployee]=useState("");const [outcome,setOutcome]=useState("");const [query,setQuery]=useState("");
 const [staff,setStaff]=useState<Profile[]>([]);const [rows,setRows]=useState<AttendanceSession[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 useEffect(()=>{if(!supabase||!profile?.company_id)return;let req=supabase.from("profiles").select("*").eq("company_id",profile.company_id).order("full_name");if(profile.role==="gerente")req=req.eq("sector_id",profile.sector_id);if(profile.role==="funcionario")req=req.eq("id",profile.id);req.then(({data})=>setStaff(data??[]));},[profile?.company_id,profile?.role,profile?.id,profile?.sector_id]);
 const load=useCallback(async()=>{
  if(!supabase||!profile?.company_id){setLoading(false);return;}
  if(!from||!to||from>to){setError("Selecione um período válido.");setRows([]);setLoading(false);return;}
  setLoading(true);setError("");
  const after=new Date(`${to}T00:00:00`);after.setDate(after.getDate()+1);
  const all:AttendanceSession[]=[];
  for(let offset=0;;offset+=500){
   let req=supabase.from("attendance_sessions").select("*").eq("company_id",profile.company_id).gte("started_at",new Date(`${from}T00:00:00`).toISOString()).lt("started_at",after.toISOString()).order("started_at",{ascending:false}).order("id").range(offset,offset+499);
   if(employee)req=req.eq("assignee_id",employee);if(outcome)req=req.eq("outcome",outcome);
   const {data,error:e}=await req;if(e){setError(e.message);setRows([]);setLoading(false);return;}
   all.push(...(data??[]));if((data??[]).length<500)break;
  }
  setRows(all);setLoading(false);
 },[profile,from,to,employee,outcome]);
 useEffect(()=>{void Promise.resolve().then(load);},[load]);
 const filtered=useMemo(()=>rows.filter(r=>!query||`${r.contact_name??""} ${r.contact_phone??""} ${r.protocol}`.toLowerCase().includes(query.toLowerCase())),[rows,query]);
 const metrics=attendanceMetrics(filtered);
 const summaries=useMemo(()=>Array.from(new Set(filtered.map(r=>r.assignee_id))).map(id=>{const own=filtered.filter(r=>r.assignee_id===id);return{id,name:own[0]?.employee_name??"Funcionário removido",...attendanceMetrics(own)};}),[filtered]);
 function print(){
  const win=window.open("","_blank");if(!win){setError("Permita abrir a janela de impressão.");return;}
  const summary=summaries.map(s=>`<tr><td>${escapeHtml(s.name)}</td><td>${s.total}</td><td>${s.completed}</td><td>${s.messages}</td><td>${s.resolutionRate===null?"—":s.resolutionRate.toFixed(1)+"%"}</td><td>${s.avgDuration===null?"—":durationLabel(s.avgDuration)}</td></tr>`).join("");
  const details=filtered.map(r=>`<tr><td>${r.protocol}</td><td>${escapeHtml(r.employee_name)}</td><td>${escapeHtml(r.contact_name)}<br>${escapeHtml(r.contact_phone)}</td><td>${new Date(r.started_at).toLocaleString("pt-BR")}</td><td>${durationLabel(elapsedSeconds(r.queued_at,r.started_at))}</td><td>${r.first_response_at?durationLabel(elapsedSeconds(r.queued_at,r.first_response_at)):"—"}</td><td>${durationLabel(elapsedSeconds(r.started_at,r.ended_at))}${r.ended_at?"":" (em andamento)"}</td><td>${r.outcome?labels[r.outcome]:"Em andamento"}</td><td>${r.outgoing_count}</td><td>${escapeHtml(r.note)}</td><td></td></tr>`).join("");
  win.document.write(`<!doctype html><html lang="pt-BR"><head><title>Relatório de atendimentos</title><style>body{font:12px Arial;color:#111;margin:24px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #aaa;padding:7px;text-align:left;vertical-align:top}thead{display:table-header-group}tr{break-inside:avoid}td:last-child{min-width:45px}h1{font-size:20px}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Imprimir / salvar PDF</button><h1>Relatório de atendimentos — Mensagens</h1><p>${escapeHtml(from)} a ${escapeHtml(to)} • ${filtered.length} participações • ${metrics.completed} finalizados • ${metrics.resolved} resolvidos</p><p>Resolução = resolvidos ÷ finalizados. Transferências não contam como finalizações. Observações e resultado informados pela equipe.</p><table><thead><tr><th>Funcionário</th><th>Participações</th><th>Finalizados</th><th>Mensagens</th><th>Resolução</th><th>Duração média</th></tr></thead><tbody>${summary}</tbody></table><table><thead><tr><th>Protocolo</th><th>Funcionário</th><th>Contato</th><th>Início</th><th>Espera</th><th>Primeira resposta</th><th>Duração</th><th>Resultado</th><th>Mensagens</th><th>Observação</th><th>Anotações</th></tr></thead><tbody>${details}</tbody></table></body></html>`);win.document.close();win.focus();win.print();
 }
 return <div className="h-full overflow-y-auto space-y-4 p-1">
  <div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-xl font-bold">Relatórios</h3><p className="text-sm text-gray-400">Atendimentos de Mensagens</p></div><div className="flex gap-2"><button onClick={()=>void load()} className="p-2 rounded-lg bg-white/10">Atualizar</button><button disabled={loading||!!error} onClick={print} className="p-2 rounded-lg bg-emerald-600">Imprimir / PDF</button></div></div>
  <div className="flex flex-wrap gap-3 text-sm">
   <label>De<input aria-label="Data inicial" type="date" value={from} onChange={e=>setFrom(e.target.value)} className="block bg-white/5 rounded-lg p-2"/></label><label>Até<input aria-label="Data final" type="date" value={to} onChange={e=>setTo(e.target.value)} className="block bg-white/5 rounded-lg p-2"/></label>
   <label>Funcionário<select aria-label="Funcionário" value={employee} onChange={e=>setEmployee(e.target.value)} className="block bg-[#111826] rounded-lg p-2"><option value="">Todos disponíveis</option>{staff.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}</select></label>
   <label>Resultado<select aria-label="Resultado" value={outcome} onChange={e=>setOutcome(e.target.value)} className="block bg-[#111826] rounded-lg p-2"><option value="">Todos</option>{Object.entries(labels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Contato / protocolo<input aria-label="Contato ou protocolo" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome, número ou protocolo" className="block bg-white/5 rounded-lg p-2"/></label>
  </div>
  <p className="text-xs text-gray-400">Cada transferência preserva a participação de ambos os atendentes. A taxa de resolução considera apenas finalizações com resultado informado. Registros passam a ser coletados com esta atualização.</p>
  {error&&<p role="alert" className="text-red-300">{error}</p>}
  {loading?<p>Carregando relatório…</p>:<>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[["Finalizados",metrics.completed],["Resolvidos",metrics.resolved],["Resolução",metrics.resolutionRate===null?"—":metrics.resolutionRate.toFixed(1)+"%"],["Duração média",metrics.avgDuration===null?"—":durationLabel(metrics.avgDuration)],["Espera média",metrics.avgWait===null?"—":durationLabel(metrics.avgWait)],["Primeira resposta média",metrics.avgFirstResponse===null?"—":durationLabel(metrics.avgFirstResponse)],["Mensagens enviadas",metrics.messages],["Em andamento",metrics.active]].map(([label,value])=><div key={label} className="rounded-xl p-3 bg-white/5"><p className="text-xs text-gray-400">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div>
   <div className="flex flex-wrap gap-2">{summaries.map(s=><button key={s.id??"removed"} onClick={()=>setEmployee(s.id??"")} className="rounded-xl p-3 bg-white/5 text-left"><p>{s.name}</p><p className="text-xs text-gray-400">{s.completed} finalizados • {s.messages} mensagens • {s.resolved} resolvidos</p></button>)}</div>
   <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left border-b border-white/15">{["Protocolo","Funcionário","Contato","Início","Espera","Primeira resposta","Duração","Resultado","Mensagens","Observação"].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r.id} className="border-b border-white/10"><td className="p-2">#{r.protocol}</td><td className="p-2">{r.employee_name}</td><td className="p-2">{r.contact_name}<br/>{r.contact_phone}</td><td className="p-2 whitespace-nowrap">{new Date(r.started_at).toLocaleString("pt-BR")}</td><td className="p-2">{durationLabel(elapsedSeconds(r.queued_at,r.started_at))}</td><td className="p-2">{r.first_response_at?durationLabel(elapsedSeconds(r.queued_at,r.first_response_at)):"—"}</td><td className="p-2">{durationLabel(elapsedSeconds(r.started_at,r.ended_at))}{!r.ended_at?" (ativo)":""}</td><td className="p-2">{r.outcome?labels[r.outcome]:"Em andamento"}</td><td className="p-2">{r.outgoing_count}</td><td className="p-2 max-w-60">{r.note||"—"}</td></tr>)}</tbody></table>{!filtered.length&&<p className="text-sm py-6 text-gray-400">Nenhum atendimento neste período.</p>}</div>
  </>}
 </div>;
}
