"use client";

import { useState } from "react";
import { Image as ImageIcon, Sliders } from "lucide-react";
import type { CompanySettingsRow } from "@/lib/types";
import AiConfigSection from "./AiConfigSection";
import ChatbotSection from "./ChatbotSection";
import GoogleDriveSection from "./GoogleDriveSection";

type Corner = CompanySettingsRow["tv_logo_corner"];

const CORNERS: { id: Corner; label: string }[] = [
  { id: "top-left", label: "Superior esquerdo" },
  { id: "top-right", label: "Superior direito" },
  { id: "bottom-left", label: "Inferior esquerdo" },
  { id: "bottom-right", label: "Inferior direito" },
];

export default function ConfigTab({
  companyName,
  tvLogoCorner,
  googleDriveEnabled,
  onUpdateCompany,
}: {
  companyName: string;
  tvLogoCorner: Corner;
  googleDriveEnabled: boolean;
  onUpdateCompany: (update: {
    name?: string;
    logoDataUrl?: string;
    tvLogoCorner?: Corner;
    googleDriveEnabled?: boolean;
  }) => void;
}) {
  const [name, setName] = useState(companyName);

  function handleLogo(file: File) {
    const reader = new FileReader();
    reader.onload = () => onUpdateCompany({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="h-full overflow-y-auto custom-scroll flex flex-col gap-6 pb-6">
      <h3 className="text-lg font-bold flex items-center gap-2">
        <Sliders className="text-amber-400" size={20} /> Configurações
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="liquid-glass rounded-2xl p-5 space-y-4 max-w-md">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-white/10 pb-2">
            Empresa
          </h3>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Nome comercial da empresa
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => onUpdateCompany({ name })}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <ImageIcon size={14} /> Logotipo corporativo
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])}
              className="block w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700 cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Posição do logo no Modo TV
            </label>
            <select
              value={tvLogoCorner}
              onChange={(e) => onUpdateCompany({ tvLogoCorner: e.target.value as Corner })}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
            >
              {CORNERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <AiConfigSection />

        <GoogleDriveSection
          enabled={googleDriveEnabled}
          onToggle={(googleDriveEnabled) => onUpdateCompany({ googleDriveEnabled })}
        />

        <ChatbotSection />
      </div>
    </div>
  );
}
