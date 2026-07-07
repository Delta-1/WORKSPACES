"use client";

import { LucideIcon } from "lucide-react";

export type AppDef = { id: string; label: string; icon: LucideIcon; accent: string };

export default function AppDrawer({
  apps,
  open,
  onClose,
  onSelect,
}: {
  apps: AppDef[];
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center backdrop-blur-2xl bg-black/40"
      onClick={onClose}
    >
      <div
        className="drawer-anim liquid-glass w-full max-w-2xl mb-24 rounded-3xl p-8 grid grid-cols-4 gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => {
              onSelect(app.id);
              onClose();
            }}
            className="flex flex-col items-center gap-2 group cursor-pointer"
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform ${app.accent}`}
            >
              <app.icon size={24} className="text-white" />
            </div>
            <span className="text-xs text-gray-300">{app.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
