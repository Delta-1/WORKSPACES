"use client";

import { useState } from "react";
import { Rocket, Users, MessageSquare, Columns3, LayoutGrid, Bot, BarChart3, Check, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

// ONBOARDING DO DONO — aparece uma vez, no primeiro acesso de quem é gestor.
// Pergunta o essencial pra já deixar a casa arrumada: tamanho da equipe, que
// chat os funcionários veem, se quer bot de triagem (e como ele distribui) e se
// liga as métricas de atendimento (com metas). No fim grava tudo em
// company_settings e marca onboarding_done — não volta a aparecer.

type ChatMode = "kanban" | "classic" | "ambos";

export default function OnboardingWizard({ profile, onDone }: { profile: Profile | null; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [employees, setEmployees] = useState<number | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("ambos");
  const [triage, setTriage] = useState<boolean | null>(null);
  const [triageMode, setTriageMode] = useState<"one_by_one" | "broadcast">("one_by_one");
  const [timeout, setTimeoutMin] = useState(20);
  const [metrics, setMetrics] = useState<boolean | null>(null);
  const [goalWeek, setGoalWeek] = useState("");
  const [goalMonth, setGoalMonth] = useState("");

  const steps = ["Boas-vindas", "Equipe", "Chat da equipe", "Bot de triagem", "Métricas", "Tudo pronto"];
  const total = steps.length;

  async function finish() {
    if (!supabase || !profile?.company_id || saving) return;
    setSaving(true);
    const chat_modes = chatMode === "ambos" ? ["classic", "kanban"] : chatMode === "kanban" ? ["kanban"] : ["classic"];
    const payload: Record<string, unknown> = {
      onboarding_done: true,
      employee_estimate: employees,
      chat_modes,
      triage_enabled: !!triage,
      triage_mode: triageMode,
      triage_timeout_minutes: Number(timeout) || 20,
      metrics_enabled: !!metrics,
      attendance_goal_week: goalWeek ? Number(goalWeek) : null,
      attendance_goal_month: goalMonth ? Number(goalMonth) : null,
    };
    // Se a equipe usa um layout só, já deixa ele como padrão da empresa.
    if (chatMode !== "ambos") payload.messages_layout = chatMode === "kanban" ? "kanban" : "classic";
    await supabase.from("company_settings").update(payload).eq("company_id", profile.company_id);
    setSaving(false);
    onDone();
  }

  const canNext =
    step === 1 ? employees !== null :
    step === 3 ? triage !== null :
    step === 4 ? metrics !== null :
    true;

  const chip = (on: boolean) =>
    `flex-1 rounded-xl border px-3 py-3 text-sm cursor-pointer transition text-left ${on ? "border-emerald-500 bg-emerald-950/40" : "border-white/10 hover:border-white/25 hover:bg-white/5"}`;

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0b0f16] border border-white/10 rounded-2xl p-6 max-h-[92vh] overflow-y-auto custom-scroll">
        {/* progresso */}
        <div className="flex items-center gap-1.5 mb-5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full flex-1 ${i <= step ? "bg-emerald-400" : "bg-white/15"}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500 flex items-center justify-center mx-auto mb-4">
              <Rocket size={30} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Bem-vindo ao Workspaces! 👋</h2>
            <p className="text-sm text-gray-400">Vamos deixar tudo do seu jeito em 1 minutinho. Você pode mudar qualquer coisa depois nas Configurações.</p>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-1"><Users size={18} className="text-emerald-400" /> Quantos funcionários, mais ou menos?</h2>
            <p className="text-xs text-gray-400 mb-4">Só pra dimensionar a equipe — não precisa ser exato.</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ l: "Só eu / até 3", v: 3 }, { l: "4 a 10", v: 10 }, { l: "11 a 30", v: 30 }, { l: "Mais de 30", v: 50 }].map((o) => (
                <button key={o.v} onClick={() => setEmployees(o.v)} className={chip(employees === o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-1"><MessageSquare size={18} className="text-emerald-400" /> Que chat os funcionários veem?</h2>
            <p className="text-xs text-gray-400 mb-4">Escolha o jeito de atender. Em &quot;Deixar os dois&quot;, cada funcionário escolhe o que preferir.</p>
            <div className="space-y-2">
              <button onClick={() => setChatMode("kanban")} className={chip(chatMode === "kanban") + " w-full flex items-center gap-3"}>
                <Columns3 size={18} className="text-amber-400 shrink-0" /> <span><b>Kanban (Fluxo)</b><br /><span className="text-[11px] text-gray-400">Conversas em colunas: A fazer → Em andamento → Finalizado.</span></span>
              </button>
              <button onClick={() => setChatMode("classic")} className={chip(chatMode === "classic") + " w-full flex items-center gap-3"}>
                <LayoutGrid size={18} className="text-emerald-400 shrink-0" /> <span><b>Mensagens comum</b><br /><span className="text-[11px] text-gray-400">Estilo WhatsApp: lista de conversas à esquerda, chat à direita.</span></span>
              </button>
              <button onClick={() => setChatMode("ambos")} className={chip(chatMode === "ambos") + " w-full flex items-center gap-3"}>
                <Check size={18} className="text-sky-400 shrink-0" /> <span><b>Deixar os dois</b><br /><span className="text-[11px] text-gray-400">Cada funcionário escolhe entre Kanban e Mensagens.</span></span>
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-1"><Bot size={18} className="text-emerald-400" /> Quer um bot de triagem?</h2>
            <p className="text-xs text-gray-400 mb-4">Ele entende o que o cliente quer e distribui o atendimento entre a equipe.</p>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setTriage(true)} className={chip(triage === true)}>Sim, quero ✅</button>
              <button onClick={() => setTriage(false)} className={chip(triage === false)}>Não, por enquanto</button>
            </div>
            {triage && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                <p className="text-xs text-gray-300 font-semibold">Como ele distribui?</p>
                <button onClick={() => setTriageMode("one_by_one")} className={chip(triageMode === "one_by_one") + " w-full"}>
                  <b>Um por vez (rodízio)</b><br /><span className="text-[11px] text-gray-400">Manda pra um atendente. Se não responder no tempo, passa pro próximo. Se ninguém pegar, libera pra todos.</span>
                </button>
                <button onClick={() => setTriageMode("broadcast")} className={chip(triageMode === "broadcast") + " w-full"}>
                  <b>Todos ao mesmo tempo</b><br /><span className="text-[11px] text-gray-400">Aparece pra equipe toda de uma vez — quem responder primeiro assume.</span>
                </button>
                {triageMode === "one_by_one" && (
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    Passar pro próximo depois de
                    <input type="number" min={1} value={timeout} onChange={(e) => setTimeoutMin(Number(e.target.value))} className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-center outline-none" />
                    minutos sem resposta.
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-1"><BarChart3 size={18} className="text-emerald-400" /> Ligar métricas de atendimento?</h2>
            <p className="text-xs text-gray-400 mb-4">Conta os atendimentos de cada funcionário. Você e os líderes veem o desempenho da equipe, e quem bate a meta ganha destaque dourado no perfil. ✨</p>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setMetrics(true)} className={chip(metrics === true)}>Sim, ativar 📊</button>
              <button onClick={() => setMetrics(false)} className={chip(metrics === false)}>Agora não</button>
            </div>
            {metrics && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <p className="text-xs text-gray-300 font-semibold">Metas (opcional) — quem passar disso brilha dourado:</p>
                <div className="flex gap-2">
                  <label className="flex-1 text-xs text-gray-400">Por semana
                    <input type="number" min={0} value={goalWeek} onChange={(e) => setGoalWeek(e.target.value)} placeholder="ex.: 40" className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 outline-none" />
                  </label>
                  <label className="flex-1 text-xs text-gray-400">Por mês
                    <input type="number" min={0} value={goalMonth} onChange={(e) => setGoalMonth(e.target.value)} placeholder="ex.: 160" className="w-full mt-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 outline-none" />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500 flex items-center justify-center mx-auto mb-4">
              <Check size={30} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Tudo pronto! 🎉</h2>
            <p className="text-sm text-gray-400">
              {triage ? `Bot de triagem ligado (${triageMode === "one_by_one" ? "rodízio" : "todos ao mesmo tempo"}). ` : "Sem bot de triagem por enquanto. "}
              {metrics ? "Métricas ligadas — acompanhe em Atendimentos." : "Métricas desligadas."}
            </p>
            <p className="text-[11px] text-gray-500 mt-2">Muda tudo depois em Configurações.</p>
          </div>
        )}

        {/* navegação */}
        <div className="flex items-center justify-between gap-2 mt-6">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer disabled:opacity-0 flex items-center gap-1"
          >
            <ChevronLeft size={14} /> Voltar
          </button>
          {step < total - 1 ? (
            <button
              onClick={() => canNext && setStep((s) => s + 1)}
              disabled={!canNext}
              className="text-sm px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-40 flex items-center gap-1"
            >
              Continuar <ChevronRight size={15} />
            </button>
          ) : (
            <button onClick={finish} disabled={saving} className="text-sm px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50">
              {saving ? "Salvando…" : "Começar a usar 🚀"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
