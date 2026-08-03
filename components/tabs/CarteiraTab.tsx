"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowDownLeft, Check, Clock, Eye, EyeOff, Loader2, RefreshCcw, Wallet, Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";
import BillingTab from "./BillingTab";

type Movimento = {
  id: string;
  valor: number;
  liquido: number;
  status: string;
  metodo: string | null;
  em: string | null;
  de: string | null;
  origem: "cobrador" | "avulso";
  descricao: string | null;
};

type Carteira = {
  conectada: boolean;
  pix_auto?: boolean;
  aviso?: string;
  conta?: { id: number; apelido: string | null; email: string | null };
  saldo?: { disponivel: number; aLiberar: number; total: number } | null;
  resumo?: { hoje: number; semana: number; periodo: number; dias: number; a_receber: number };
  movimentos?: Movimento[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function quando(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const METODO: Record<string, string> = {
  pix: "Pix", credit_card: "Cartão de crédito", debit_card: "Cartão de débito",
  ticket: "Boleto", account_money: "Saldo Mercado Pago",
};

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

type Secao = "resumo" | "cobrancas" | "situacao" | "config";

// CARTEIRA — o dinheiro da empresa num lugar só.
//
// O Cobrador mora aqui dentro: cobrar e receber é a mesma história, e separar em
// dois ícones fazia a pessoa pular de tela para entender se a cobrança que ela
// mandou virou dinheiro. A barra de abas é uma só; o Cobrador entra "embutido".
export default function CarteiraTab({ profile, onOpenMessages }: {
  profile: Profile | null;
  onOpenMessages?: (phone: string, name: string) => void;
}) {
  const isGestor = profile?.role === "gestor";
  const [secao, setSecao] = useState<Secao>("resumo");
  const [data, setData] = useState<Carteira | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [config, setConfig] = useState(false);
  const [token, setToken] = useState("");
  const [verToken, setVerToken] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A busca é só busca: não mexe em estado nenhum. Quem decide o que fazer com o
  // resultado é quem chamou — o efeito ou o botão. Sem isso, chamar daqui de
  // dentro do efeito dispararia uma cascata de renders.
  const buscar = useCallback(async (d: number): Promise<{ dados?: Carteira; erro?: string }> => {
    try {
      const res = await fetch(`/api/carteira?dias=${d}`, { headers: await authHeaders(), cache: "no-store" });
      const json = await res.json();
      return res.ok ? { dados: json } : { erro: json.error || "Não consegui abrir a carteira." };
    } catch {
      return { erro: "Não consegui falar com o servidor." };
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { dados, erro } = await buscar(dias);
      if (!vivo) return; // trocou de período (ou saiu da tela) no meio do caminho
      setErro(erro ?? null);
      if (dados) setData(dados);
      setLoading(false);
    })();
    return () => { vivo = false; };
  }, [buscar, dias]);

  async function recarregar() {
    setLoading(true);
    const { dados, erro } = await buscar(dias);
    setErro(erro ?? null);
    if (dados) setData(dados);
    setLoading(false);
  }

  async function salvarConfig(patch: { token?: string | null; pix_auto?: boolean }) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/carteira/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Não consegui salvar."); return; }
      setToken("");
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  const r = data?.resumo;

  // Conexão com o Mercado Pago. Vai para dentro das Configurações do Cobrador
  // (via `topoConfig`), para token e cobrança ficarem na mesma tela.
  const conexao = !isGestor ? null : (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold">Conexão com o Mercado Pago</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Cole aqui o <b>access token de produção</b> da conta que vai receber. Ele é conferido no
                Mercado Pago antes de salvar, e nunca volta para esta tela depois.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={verToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={data?.conectada ? "Token salvo — cole um novo para trocar" : "APP_USR-..."}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-9 text-xs outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  onClick={() => setVerToken((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 cursor-pointer"
                  title={verToken ? "Esconder" : "Mostrar"}
                >
                  {verToken ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                onClick={() => salvarConfig({ token })}
                disabled={!token.trim() || salvando}
                className="text-xs px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                {salvando ? "..." : "Conectar"}
              </button>
            </div>
            {data?.conectada && (
              <button
                onClick={() => salvarConfig({ token: null })}
                disabled={salvando}
                className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer"
              >
                desconectar esta conta
              </button>
            )}

            <div className="border-t border-white/10 pt-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!data?.pix_auto}
                  onChange={(e) => salvarConfig({ pix_auto: e.target.checked })}
                  disabled={salvando || !data?.conectada}
                  className="accent-emerald-600 mt-0.5"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Zap size={13} className="text-amber-300" /> Pix automático no Cobrador
                  </span>
                  <span className="block text-[11px] text-gray-400 leading-snug mt-0.5">
                    Cada cobrança sai com um Pix próprio, gerado pelo Mercado Pago. Quando o cliente paga, a
                    baixa é automática — ninguém precisa ler o comprovante que ele mandou. Desligado, o
                    Cobrador continua enviando a chave Pix fixa.
                  </span>
                </span>
              </label>
            </div>
    </div>
  );

  const abas: [Secao, string][] = [
    ["resumo", "Resumo"],
    ["cobrancas", "Cobranças"],
    ["situacao", "Situação dos clientes"],
    ["config", "Configurações"],
  ];

  return (
    <div className="h-full flex flex-col bg-[#0b0f16] text-gray-100 overflow-hidden">
      <div className="px-4 md:px-6 pt-4 pb-2 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-900/60 grid place-items-center shrink-0">
            <Wallet size={19} className="text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight">Carteira</h2>
            <p className="text-[11px] text-gray-400">
              {data?.conectada && data.conta
                ? <>Conta Mercado Pago <b>{data.conta.apelido || data.conta.email || data.conta.id}</b> · cobranças e recebimentos</>
                : "Cobranças, recebimentos e sua conta Mercado Pago"}
            </p>
          </div>
          {secao === "resumo" && (
            <button
              onClick={() => void recarregar()}
              disabled={loading}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer disabled:opacity-50"
            >
              <RefreshCcw size={12} className={loading ? "animate-spin" : ""} /> Atualizar
            </button>
          )}
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto">
          {abas.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSecao(id)}
              className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${secao === id ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {secao !== "resumo" ? (
        <BillingTab profile={profile} onOpenMessages={onOpenMessages} embutido secao={secao} topoConfig={conexao} />
      ) : (
      <div className="flex-1 overflow-y-auto custom-scroll">
        <div className="max-w-5xl mx-auto p-4 space-y-4">
        {erro && (
          <div className="flex items-start gap-2 rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2.5">
            <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-red-200">{erro}</p>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}

        {/* Não conectada */}
        {data && !data.conectada && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-950/50 grid place-items-center mx-auto mb-3">
              <Wallet size={20} className="text-emerald-300" />
            </div>
            <h3 className="text-base font-bold mb-1">Conecte sua conta Mercado Pago</h3>
            <p className="text-[13px] text-gray-400 max-w-md mx-auto">{data.aviso}</p>
            {isGestor && !config && (
              <button
                onClick={() => setConfig(true)}
                className="mt-4 text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                Abrir configurações
              </button>
            )}
          </div>
        )}

        {/* Números */}
        {data?.conectada && r && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* O saldo só aparece quando o Mercado Pago devolve — melhor não
                  mostrar nada do que mostrar R$ 0,00 e a pessoa achar que zerou. */}
              {data.saldo ? (
                <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/25 p-3">
                  <p className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider">Disponível</p>
                  <p className="text-xl font-bold mt-0.5">{brl(data.saldo.disponivel)}</p>
                  {data.saldo.aLiberar > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5">+ {brl(data.saldo.aLiberar)} a liberar</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Saldo</p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                    O Mercado Pago não abre o saldo pela API. Veja na conta deles.
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Entrou hoje</p>
                <p className="text-xl font-bold mt-0.5">{brl(r.hoje)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Últimos 7 dias</p>
                <p className="text-xl font-bold mt-0.5">{brl(r.semana)}</p>
              </div>
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-3">
                <p className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider">A receber</p>
                <p className="text-xl font-bold mt-0.5">{brl(r.a_receber)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">cobranças em aberto</p>
              </div>
            </div>

            {!data.pix_auto && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-800/40 bg-amber-950/20 px-3 py-2.5">
                <Zap size={14} className="text-amber-300 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-100/90">
                  O <b>Pix automático</b> está desligado. Ligue nas configurações para o Cobrador gerar um Pix por
                  cobrança e dar baixa sozinho, sem depender de alguém ler o comprovante.
                </p>
              </div>
            )}

            {/* Movimentos */}
            <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
                <h3 className="text-sm font-bold">O que entrou</h3>
                <select
                  value={dias}
                  onChange={(e) => { setLoading(true); setDias(Number(e.target.value)); }}
                  className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px] outline-none cursor-pointer"
                >
                  <option value={7}>7 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={90}>90 dias</option>
                </select>
              </div>
              {!data.movimentos?.length ? (
                <p className="text-[12px] text-gray-500 italic text-center py-10 px-4">
                  Nada recebido nesse período.
                </p>
              ) : (
                <div className="divide-y divide-white/5">
                  {data.movimentos.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${
                          m.status === "approved" ? "bg-emerald-900/50 text-emerald-300" : "bg-white/10 text-gray-400"
                        }`}
                      >
                        {m.status === "approved" ? <ArrowDownLeft size={14} /> : <Clock size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] truncate leading-tight">{m.de || m.descricao || "Recebimento"}</p>
                        <p className="text-[10px] text-gray-500">
                          {quando(m.em)} · {METODO[m.metodo ?? ""] || m.metodo || "—"}
                          {m.origem === "cobrador" && (
                            <span className="ml-1.5 text-emerald-400">· do Cobrador</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[13px] font-semibold ${m.status === "approved" ? "text-emerald-300" : "text-gray-400"}`}>
                          {brl(m.valor)}
                        </p>
                        {m.status === "approved" && m.liquido !== m.valor && (
                          <p className="text-[10px] text-gray-500">líq. {brl(m.liquido)}</p>
                        )}
                        {m.status !== "approved" && <p className="text-[10px] text-gray-500">{m.status}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.pix_auto && (
              <div className="flex items-center gap-2 text-[11px] text-gray-500 px-1">
                <Check size={12} className="text-emerald-400 shrink-0" />
                Pix automático ligado: as cobranças do Cobrador saem com Pix próprio e a baixa é automática.
              </div>
            )}
          </>
        )}
        </div>
      </div>
      )}
    </div>
  );
}
