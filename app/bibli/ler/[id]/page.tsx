"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Download, Heart, Loader2, Lock, WifiOff } from "lucide-react";
import { CONTRIBUICAO, reais } from "@/lib/bibliopen";

// Leitor do BibliOpen.
//
// O PDF é servido pela nossa rota (/api/bibli/arquivo/[id]), que confere a
// licença antes de mandar qualquer byte — o endereço real do arquivo nunca chega
// ao navegador. Aqui dentro é só o <object>, que usa o leitor nativo do próprio
// navegador: nada de embed do Google, e funciona offline depois de carregado,
// porque o service worker guarda a resposta em cache.

type Livro = {
  id: string; titulo_completo: string; autor: string | null;
  licenca: string | null; fonte: string | null; disponivel_no_leitor: boolean;
};

export default function Leitor({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string; e?: string }>;
}) {
  const { id } = use(params);
  const { c: contato, e: emailUrl } = use(searchParams);

  const [livro, setLivro] = useState<Livro | null>(null);
  const [liberado, setLiberado] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [email, setEmail] = useState(emailUrl ?? "");
  const [tipo, setTipo] = useState<"avulsa" | "mensal">("avulsa");
  const [valor, setValor] = useState<number>(CONTRIBUICAO.avulsaCents / 100);
  const [pix, setPix] = useState<{ codigo: string | null; qr: string | null; valor: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const arquivo = `/api/bibli/arquivo/${id}?${new URLSearchParams({
    ...(contato ? { c: contato } : {}),
    ...(email ? { e: email } : {}),
  })}`;

  const conferir = useCallback(async () => {
    const [infoRes, arqRes] = await Promise.all([
      fetch(`/api/bibli/buscar?id=${id}`),
      // HEAD não gasta o download inteiro só para saber se pode ler.
      fetch(`/api/bibli/arquivo/${id}?${new URLSearchParams({ ...(contato ? { c: contato } : {}), ...(email ? { e: email } : {}) })}`, { method: "HEAD" }),
    ]);
    const info = await infoRes.json();
    return { livro: (info.livros ?? [])[0] as Livro | undefined, ok: arqRes.ok };
  }, [id, contato, email]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { livro: l, ok } = await conferir();
      if (!vivo) return;
      setLivro(l ?? null);
      setLiberado(ok);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [conferir]);

  async function contribuir() {
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch("/api/bibli/contribuir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, livro_id: id, contact_id: contato, email: email || undefined, valor, metodo: "pix" }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.error || "Não consegui gerar a contribuição."); return; }
      setPix({ codigo: json.pix_copia_e_cola, qr: json.pix_qr_base64, valor: json.valor });
    } finally { setGerando(false); }
  }

  if (carregando) {
    return <div className="min-h-screen bg-[#0B132B] grid place-items-center text-gray-500"><Loader2 size={22} className="animate-spin" /></div>;
  }

  if (!livro) {
    return (
      <div className="min-h-screen bg-[#0B132B] text-gray-100 grid place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-gray-400">Não encontrei este título.</p>
          <Link href="/bibli" className="text-emerald-400 text-sm mt-2 inline-block">Voltar ao acervo</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B132B] text-gray-100 flex flex-col">
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-3 shrink-0">
        <Link href="/bibli" className="p-1.5 rounded-lg hover:bg-white/10 shrink-0"><ArrowLeft size={17} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold truncate">{livro.titulo_completo}</h1>
          <p className="text-[11px] text-gray-400 truncate">
            {livro.autor}{livro.licenca && ` · ${livro.licenca}`}{livro.fonte && ` · ${livro.fonte}`}
          </p>
        </div>
        {liberado && (
          <a href={arquivo} download className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 shrink-0">
            <Download size={12} /> Baixar
          </a>
        )}
      </header>

      {liberado ? (
        <>
          <object data={arquivo} type="application/pdf" className="flex-1 w-full bg-[#1a1a1a]">
            {/* Navegador sem leitor de PDF embutido (parte do mobile) — aí o
                caminho honesto é baixar, não um visualizador quebrado. */}
            <div className="h-full grid place-items-center p-8 text-center">
              <div>
                <p className="text-sm text-gray-400">Seu navegador não abre PDF aqui dentro.</p>
                <a href={arquivo} download className="inline-flex items-center gap-2 mt-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg">
                  <Download size={14} /> Baixar para ler
                </a>
              </div>
            </div>
          </object>
          <p className="text-[10px] text-gray-500 px-4 py-2 flex items-center gap-1.5 border-t border-white/10 shrink-0">
            <WifiOff size={11} /> Depois de carregado, este livro continua abrindo sem internet nesta mesma página.
          </p>
        </>
      ) : (
        <main className="flex-1 grid place-items-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-950/50 grid place-items-center mx-auto mb-3">
                <Lock size={20} className="text-emerald-300" />
              </div>
              <h2 className="text-base font-bold">Contribua para abrir</h2>
              <p className="text-[12px] text-gray-400 mt-1 leading-snug">
                O acervo é aberto, mas manter o BibliOpen de pé — curadoria, busca com IA e o leitor — tem custo.
                Contribua com o quanto puder, a partir do mínimo.
              </p>
            </div>

            {!pix ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {([["avulsa", "Este livro", CONTRIBUICAO.avulsaCents], ["mensal", "Passe 30 dias", CONTRIBUICAO.mensalCents]] as const).map(([t, rotulo, min]) => (
                    <button
                      key={t}
                      onClick={() => { setTipo(t); setValor(min / 100); }}
                      className={`rounded-xl border p-2.5 text-left cursor-pointer ${tipo === t ? "border-emerald-500 bg-emerald-950/30" : "border-white/10 bg-black/20 hover:bg-white/5"}`}
                    >
                      <p className="text-[12px] font-semibold">{rotulo}</p>
                      <p className="text-[10px] text-gray-400">a partir de {reais(min)}</p>
                    </button>
                  ))}
                </div>

                {!contato && (
                  <label className="block">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Seu e-mail</span>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="para você recuperar o acesso depois"
                      className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </label>
                )}

                <label className="block">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quanto você quer contribuir</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm text-gray-400">R$</span>
                    <input
                      type="number" min={(tipo === "mensal" ? CONTRIBUICAO.mensalCents : CONTRIBUICAO.avulsaCents) / 100} step="0.50"
                      value={valor} onChange={(e) => setValor(Number(e.target.value))}
                      className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                </label>

                {erro && <p className="text-[11px] text-red-300">{erro}</p>}

                <button
                  onClick={contribuir}
                  disabled={gerando || (!contato && !email.trim())}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2.5 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  <Heart size={14} /> {gerando ? "Gerando Pix…" : "Contribuir com Pix"}
                </button>
              </>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-[12px] text-gray-300">Pix de <b>{pix.valor}</b></p>
                {pix.qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:image/png;base64,${pix.qr}`} alt="QR Code do Pix" className="w-44 h-44 mx-auto rounded-xl bg-white p-2" />
                )}
                {pix.codigo && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(pix.codigo!); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}
                    className="w-full flex items-center justify-center gap-2 text-xs bg-white/10 hover:bg-white/15 py-2.5 rounded-xl cursor-pointer"
                  >
                    <Copy size={13} /> {copiado ? "Copiado!" : "Copiar código Pix"}
                  </button>
                )}
                <p className="text-[11px] text-gray-400">
                  Assim que o pagamento cair, o livro abre sozinho aqui. Pode levar alguns segundos.
                </p>
                <button onClick={() => window.location.reload()} className="text-[11px] text-emerald-400 cursor-pointer">
                  já paguei — conferir agora
                </button>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
