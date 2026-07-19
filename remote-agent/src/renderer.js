// Renderer do agente (host). Fluxo estilo AnyDesk:
// 1) A máquina se registra sozinha com um código próprio (derivado dela).
// 2) Mostra o código na tela — o cliente informa ao suporte.
// 3) Fica online (heartbeat) e aguardando o operador conectar via WebRTC.
const { ipcRenderer } = require("electron");
const { createClient } = require("@supabase/supabase-js");
const zlib = require("zlib");

// Tipo MIME básico a partir da extensão (para o site abrir/baixar corretamente).
function mimeFor(name) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  const map = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", txt: "text/plain",
    csv: "text/csv", json: "application/json", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip", mp4: "video/mp4", mp3: "audio/mpeg", wav: "audio/wav",
  };
  return map[ext] || "application/octet-stream";
}

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];
const statusEl = document.getElementById("status");
const codeEl = document.getElementById("my-code");
const copyBtn = document.getElementById("copy");
const setStatus = (t) => (statusEl.textContent = t);

let supabase = null;
let cfg = null;
let channel = null;
let pc = null;
let stream = null;

function fmtCode(c) {
  return String(c || "").replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

ipcRenderer.on("config", async (_e, config) => {
  cfg = config;
  codeEl.textContent = fmtCode(cfg.accessCode);
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    setStatus("Configuração ausente (config.json embutido).");
    return;
  }
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } });
  await registerSelf();
});

copyBtn?.addEventListener("click", () => {
  ipcRenderer.send("copy-code", cfg?.accessCode);
  copyBtn.textContent = "Copiado!";
  setTimeout(() => (copyBtn.textContent = "Copiar código"), 1500);
});

async function registerSelf() {
  setStatus("Registrando este computador…");
  try {
    const { data, error } = await supabase.rpc("register_self_agent", {
      p_code: cfg.accessCode,
      p_name: cfg.hostName || null,
      p_os: cfg.osName || null,
    });
    if (error || !data) {
      setStatus("Falha ao registrar: " + (error?.message || "sem resposta"));
      return;
    }
    cfg.agentId = data;
    ipcRenderer.send("save-pairing", { agentId: data, accessCode: cfg.accessCode });
    startAgent();
  } catch (e) {
    setStatus("Erro de rede ao registrar: " + e.message);
  }
}

async function reportSpecs() {
  if (!supabase || !cfg?.agentId) return;
  try {
    const specs = await ipcRenderer.invoke("get-specs");
    if (specs) {
      await supabase.rpc("agent_report_specs", {
        p_agent_id: cfg.agentId,
        p_access_code: cfg.accessCode,
        p_specs: specs,
      });
    }
  } catch {
    /* ignore */
  }
}

// ---- Modo SERVIDOR: recebe os arquivos das automações e guarda localmente ----
let serverRoot = null;
let serverGraphFolder = null; // pasta do servidor no grafo (registra os arquivos lá)
let agentSharedPaths = []; // pastas liberadas (allowlist); vazio = sem restrição
let agentPerms = { control: true, files: true, screenshot: true }; // permissões

// O destino está numa pasta liberada? (para decidir se mostra no grafo)
function destShared(destDir) {
  if (!agentSharedPaths.length) return true; // sem restrição → mostra
  const norm = (p) => String(p || "").replace(/[\\/]+$/, "").toLowerCase();
  const t = norm(destDir);
  return agentSharedPaths.some((r) => {
    const n = norm(r);
    return t === n || t.startsWith(n + "\\") || t.startsWith(n + "/");
  });
}
let deliverBusy = false;

