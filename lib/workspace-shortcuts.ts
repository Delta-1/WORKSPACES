export type ShortcutScope = "personal" | "company" | "group";
export type ShortcutTargetKind = "web" | "workspace" | "local_app";

export type WorkspaceShortcut = {
  id: string;
  company_id: string;
  group_id: string | null;
  created_by: string;
  scope: ShortcutScope;
  name: string;
  description: string | null;
  target_kind: ShortcutTargetKind;
  target: string;
  provider: string;
  pin_to_dock: boolean;
  file_node_id: string | null;
  server_agent_id: string | null;
  server_status: "waiting_server" | "pending" | "synced" | "error";
  created_at: string;
  updated_at: string;
  groups?: { name: string } | null;
};

const PROVIDERS: [string, RegExp][] = [
  ["google-drive", /(^|\.)drive\.google\.com$/i],
  ["google-docs", /(^|\.)(docs|sheets|slides)\.google\.com$/i],
  ["github", /(^|\.)github\.com$/i],
  ["onedrive", /(^|\.)(onedrive\.live\.com|1drv\.ms|sharepoint\.com)$/i],
  ["dropbox", /(^|\.)dropbox\.com$/i],
  ["notion", /(^|\.)notion\.(so|site)$/i],
  ["figma", /(^|\.)figma\.com$/i],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/i],
  ["discord", /(^|\.)(discord\.com|discord\.gg)$/i],
];

export function normalizeWebTarget(value: string): string {
  const target = value.trim();
  if (!target) return "";
  return /^https?:\/\//i.test(target) ? target : `https://${target}`;
}

export function detectShortcutProvider(target: string, kind: ShortcutTargetKind): string {
  if (kind === "workspace") return "workspaces";
  if (kind === "local_app") return "computer";
  try {
    const hostname = new URL(normalizeWebTarget(target)).hostname;
    return PROVIDERS.find(([, pattern]) => pattern.test(hostname))?.[0] ?? "link";
  } catch {
    return "link";
  }
}

const SAFE_LOCAL_PROTOCOLS = new Set([
  "vscode", "vscode-insiders", "steam", "spotify", "discord", "slack",
  "msteams", "zoommtg", "figma", "notion", "obsidian", "ms-settings",
]);

export function isSafeLocalTarget(value: string): boolean {
  const protocol = value.trim().match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  return Boolean(protocol && SAFE_LOCAL_PROTOCOLS.has(protocol));
}

export function openWorkspaceShortcut(shortcut: WorkspaceShortcut, openWorkspaceApp: (id: string) => void) {
  if (shortcut.target_kind === "workspace") {
    openWorkspaceApp(shortcut.target);
    return;
  }
  if (shortcut.target_kind === "web") {
    window.open(normalizeWebTarget(shortcut.target), "_blank", "noopener,noreferrer");
    return;
  }
  if (!isSafeLocalTarget(shortcut.target)) {
    alert("Este atalho local não usa um protocolo de aplicativo permitido.");
    return;
  }
  window.location.href = shortcut.target;
}

export function shortcutChanged() {
  window.dispatchEvent(new CustomEvent("workspace-shortcuts-changed"));
}
