export type Role = "gestor" | "gerente" | "funcionario";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  sector_id: string | null;
  company_id: string | null;
  whatsapp_number: string | null;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  logo_url: string | null;
  theme_color: string;
  logo_size: number;
  cnpj: string | null;
  razao_social: string | null;
  company_type: string | null;
  employee_count: number | null;
  company_code: string;
  plan: string;
  ai_addon: boolean;
  subscription_status: string;
  owner_id: string | null;
  created_at: string;
};

export type Sector = {
  id: string;
  name: string;
  parent_id: string | null;
  leader_id: string | null;
  pos_x: number;
  pos_y: number;
  created_at: string;
};

export type TaskColumn = "a_fazer" | "em_andamento" | "concluido";

export type WorkspaceTask = {
  id: string;
  title: string;
  description: string | null;
  sector_id: string;
  assignee_id: string | null;
  column_name: TaskColumn;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export type RemoteAgent = {
  id: string;
  company_id: string | null;
  client_id: string | null;
  name: string;
  access_code: string;
  pin: string | null;
  status: string;
  os: string | null;
  last_seen: string | null;
  created_by: string | null;
  created_at: string;
  specs: AgentSpecs | null;
  is_server: boolean | null;
  server_root: string | null;
  graph_folder_id: string | null;
};

export type AgentSpecs = {
  platform?: string;
  osName?: string;
  hostname?: string;
  arch?: string;
  cpu?: string;
  cores?: number;
  memTotalGB?: number;
  memFreeGB?: number;
  uptimeH?: number;
  networks?: { name: string; ip: string; mac: string }[];
  reportedAt?: string;
};

export type Client = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  document: string | null;
  email: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  company_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  google_event_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type Attendance = {
  id: string;
  profile_id: string;
  work_date: string;
  check_in: string;
  check_out: string | null;
};

export type CompanySettingsRow = {
  id: true;
  name: string;
  logo_url: string | null;
  tv_logo_corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  google_drive_enabled: boolean;
  google_drive_root_folder_id: string | null;
  theme_color: string;
  logo_size: number;
  updated_at: string;
};

export type FileNodeRow = {
  id: string;
  name: string;
  type: "folder" | "file";
  parent_id: string | null;
  uploaded_by: string | null;
  data_url: string | null;
  drive_file_id: string | null;
  chatbot_id: string | null;
  bot_share_status: "none" | "pending" | "approved" | "rejected";
  bot_share_requested_by: string | null;
  text_content: string | null;
  pos_x: number | null;
  pos_y: number | null;
  created_at: string;
};

export type AiProvider = "anthropic" | "openai" | "gemini";

export type AiConfigRow = {
  id: string;
  user_id: string;
  provider: AiProvider;
  api_key: string;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  phone: string;
  jid: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type ConversationStatus = "espera" | "atendendo" | "fechado" | "cancelado";

export type Conversation = {
  id: string;
  protocol: number;
  contact_id: string;
  number_id: string | null;
  sector_id: string | null;
  assignee_id: string | null;
  status: ConversationStatus;
  problem: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type WhatsappMediaType = "image" | "audio" | "video" | "document";

export type WhatsappMessageRow = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  text: string | null;
  media_type: WhatsappMediaType | null;
  media_url: string | null;
  media_name: string | null;
  media_mime: string | null;
  sender_id: string | null;
  at: string;
};

export type Chatbot = {
  id: string;
  name: string;
  persona: string | null;
  instructions: string | null;
  greeting: string | null;
  knowledge: string | null;
  provider: AiProvider;
  api_key: string | null;
  enabled: boolean;
  folder_id: string | null;
  elevenlabs_key: string | null;
  elevenlabs_voice_id: string | null;
  voice_reply: boolean;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type ContactTag = {
  contact_id: string;
  tag_id: string;
  created_at: string;
};

export type WhatsappNumberStatus = "disconnected" | "connecting" | "qr_pending" | "connected";

export type WhatsappNumber = {
  id: string;
  label: string;
  phone_number: string | null;
  sector_id: string | null;
  chatbot_id: string | null;
  auto_reply: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

export type WhatsappNumberAccess = {
  id: string;
  number_id: string;
  sector_id: string | null;
  profile_id: string | null;
  created_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  author_id: string | null;
  pinned: boolean;
  created_at: string;
};

export type InternalMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  at: string;
};