async function refreshServerRole() {
  if (!supabase || !cfg?.agentId) return;
  try {
    const { data } = await supabase.rpc("agent_role", { p_agent_id: cfg.agentId, p_access_code: cfg.accessCode });
    const row = Array.isArray(data) ? data[0] : data;
    // Allowlist de pastas (vale para qualquer máquina, servidor ou não).
    agentSharedPaths = Array.isArray(row?.shared_paths) ? row.shared_paths : [];
    try {
      await ipcRenderer.invoke("set-shared-paths", agentSharedPaths);
    } catch {
      /* ignore */
    }
    // Permissões (o que o cliente/técnico liberou). Envia pro processo principal
    // gatear controle e arquivos; o print é gateado aqui mesmo.
    agentPerms = {
      control: row?.allow_control !== false,
      files: row?.allow_files !== false,
      screenshot: row?.allow_screenshot !== false,
    };
    try { ipcRenderer.send("set-perms", agentPerms); } catch { /* ignore */ }
    if (row?.is_server) {
      serverRoot = await ipcRenderer.invoke("server-init", row.server_root || null);
      serverGraphFolder = row.graph_folder_id || null;
      // Reporta o caminho REAL da pasta (para o site mostrar onde ela fica).
      try {
        await supabase.rpc("agent_set_server_path", { p_agent_id: cfg.agentId, p_access_code: cfg.accessCode, p_path: serverRoot });
      } catch {
        /* ignore */
      }
      // Assim que vira servidor, já espelha as pastas no grafo (não espera o ciclo).
      void runServerGraphSync();
    } else {
      serverRoot = null;
      serverGraphFolder = null;
    }
  } catch {
    /* ignore */
  }
}

// Registra nomes de arquivos numa pasta do grafo (best-effort).
async function registerInGraph(folderId, names) {
  if (!folderId || !names || names.length === 0 || !supabase) return;
  try {
    await supabase.rpc("agent_register_files", {
      p_agent_id: cfg.agentId,
      p_access_code: cfg.accessCode,
      p_folder_id: folderId,
      p_names: names,
    });
  } catch {
    /* ignore */
  }
}

