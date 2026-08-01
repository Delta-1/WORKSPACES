// Capacidades que um agente (Labs) pode ter dentro do workspace. Lista única
// usada tanto pelo editor do agente (LabsTab) quanto pelo bloco "Ferramenta"
// do fluxograma (BotFlowBuilder) — mantém os dois em sincronia com os nomes
// de capacidade que o whatsapp-service entende (CAP_TOOLS em server.js).
export type Capability = { id: string; label: string; desc: string };

export const CAPS: Capability[] = [
  { id: "files", label: "Arquivos", desc: "Buscar e enviar arquivos/imagens da empresa" },
  { id: "tasks", label: "Tarefas", desc: "Criar e mover tarefas no Kanban" },
  { id: "clients", label: "Clientes", desc: "Consultar e cadastrar clientes (CRM)" },
  { id: "announcements", label: "Mural", desc: "Publicar avisos no mural" },
  { id: "attendance", label: "Atendimento", desc: "Abrir/encerrar atendimentos" },
  { id: "relay", label: "Assessor", desc: "Enviar mensagens no WhatsApp por você" },
  { id: "remote", label: "Acesso remoto (beta)", desc: "Ver/controlar máquinas via acesso remoto" },
  { id: "forms", label: "Formulários", desc: "Registrar dados em planilhas/formulários da empresa" },
  { id: "academico", label: "Estúdio Acadêmico", desc: "Gerar e enviar trabalhos (.docx/.pdf) e apresentações (.pptx)" },
  { id: "logistica", label: "Logística Internacional", desc: "Status de cargas, localização de motoristas e documentos aduaneiros" },
  { id: "cobranca", label: "Cobrador (cobranças)", desc: "Consulta cobranças pendentes e situação de cada cliente" },
];
