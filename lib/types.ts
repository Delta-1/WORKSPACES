export type Role = "gestor" | "gerente" | "funcionario";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  sector_id: string | null;
  whatsapp_number: string | null;
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
  created_at: string;
  updated_at: string;
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
  updated_at: string;
};