async function runDeliveries() {
  if (deliverBusy || !serverRoot || !supabase || !cfg?.agentId) return;
  deliverBusy = true;
  try {
    const { data } = await supabase.rpc("agent_pending_deliveries", {
      p_agent_id: cfg.agentId,
      p_access_code: cfg.accessCode,
    });
    for (const d of data || []) {
      try {
        const destDir = d.dest_path || null;
        const routineSafe = (d.routine_name || "Automacao").replace(/[\\/:*?"<>|]/g, "_");
        // Arquivos reais que vão para o grafo (nome + caminho persistente + mime).
        let graphFiles = [];
        if (String(d.storage_path).endsWith(".wsz")) {
          // Novo formato: baixa UM .wsz comprimido, grava local e guarda no grafo.
          const { data: blob, error } = await supabase.storage.from("automation").download(d.storage_path);
          if (error || !blob) throw error || new Error("download vazio");
          const buf = Buffer.from(await blob.arrayBuffer());
          // 1) grava no disco do servidor (banco de arquivos local).
          await ipcRenderer.invoke("server-extract-bundle", {
            root: serverRoot,
            dir: destDir || `${serverRoot}/Arquivos/${routineSafe}`,
            base64: buf.toString("base64"),
          });
          // 2) descompacta e sobe cada arquivo REAL ao bucket persistente
          //    company-files, para o site abrir/baixar e a IA acessar.
          const payload = JSON.parse(zlib.gunzipSync(buf).toString());
          for (const f of payload.files || []) {
            const rel = String(f.rel || "arquivo");
            const bytes = Buffer.from(f.base64, "base64");
            const objectPath = `${cfg.agentId}/${routineSafe}/${rel}`.replace(/[^\w./-]/g, "_");
            const mime = mimeFor(rel);
            const { error: upErr } = await supabase.storage.from("company-files").upload(objectPath, bytes, { contentType: mime, upsert: true });
            if (!upErr) graphFiles.push({ name: rel.split("/").pop(), storage_path: objectPath, mime });
          }
        } else {
          // Formato antigo (compatibilidade): prefixo com vários objetos.
          const prefix = d.storage_path;
          const { data: listed } = await supabase.storage.from("automation").list(prefix, { limit: 1000 });
          const paths = listed && listed.length > 0 ? listed.filter((o) => o.id).map((o) => `${prefix}/${o.name}`) : [prefix];
          for (const p of paths) {
            const { data: blob, error } = await supabase.storage.from("automation").download(p);
            if (error || !blob) throw error || new Error("download vazio");
            const buf = Buffer.from(await blob.arrayBuffer());
            const fileName = p.split("/").pop();
            await ipcRenderer.invoke("server-write", {
              root: serverRoot,
              dir: destDir,
              rel: destDir ? fileName : `${routineSafe}/${fileName}`,
              base64: buf.toString("base64"),
            });
            const objectPath = `${cfg.agentId}/${routineSafe}/${fileName}`.replace(/[^\w./-]/g, "_");
            const { error: upErr } = await supabase.storage.from("company-files").upload(objectPath, buf, { contentType: mimeFor(fileName), upsert: true });
            if (!upErr) graphFiles.push({ name: fileName, storage_path: objectPath, mime: mimeFor(fileName) });
          }
        }
        // NÃO apaga o automation aqui: a limpeza é central (agent_mark_delivered
        // remove do bucket só quando TODOS os alvos receberam), evitando corrida.
        // Registra no grafo só se a pasta destino estiver liberada (allowlist).
        // Se o gestor escolheu uma pasta do grafo na rotina, respeita a escolha.
        const destForCheck = destDir || `${serverRoot}/Arquivos/${routineSafe}`;
        const gf = d.graph_folder_id || serverGraphFolder;
        if (gf && graphFiles.length && (d.graph_folder_id || destShared(destForCheck))) {
          await supabase.rpc("agent_register_files_v2", {
            p_agent_id: cfg.agentId,
            p_access_code: cfg.accessCode,
            p_folder_id: gf,
            p_files: graphFiles,
          });
        }
        await supabase.rpc("agent_mark_delivered", {
          p_agent_id: cfg.agentId,
          p_access_code: cfg.accessCode,
          p_run_id: d.run_id,
          p_status: "in_server",
          p_error: null,
        });
      } catch (e) {
        await supabase.rpc("agent_mark_delivered", {
          p_agent_id: cfg.agentId,
          p_access_code: cfg.accessCode,
          p_run_id: d.run_id,
          p_status: "error",
          p_error: String(e?.message || e).slice(0, 300),
        });
      }
    }
  } catch {
    /* ignore */
  } finally {
    deliverBusy = false;
  }
}

// Recebe arquivos enviados pelo operador (download "no servidor") e grava na
// pasta Download do servidor.
let transferBusy = false;
async function runTransfers() {
  // Roda em QUALQUER máquina (para receber arquivos distribuídos), não só servidores.
  if (transferBusy || !supabase || !cfg?.agentId) return;
  transferBusy = true;
  try {
    const { data } = await supabase.rpc("agent_pending_transfers", {
      p_agent_id: cfg.agentId,
      p_access_code: cfg.accessCode,
    });
    for (const t of data || []) {
      try {
        const { data: blob, error } = await supabase.storage.from("automation").download(t.storage_path);
        if (error || !blob) throw error || new Error("download vazio");
        const buf = Buffer.from(await blob.arrayBuffer());
        const b64 = buf.toString("base64");
        if (serverRoot) await ipcRenderer.invoke("server-download-write", { root: serverRoot, name: t.filename, base64: b64 });
        else await ipcRenderer.invoke("inbox-write", { name: t.filename, base64: b64 });
        await supabase.storage.from("automation").remove([t.storage_path]);
        if (serverRoot) await registerInGraph(serverGraphFolder, [t.filename]); // grafo do servidor
        await supabase.rpc("agent_mark_transfer", { p_agent_id: cfg.agentId, p_access_code: cfg.accessCode, p_id: t.id, p_status: "done", p_error: null });
      } catch (e) {
        await supabase.rpc("agent_mark_transfer", { p_agent_id: cfg.agentId, p_access_code: cfg.accessCode, p_id: t.id, p_status: "error", p_error: String(e?.message || e).slice(0, 200) });
      }
    }
  } catch {
    /* ignore */
  } finally {
    transferBusy = false;
  }
}

// Espelha o "cérebro" da IA (base de conhecimento da empresa) na pasta Cerebro
// do servidor, para o servidor virar também o banco de dados do cérebro do robô.
let brainBusy = false;
async function runBrainSync() {
  if (brainBusy || !serverRoot || !supabase || !cfg?.agentId) return;
  brainBusy = true;
  try {
    const { data } = await supabase.rpc("agent_brain_files", {
      p_agent_id: cfg.agentId,
      p_access_code: cfg.accessCode,
    });
    const kept = [];
    for (const f of data || []) {
      const body = f.text_content && f.text_content.trim()
        ? f.text_content
        : `(Documento "${f.name}" faz parte do cérebro do robô, mas não tem texto extraído.)`;
      const res = await ipcRenderer.invoke("cerebro-write", { root: serverRoot, name: f.name, content: body });
      if (res?.path) kept.push(res.path.split(/[\\/]/).pop());
    }
    // Remove do Cerebro o que não faz mais parte do cérebro.
    await ipcRenderer.invoke("cerebro-prune", { root: serverRoot, keep: kept });
  } catch {
    /* ignore */
  } finally {
    brainBusy = false;
  }
}

// Espelha a árvore de pastas/arquivos do servidor no grafo do site (ao vivo) e
// sobe o conteúdo dos arquivos ao company-files (para abrir/baixar e a IA usar).
let graphSyncBusy = false;
const uploadedCache = new Map(); // rel -> mtime já enviado nesta sessão
async function runServerGraphSync() {
  if (graphSyncBusy || !serverRoot || !serverGraphFolder || !supabase || !cfg?.agentId) return;
  graphSyncBusy = true;
  try {
    const entries = await ipcRenderer.invoke("server-tree", serverRoot);
    for (const e of entries || []) {
      if (e.dir) continue;
      const objectPath = `srv/${cfg.agentId}/${e.rel}`.replace(/[^\w./-]/g, "_");
      e.storage_path = objectPath;
      e.mime = mimeFor(e.rel);
      // Sobe o conteúdo só quando mudou (evita reenviar tudo a cada ciclo).
      if (uploadedCache.get(e.rel) !== e.mtime) {
        const b64 = await ipcRenderer.invoke("server-read", e.src);
        if (b64) {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const { error } = await supabase.storage.from("company-files").upload(objectPath, bytes, { contentType: e.mime, upsert: true });
          if (!error) uploadedCache.set(e.rel, e.mtime);
        }
      }
    }
    if (entries && entries.length) {
      await supabase.rpc("agent_sync_server_graph", {
        p_agent_id: cfg.agentId,
        p_access_code: cfg.accessCode,
        p_root: serverGraphFolder,
        p_entries: entries,
      });
    }
  } catch {
    /* ignore */
  } finally {
    graphSyncBusy = false;
  }
}

// Executa as operações do grafo no disco do servidor (apagar/renomear/mover).
let fsOpsBusy = false;
async function runServerFsOps() {
  if (fsOpsBusy || !serverRoot || !supabase || !cfg?.agentId) return;
  fsOpsBusy = true;
  try {
    const { data } = await supabase.rpc("agent_pending_fs_ops", { p_agent_id: cfg.agentId, p_access_code: cfg.accessCode });
    for (const o of data || []) {
      let res = { ok: false };
      try {
        if (o.op === "delete") res = await ipcRenderer.invoke("server-delete", o.path);
        else if (o.op === "rename" || o.op === "move") res = await ipcRenderer.invoke("server-move", { from: o.path, to: o.new_path });
      } catch (e) {
        res = { ok: false, error: String(e?.message || e) };
      }
      await supabase.rpc("agent_mark_fs_op", {
        p_agent_id: cfg.agentId,
        p_access_code: cfg.accessCode,
        p_id: o.id,
        p_status: res?.ok ? "done" : "error",
        p_error: res?.ok ? null : String(res?.error || "falha").slice(0, 200),
      });
      // Se mudou algo no disco, re-sincroniza o grafo.
      if (res?.ok) uploadedCache.clear();
    }
  } catch {
    /* ignore */
  } finally {
    fsOpsBusy = false;
  }
}

// Trabalhos sob demanda vindos do site/copiloto (ex.: tirar um print da tela e
// devolver a URL). O suporte pede "print da máquina do fulano" e chega aqui.
let jobsBusy = false;
async function runAgentJobs() {
  if (jobsBusy || !supabase || !cfg?.accessCode) return;
  jobsBusy = true;
  try {
    const { data } = await supabase.rpc("agent_pending_jobs", { p_access_code: cfg.accessCode });
    for (const j of data || []) {
      if (j.kind === "screenshot") {
        if (!agentPerms.screenshot) {
          await supabase.rpc("agent_complete_job", { p_access_code: cfg.accessCode, p_job_id: j.id, p_url: null, p_error: "print não permitido nesta máquina" });
          continue;
        }
        let url = null, err = null;
        try {
          const base64 = await ipcRenderer.invoke("get-thumbnail", { full: true });
          if (base64) {
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const path = `shots/${cfg.agentId}-${Date.now()}.jpg`;
            const { error } = await supabase.storage.from("agent-thumbs").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
            if (error) err = error.message;
            else url = supabase.storage.from("agent-thumbs").getPublicUrl(path).data.publicUrl;
          } else err = "sem imagem";
        } catch (e) { err = String(e?.message || e).slice(0, 200); }
        await supabase.rpc("agent_complete_job", { p_access_code: cfg.accessCode, p_job_id: j.id, p_url: url, p_error: url ? null : (err || "falha") });
      } else if (j.kind === "show_orb") {
        try { ipcRenderer.send("orb-show"); } catch { /* ignore */ }
        await supabase.rpc("agent_complete_job", { p_access_code: cfg.accessCode, p_job_id: j.id, p_url: null, p_error: null });
      } else if (j.kind === "highlight") {
        // Modo GUIADO: desenha um círculo (vermelho/amarelo) na tela mostrando
        // onde a pessoa deve clicar. Não mexe em nada — só destaca.
        try { ipcRenderer.send("highlight-at", j.params || {}); } catch { /* ignore */ }
        await supabase.rpc("agent_complete_job", { p_access_code: cfg.accessCode, p_job_id: j.id, p_url: null, p_error: null });
      } else if (j.kind === "input") {
        // Modo AUTÔNOMO: a IA age na tela (clica/digita/abre). Exige permissão de
        // controle na máquina.
        let err = null;
        if (!agentPerms.control) {
          err = "controle não permitido nesta máquina";
        } else {
          try {
            const p = j.params || {};
            const act = String(p.action || "");
            if (act === "clickat" || act === "doubleclickat") {
              ipcRenderer.send("input", { kind: "move", x: Number(p.x) || 0, y: Number(p.y) || 0, smooth: true });
              await new Promise((r) => setTimeout(r, 380));
              ipcRenderer.send("input", { kind: "click", button: 0 });
              if (act === "doubleclickat") { await new Promise((r) => setTimeout(r, 90)); ipcRenderer.send("input", { kind: "click", button: 0 }); }
            } else if (act === "type") {
              ipcRenderer.send("input", { kind: "type", text: String(p.text || "") });
            } else if (act === "key") {
              ipcRenderer.send("input", { kind: "combo", name: String(p.name || "") });
            } else if (act === "open") {
              ipcRenderer.send("input", { kind: "combo", name: "run" });
              await new Promise((r) => setTimeout(r, 500));
              ipcRenderer.send("input", { kind: "type", text: String(p.text || "") });
              await new Promise((r) => setTimeout(r, 250));
              ipcRenderer.send("input", { kind: "combo", name: "enter" });
            } else if (act === "click") {
              ipcRenderer.send("input", { kind: "click", button: 0 });
            } else {
              err = "ação desconhecida";
            }
          } catch (e) { err = String(e?.message || e).slice(0, 200); }
        }
        await supabase.rpc("agent_complete_job", { p_access_code: cfg.accessCode, p_job_id: j.id, p_url: null, p_error: err });
      } else {
        await supabase.rpc("agent_complete_job", { p_access_code: cfg.accessCode, p_job_id: j.id, p_url: null, p_error: "tipo desconhecido" });
      }
    }
  } catch { /* ignore */ } finally { jobsBusy = false; }
}

async function startAgent() {
  await heartbeat();
  setInterval(heartbeat, 20000);
  runAgentJobs();
  setInterval(runAgentJobs, 2000); // trabalhos sob demanda (print, círculo-guia, ações)
  reportSpecs();
  setInterval(reportSpecs, 300000); // atualiza o panorama a cada 5 min
  refreshServerRole();
  setInterval(refreshServerRole, 120000); // revê o papel de servidor a cada 2 min
  runDeliveries();
  setInterval(runDeliveries, 30000); // recebe entregas (se for servidor) a cada 30s
  runTransfers();
  setInterval(runTransfers, 20000); // recebe transferências manuais (se for servidor)

  uploadThumb();
  setInterval(uploadThumb, 6000); // prévia ao vivo (~a cada 6s)
  runAutomations();
  setInterval(runAutomations, 60000); // rotinas de automação (a cada 1 min)
  runBrainSync();
  setInterval(runBrainSync, 180000); // espelha o cérebro da IA (a cada 3 min)
  runServerGraphSync();
  setInterval(runServerGraphSync, 45000); // espelha as pastas do servidor no grafo
  runServerFsOps();
  setInterval(runServerFsOps, 15000); // aplica apagar/renomear/mover no disco
  join();
}

// Executa as rotinas de automação vencidas: lê o arquivo local e sobe pro
// bucket "automation"; o servidor depois leva pro Google Drive.
let autoBusy = false;
async function runAutomations() {
  if (autoBusy || !supabase || !cfg?.agentId) return;
  autoBusy = true;
  try {
    const { data } = await supabase.rpc("agent_due_routines", {
      p_agent_id: cfg.agentId,
      p_access_code: cfg.accessCode,
    });
    for (const r of data || []) {
      try {
        // Empacota o arquivo/pasta num único .wsz comprimido (rápido, preserva
        // os arquivos reais e a estrutura). Uma só transferência.
        const { bundle, count } = await ipcRenderer.invoke("fs-bundle", r.source_path);
        if (!bundle || !count) throw new Error("Nada encontrado no caminho.");
        const stamp = Date.now();
        const objectPath = `${cfg.agentId}/${r.id}/${stamp}/bundle.wsz`;
        const bytes = Uint8Array.from(atob(bundle), (c) => c.charCodeAt(0));
        const { error } = await supabase.storage
          .from("automation")
          .upload(objectPath, bytes, { contentType: "application/gzip", upsert: true });
        if (error) throw error;
        await supabase.rpc("agent_record_run", {
          p_agent_id: cfg.agentId,
          p_access_code: cfg.accessCode,
          p_routine_id: r.id,
          p_storage_path: objectPath, // .wsz — o servidor baixa e descompacta
          p_status: "uploaded",
          p_error: null,
        });
      } catch (e) {
        await supabase.rpc("agent_record_run", {
          p_agent_id: cfg.agentId,
          p_access_code: cfg.accessCode,
          p_routine_id: r.id,
          p_storage_path: null,
          p_status: "error",
          p_error: String(e?.message || e).slice(0, 300),
        });
      }
    }
  } catch {
    /* ignore */
  } finally {
    autoBusy = false;
  }
}

// Sobe uma miniatura da tela para a listagem de computadores mostrar ao vivo.
let thumbBusy = false;
async function uploadThumb() {
  if (thumbBusy || !supabase || !cfg?.agentId) return;
  thumbBusy = true;
  try {
    const base64 = await ipcRenderer.invoke("get-thumbnail");
    if (base64) {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      await supabase.storage
        .from("agent-thumbs")
        .upload(`${cfg.agentId}.jpg`, bytes, { contentType: "image/jpeg", upsert: true });
    }
  } catch {
    /* ignore */
  } finally {
    thumbBusy = false;
  }
}

async function heartbeat() {
  try {
    await supabase.rpc("agent_heartbeat", {
      p_agent_id: cfg.agentId,
      p_access_code: cfg.accessCode,
      p_os: cfg.osName || null,
    });
    setStatus("Online — pronto para o suporte se conectar.");
  } catch (e) {
    setStatus("Falha ao registrar online: " + e.message);
  }
}

function join() {
  channel = supabase.channel(`remote-${cfg.agentId}`, { config: { broadcast: { self: false } } });
  channel.on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload)).subscribe();
}
function send(payload) {
  channel?.send({ type: "broadcast", event: "signal", payload });
}

