"use client";

import { useEffect, useState } from "react";
import { Bot, Fingerprint, MessageCircle, Network, Tv } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import type { Profile } from "@/lib/types";

export default function HomeTab({
  companyName,
  profile,
  onOpenTV,
}: {
  companyName: string;
  profile: Profile | null;
  onOpenTV: () => void;
}) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !profile) return;
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from("attendance")
      .select("*")
      .eq("profile_id", profile.id)
      .eq("work_date", today)
      .is("check_out", null)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCheckedIn(true);
          setCheckInTime(new Date(data.check_in).toLocaleTimeString("pt-BR"));
        }
      });
  }, [profile]);

  async function bateePonto() {
    if (!supabase || !profile) return;
    setLoading(true);
    const { data } = await supabase
      .from("attendance")
      .insert({ profile_id: profile.id })
      .select("*")
      .single();
    setLoading(false);
    if (data) {
      setCheckedIn(true);
      setCheckInTime(new Date(data.check_in).toLocaleTimeString("pt-BR"));
    }
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Bem-vindo(a) à {companyName}</h3>
          <p className="text-sm text-gray-400 mt-1">
            Use o dock inferior ou a gaveta de aplicativos para navegar entre os módulos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profile && !checkedIn && (
            <button
              onClick={bateePonto}
              disabled={loading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-60"
            >
              <Fingerprint size={14} /> Bater Ponto
            </button>
          )}
          {checkedIn && (
            <div className="text-xs px-3 py-2 bg-emerald-950/40 border border-emerald-800 text-emerald-400 rounded-lg font-mono">
              Ponto OK ({checkInTime})
            </div>
          )}
          <button
            onClick={onOpenTV}
            className="flex items-center gap-2 liquid-glass text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer"
          >
            <Tv size={14} /> Modo TV
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="liquid-glass rounded-xl p-5 flex items-center gap-3">
          <Bot className="text-emerald-400" size={28} />
          <div>
            <p className="text-sm font-semibold">Copiloto de IA</p>
            <p className="text-xs text-gray-400">Texto, foto e áudio</p>
          </div>
        </div>
        <div className="liquid-glass rounded-xl p-5 flex items-center gap-3">
          <MessageCircle className="text-emerald-400" size={28} />
          <div>
            <p className="text-sm font-semibold">WhatsApp</p>
            <p className="text-xs text-gray-400">Conecte via QR Code</p>
          </div>
        </div>
        <div className="liquid-glass rounded-xl p-5 flex items-center gap-3">
          <Network className="text-emerald-400" size={28} />
          <div>
            <p className="text-sm font-semibold">Arquivos</p>
            <p className="text-xs text-gray-400">Visualização em grafo</p>
          </div>
        </div>
      </div>
    </div>
  );
}
