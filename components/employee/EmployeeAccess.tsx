"use client";

import { useState } from "react";

export default function EmployeeAccess({ companyCode }: { companyCode: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    const link = `${window.location.origin}/atendimento?empresa=${encodeURIComponent(companyCode)}`;
    try {
      await navigator.clipboard.writeText(`Acesse o Workspaces Atendimento: ${link}\nPrimeiro acesso: toque em Criar conta e use seu próprio e-mail e senha. Confirme o e-mail, se solicitado. Depois confirme o código ${companyCode} para entrar na empresa. Quem já tem conta deve tocar em Entrar.\nManual: ${window.location.origin}/ajuda/atendimento`);
      setStatus("Link e instruções copiados.");
    } catch { setStatus("Não foi possível copiar. Selecione o código e compartilhe o endereço /atendimento."); }
  }
  return <div className="mt-3 space-y-2">
    <button onClick={() => void copy()} className="min-h-11 w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold">Copiar acesso do funcionário</button>
    <a href="/atendimento" className="inline-flex min-h-11 items-center text-sm text-emerald-300 underline">Abrir app de atendimento</a>
    <span className="px-2">·</span><a href="/ajuda/atendimento" className="inline-flex min-h-11 items-center text-sm text-emerald-300 underline">Manual ilustrado</a>
    {status && <p role="status" className="text-sm text-gray-300">{status}</p>}
  </div>;
}