async function onSignal(msg) {
  if (!msg || msg.to !== "agent") return;
  if (msg.type === "connect") await startStreaming();
  else if (msg.type === "select-screen") await switchScreen(msg.sourceId);
  else if (msg.type === "set-quality") await setQuality(msg.level);
  else if (msg.type === "answer") await pc?.setRemoteDescription(msg.sdp);
  else if (msg.type === "ice" && msg.candidate) {
    try {
      await pc?.addIceCandidate(msg.candidate);
    } catch {
      /* ignore */
    }
  } else if (msg.type === "stop") cleanup();
}

let videoSender = null;
let screens = [];
let currentSourceId = null;
let currentQuality = "alta";

const QUALITY = {
  alta: { maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30 },
  media: { maxWidth: 1600, maxHeight: 900, maxFrameRate: 30 },
  baixa: { maxWidth: 1280, maxHeight: 720, maxFrameRate: 20 }, // menos lag em rede fraca
};

async function captureScreen(sourceId) {
  const q = QUALITY[currentQuality] || QUALITY.alta;
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxWidth: q.maxWidth,
        maxHeight: q.maxHeight,
        maxFrameRate: q.maxFrameRate,
      },
    },
  });
}

// Troca a resolução/qualidade da transmissão sem reconectar (menos lag).
async function setQuality(level) {
  if (!QUALITY[level] || !videoSender || !currentSourceId) return;
  currentQuality = level;
  try {
    const newStream = await captureScreen(currentSourceId);
    const newTrack = newStream.getVideoTracks()[0];
    await videoSender.replaceTrack(newTrack);
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    stream = newStream;
    setStatus("Qualidade: " + level);
  } catch (e) {
    setStatus("Falha ao mudar qualidade: " + e.message);
  }
}

