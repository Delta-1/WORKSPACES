import {
  AppWindow, Cloud, Cloudy, Code2, Computer, ExternalLink, FileText,
  HardDrive, Link2, MessageCircle, Play, Presentation, Shapes,
} from "lucide-react";

const ICONS = {
  "google-drive": { Icon: HardDrive, color: "text-emerald-300", bg: "bg-emerald-500/15" },
  "google-docs": { Icon: FileText, color: "text-blue-300", bg: "bg-blue-500/15" },
  github: { Icon: Code2, color: "text-slate-100", bg: "bg-slate-500/15" },
  onedrive: { Icon: Cloud, color: "text-sky-300", bg: "bg-sky-500/15" },
  dropbox: { Icon: Cloudy, color: "text-blue-300", bg: "bg-blue-500/15" },
  notion: { Icon: FileText, color: "text-slate-100", bg: "bg-slate-500/15" },
  figma: { Icon: Shapes, color: "text-pink-300", bg: "bg-pink-500/15" },
  youtube: { Icon: Play, color: "text-red-300", bg: "bg-red-500/15" },
  discord: { Icon: MessageCircle, color: "text-indigo-300", bg: "bg-indigo-500/15" },
  workspaces: { Icon: AppWindow, color: "text-emerald-300", bg: "bg-emerald-500/15" },
  computer: { Icon: Computer, color: "text-amber-300", bg: "bg-amber-500/15" },
  slides: { Icon: Presentation, color: "text-orange-300", bg: "bg-orange-500/15" },
  link: { Icon: Link2, color: "text-cyan-300", bg: "bg-cyan-500/15" },
} as const;

export default function ShortcutIcon({ provider, size = 20, className = "" }: { provider: string; size?: number; className?: string }) {
  const item = ICONS[provider as keyof typeof ICONS] ?? { Icon: ExternalLink, color: "text-cyan-300", bg: "bg-cyan-500/15" };
  return (
    <span className={`grid place-items-center rounded-xl ${item.bg} ${item.color} ${className}`}>
      <item.Icon size={size} />
    </span>
  );
}
