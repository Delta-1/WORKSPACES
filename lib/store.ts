import fs from "fs";
import os from "os";
import path from "path";

// Serverless platforms (e.g. Vercel) only allow writes under the OS temp dir;
// the project directory itself is read-only there. This store is a demo-only
// placeholder (see README) and isn't expected to persist across cold starts
// in that environment.
const DATA_DIR = path.join(os.tmpdir(), "workspace-app-data");
const DB_FILE = path.join(DATA_DIR, "db.json");

type Db = {
  company: { name: string; logoDataUrl: string | null };
  whatsappMessages: { id: string; from: string; text: string; direction: "in" | "out"; at: string }[];
};

const DEFAULT_DB: Db = {
  company: { name: "Workspace", logoDataUrl: null },
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
