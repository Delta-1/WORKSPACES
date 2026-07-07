"use client";

import { Bot, MessageCircle, Network } from "lucide-react";

export default function HomeTab({ companyName }: { companyName: string }) {
  return (
    <div className="h-full flex flex-col gap-6">
      <div>
        <h3 className="text-2xl font-bold">Bem-vindo(a) à {companyName}</h3>
        <p className="text-sm text-gray-400 mt-1">
          Use o dock inferior ou a gaveta de aplicativos para navegar entre o copiloto de IA, o WhatsApp e os
          arquivos da empresa.
        </p>
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
