"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

// Balão de confirmação que EXIGE um motivo antes de uma exclusão. O motivo é
// devolvido no onConfirm (quem chama grava no log). Serve tanto para excluir
// empresa quanto para remover um usuário.
export default function ConfirmReasonModal({
  title,
  message,
  confirmLabel = "Excluir",
  requireReason = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (requireReason && !reason.trim()) { setError("Informe o motivo da exclusão."); return; }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b0f16] border border-red-500/30 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-bold flex items-center gap-2 text-red-300"><AlertTriangle size={16} /> {title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-300">{message}</p>
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Motivo da exclusão {requireReason && <span className="text-red-400">*</span>}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ex.: demissão, quebra de contrato, encerramento…"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer">Cancelar</button>
            <button onClick={go} disabled={busy} className="text-xs px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-60">
              {busy ? "Excluindo…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