async function startStreaming() {
  cleanup();
  setStatus("Suporte conectando… iniciando captura.");
  screens = await ipcRenderer.invoke("get-sources");
  const src = screens[0];
  if (!src) {
    setStatus("Nenhuma tela encontrada.");
    return;
  }
  ipcRenderer.send("set-display", src.display_id);
  currentSourceId = src.id;
  stream = await captureScreen(src.id);

  pc = new RTCPeerConnection({ iceServers: ICE });
  stream.getTracks().forEach((t) => {
    const sender = pc.addTrack(t, stream);
    if (t.kind === "video") videoSender = sender;
  });

  const control = pc.createDataChannel("control");
  control.onmessage = (ev) => {
    try {
      ipcRenderer.send("input", JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  };

  // Canal de arquivos: o operador navega, baixa e envia arquivos p/ esta máquina.
  const files = pc.createDataChannel("files");
  files.binaryType = "arraybuffer";
  files.onmessage = (ev) => handleFileOp(files, ev.data);

  pc.onicecandidate = (e) => {
    if (e.candidate) send({ to: "operator", type: "ice", candidate: e.candidate });
  };
  pc.onconnectionstatechange = () => {
    setStatus("Conexão: " + pc.connectionState);
    if (["disconnected", "failed", "closed"].includes(pc.connectionState)) cleanup();
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ to: "operator", type: "offer", sdp: offer });
  // Informa ao operador quantos monitores existem (para trocar de tela).
  send({ to: "operator", type: "screens", list: screens.map((s, i) => ({ id: s.id, name: s.name || `Monitor ${i + 1}` })) });
  setStatus("Transmitindo a tela para o suporte…");
}

// Troca o monitor transmitido sem reconectar (replaceTrack).
async function switchScreen(sourceId) {
  const src = screens.find((s) => s.id === sourceId);
  if (!src || !videoSender) return;
  try {
    const newStream = await captureScreen(src.id);
    const newTrack = newStream.getVideoTracks()[0];
    await videoSender.replaceTrack(newTrack);
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    stream = newStream;
    currentSourceId = src.id;
    ipcRenderer.send("set-display", src.display_id);
    setStatus("Monitor trocado.");
  } catch (e) {
    setStatus("Falha ao trocar de monitor: " + e.message);
  }
}

// Transfere respostas grandes em pedaços (o data channel tem limite ~16KB).
function sendChunked(ch, meta, base64) {
  const CHUNK = 12000;
  ch.send(JSON.stringify({ ...meta, kind: "begin", total: base64.length }));
  for (let i = 0; i < base64.length; i += CHUNK) {
    ch.send(JSON.stringify({ id: meta.id, kind: "chunk", data: base64.slice(i, i + CHUNK) }));
  }
  ch.send(JSON.stringify({ id: meta.id, kind: "end" }));
}

const incoming = new Map(); // uploads em andamento (operador -> máquina)

async function handleFileOp(ch, raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  try {
    if (m.op === "list") {
      const res = await ipcRenderer.invoke("fs-list", m.dir);
      ch.send(JSON.stringify({ op: "list-result", id: m.id, ...res }));
    } else if (m.op === "get") {
      const { name, base64 } = await ipcRenderer.invoke("fs-read", m.path);
      sendChunked(ch, { op: "get-result", id: m.id, name }, base64);
    } else if (m.op === "put-begin") {
      incoming.set(m.id, { dir: m.dir, name: m.name, buf: "" });
    } else if (m.op === "put-chunk") {
      const it = incoming.get(m.id);
      if (it) it.buf += m.data;
    } else if (m.op === "put-end") {
      const it = incoming.get(m.id);
      if (it) {
        const saved = await ipcRenderer.invoke("fs-write", { dir: it.dir, name: it.name, base64: it.buf });
        incoming.delete(m.id);
        ch.send(JSON.stringify({ op: "put-done", id: m.id, path: saved.path }));
      }
    } else if (m.op === "mkdir") {
      const res = await ipcRenderer.invoke("fs-mkdir", { dir: m.dir, name: m.name });
      ch.send(JSON.stringify({ op: "mkdir-done", id: m.id, path: res.path }));
    } else if (m.op === "rename") {
      const res = await ipcRenderer.invoke("fs-rename", { fromPath: m.path, toName: m.name });
      ch.send(JSON.stringify({ op: "rename-done", id: m.id, path: res.path }));
    } else if (m.op === "delete") {
      await ipcRenderer.invoke("fs-delete", m.path);
      ch.send(JSON.stringify({ op: "delete-done", id: m.id }));
    }
  } catch (e) {
    ch.send(JSON.stringify({ op: "error", id: m.id, message: e.message }));
  }
}

function cleanup() {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  try {
    pc?.close();
  } catch {
    /* ignore */
  }
  pc = null;
  stream = null;
}

window.addEventListener("beforeunload", () => {
  if (supabase && cfg?.agentId) supabase.rpc("agent_set_offline", { p_agent_id: cfg.agentId, p_access_code: cfg.accessCode });
});
