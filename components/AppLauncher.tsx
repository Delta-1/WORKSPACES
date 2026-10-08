"use client";
import { useState } from "react";
import { Search, type LucideIcon } from "lucide-react";
const descriptions:Record<string,string>={mensagens:"Conversar e atender",contatos:"Pesquisar pessoas",relatorios:"Consultar resultados",calendario:"Agenda e compromissos",group:"Conversas da equipe",clientes:"Cadastro e histórico",config:"Personalizar o workspace",carteira:"Cobranças e pagamentos",organograma:"Pessoas e setores",kanban:"Organizar tarefas",estudio:"Criar documentos",links:"Seus atalhos",arquivos:"Documentos e pastas"};
export default function AppLauncher({apps,onSelect,onOpenOverview}:{apps:{id:string;label:string;icon:LucideIcon;accent:string}[];onSelect:(id:string)=>void;onOpenOverview?:()=>void}){
 const [query,setQuery]=useState("");
 const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const visible=apps.filter(app=>app.id!=="inicio"&&normalize(app.label).includes(normalize(query))).sort((a,b)=>Number(b.id==="mensagens")-Number(a.id==="mensagens"));
 return <section aria-label="Aplicativos do workspace" className="h-full overflow-y-auto mx-auto max-w-7xl pb-[max(1rem,env(safe-area-inset-bottom))]">
  <div className="mb-5 flex items-start justify-between gap-4"><div><h1 className="text-xl md:text-2xl font-semibold">Seus aplicativos</h1><p className="text-sm text-slate-400 mt-1">Escolha um aplicativo para começar.</p></div>{onOpenOverview&&<button onClick={onOpenOverview} className="hidden md:block shrink-0 min-h-11 rounded-xl border border-white/10 px-4 text-sm hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-emerald-400">Visão geral</button>}</div>
  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 mb-5 md:max-w-lg"><Search size={20} className="text-slate-400 shrink-0"/><input aria-label="Pesquisar aplicativo" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar aplicativo" className="w-full min-w-0 bg-transparent outline-none text-base py-3"/></label>
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">{visible.map(app=><button key={app.id} aria-label={`Abrir ${app.label}`} onClick={()=>onSelect(app.id)} className={`min-h-32 rounded-2xl border p-4 flex flex-col items-start text-left gap-3 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-emerald-400 ${app.id==="mensagens"?"border-emerald-500/40 bg-emerald-500/10":"border-white/10 bg-white/[0.025] hover:bg-white/5"}`}>
   <span className={`w-11 h-11 rounded-xl grid place-items-center ${app.accent}`}><app.icon size={25}/></span>
   <span className="min-w-0 w-full"><span className="block font-semibold text-sm md:text-base break-words">{app.label}</span>{descriptions[app.id]&&<span className="block text-xs mt-1 text-slate-400">{descriptions[app.id]}</span>}</span>
  </button>)}</div>
  {!visible.length&&<p className="text-sm text-slate-400 py-8 text-center">Nenhum aplicativo encontrado.</p>}
 </section>;
}
