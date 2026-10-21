import type { Metadata } from "next";
import WorkspaceApp from "@/components/WorkspaceApp";

export const metadata: Metadata = {
  title: "Workspaces Atendimento",
  description: "Aplicativo de atendimento para a equipe da sua empresa.",
  manifest: "/atendimento/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Atendimento", statusBarStyle: "black-translucent" },
};

export default function Page() {
  return <WorkspaceApp employeeApp />;
}
