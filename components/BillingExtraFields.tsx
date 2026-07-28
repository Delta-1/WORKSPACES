"use client";

// Campos extras de cobrança reutilizáveis: imagem (o bot envia) + follow-up
// (reforço se não responder) + multa por inadimplência. Usado nas cobranças
// rápidas (chat do Mensagens e Contatos).

import { useState } from "react";
import { supabase } from "@/lib/supabase-client";

export default function BillingExtraFields({
  companyId, imageUrl, setImageUrl, followupMin, setFollowupMin, followupAudio, setFollowupAudio, multa, setMulta,
}: {
  companyId: string | null;
  imageUrl: string | null; setImageUrl: (v: string | null) => void;
  followupMin: string; setFollowupMin: (v: string) => void;
  followupAudio: boolean; setFollowupAudio: (v: boolean) => void;
  multa: string; setMulta: (v: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    if (!supabase || !companyId || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().slice(0, 5);
      const path = `billing/${companyId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("company-files").upload(path, file, { contentType: file.type, upsert: true });
      if (!error) { const { data } = supabase.storage.from("company-files").getPublicUrl(path); setImageUrl(data?.publicUrl ?? null); }
    } finally { setUploading(false); }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className={`text-xs px-3 py-2 rounded-lg cursor-pointer ${uploading ? "bg-white/5 text-gray-500" : "bg-white/10 hover:bg-white/15"}`}>
          {uploading ? "Enviando…" : imageUrl ? "Trocar imagem" : "Anexar imagem"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} />
        </label>
        {imageUrl && <><span className="text-[11px] text-emerald-400">imagem anexada</span><button type="button" onClick={() => setImageUrl(null)} className="text-[11px] text-gray-500 hover:text-red-400">remover</button></>}
      </div>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="cobrança" className="max-h-28 rounded-lg border border-white/10" />
      )}
      <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 space-y-2">
        <div className="text-[11px] text-gray-400 font-semibold">Se o cliente não responder</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="text-[11px] text-gray-400 mb-1 block">Reforçar após (min, 0 = não)</span><input className="w-full bg-[#09090b] border border-white/10 rounded-lg px-2 py-1.5 text-sm" type="number" value={followupMin} onChange={(e) => setFollowupMin(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-gray-400 mb-1 block">Multa inadimplente (R$)</span><input className="w-full bg-[#09090b] border border-white/10 rounded-lg px-2 py-1.5 text-sm" type="number" value={multa} onChange={(e) => setMulta(e.target.value)} /></label>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={followupAudio} onChange={(e) => setFollowupAudio(e.target.checked)} /> Reforço por áudio (agente com voz)</label>
      </div>
    </div>
  );
}
