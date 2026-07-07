import fs from "fs";
import os from "os";
import path from "path";

// Serverless platforms (e.g. Vercel) only allow writes under the OS temp dir;
// the project directory itself is read-only there. This store is a demo-only
// placeholder (see README) and isn't expected to persist across cold starts
// in that environment.
const DATA_DIR = path.join(os.tmpdir(), "workspace-app-data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export type FileNode = {
  id: string;
  name: string;
  type: "folder" | "file";
  parentId: string | null;
  uploadedBy?: string;
  createdAt: string;
  dataUrl?: string;
};

type Db = {
  company: { name: string; logoDataUrl: string | null };
  files: FileNode[];
  whatsappMessages: { id: string; from: string; text: string; direction: "in" | "out"; at: string }[];
};

const DEFAULT_DB: Db = {
  company: { name: "Configuração Pendente", logoDataUrl: null },
  files: [
    { id: "root", name: "Empresa", type: "folder", parentId: null, createdAt: new Date().toISOString() },
    { id: "f-financeiro", name: "Financeiro", type: "folder", parentId: "root", createdAt: new Date().toISOString() },
    { id: "f-rh", name: "RH", type: "folder", parentId: "root", createdAt: new Date().toISOString() },
    { id: "f-suporte", name: "Suporte", type: "folder", parentId: "root", createdAt: new Date().toISOString() },
    { id: "doc-1", name: "Relatorio_Mensal.pdf", type: "file", parentId: "f-financeiro", uploadedBy: "Ana", createdAt: new Date().toISOString() },
    { id: "doc-2", name: "Folha_Pagamento.xlsx", type: "file", parentId: "f-rh", uploadedBy: "Carlos", createdAt: new Date().toISOString() },
    { id: "doc-3", name: "Ticket_0234.txt", type: "file", parentId: "f-suporte", uploadedBy: "Pedro", createdAt: new Date().toISOString() },
  ],
  whatsappMessages: [],
};

// Last-resort fallback if even the OS temp dir isn't writable, so the app
// degrades to non-persistent in-memory data instead of throwing 500s.
let memoryDb: Db | null = null;

function ensureDb(): Db {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(raw) as Db;
  } catch {
    if (!memoryDb) memoryDb = structuredClone(DEFAULT_DB);
    return memoryDb;
  }
}

function saveDb(db: Db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch {
    memoryDb = db;
  }
}

export function getFiles(): FileNode[] {
  return ensureDb().files;
}

export function addFile(node: Omit<FileNode, "id" | "createdAt">): FileNode {
  const db = ensureDb();
  const file: FileNode = {
    ...node,
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  db.files.push(file);
  saveDb(db);
  return file;
}

export function getCompany() {
  return ensureDb().company;
}

export function setCompany(update: Partial<Db["company"]>) {
  const db = ensureDb();
  db.company = { ...db.company, ...update };
  saveDb(db);
  return db.company;
}

export function logWhatsappMessage(entry: Db["whatsappMessages"][number]) {
  const db = ensureDb();
  db.whatsappMessages.push(entry);
  db.whatsappMessages = db.whatsappMessages.slice(-200);
  saveDb(db);
}

export function getWhatsappMessages() {
  return ensureDb().whatsappMessages;
}
