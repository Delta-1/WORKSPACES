"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const MAX_COMMAND_LENGTH = 2000;
const MAX_OUTPUT_LENGTH = 9000;

const BLOCKED_RULES = [
  {
    pattern: /(?:^|\s)-(?:e|enc|encodedcommand)\b|\bfrombase64string\b|\bcertutil\b.*(?:^|\s)-decode\b/i,
    reason: "Comandos codificados ou ofuscados não são permitidos.",
  },
  {
    pattern: /\b(?:invoke-expression|iex)\b|(?:curl|wget|irm|invoke-webrequest)[^|\r\n]*\|\s*(?:sh|bash|pwsh|powershell)\b/i,
    reason: "Download com execução direta não é permitido.",
  },
  {
    pattern: /\b(?:mimikatz|sekurlsa|lsass|procdump|comsvcs\.dll.*minidump)\b|(?:login data|cookies|web data|id_rsa|\\sam\b|\/sam\b)/i,
    reason: "Acesso a credenciais ou dados de autenticação foi bloqueado.",
  },
  {
    pattern: /\b(?:net\s+user\b[^\r\n]*\s\/add|new-localuser|set-localuser|add-localgroupmember)\b/i,
    reason: "Criação ou alteração de contas foi bloqueada.",
  },
  {
    pattern: /\b(?:schtasks\s+\/create|register-scheduledtask|new-service|sc(?:\.exe)?\s+create)\b|\\currentversion\\run(?:once)?\b/i,
    reason: "Criação de persistência no sistema foi bloqueada.",
  },
  {
    pattern: /\\start menu\\programs\\startup\\|\bshell:startup\b|\b(?:crontab|systemctl\s+enable|launchctl\s+load)\b|\/(?:etc\/cron|library\/launchagents)\b/i,
    reason: "Criação de inicialização automática foi bloqueada.",
  },
  {
    pattern: /\b(?:anydesk|teamviewer|rustdesk|screenconnect|connectwise|splashtop|ngrok|tailscale)\b|\benable-psremoting\b|\bopenssh\.server\b/i,
    reason: "Criação de outro canal de acesso remoto foi bloqueada.",
  },
  {
    pattern: /\b(?:set-mppreference\s+.*(?:disable|exclusion)|add-mppreference\s+.*exclusion|disable-windowsoptionalfeature.*defender|netsh\s+advfirewall\s+set\s+allprofiles\s+state\s+off|sc(?:\.exe)?\s+(?:stop|delete)\s+windefend|set-executionpolicy\s+(?:bypass|unrestricted))\b/i,
    reason: "Desativar proteções do sistema não é permitido.",
  },
  {
    pattern: /\b(?:vssadmin\s+delete\s+shadows|wbadmin\s+delete|bcdedit\s+.*recoveryenabled\s+no|cipher\s+\/w|format\s+[a-z]:|diskpart)\b/i,
    reason: "Operação destrutiva de disco ou recuperação foi bloqueada.",
  },
  {
    pattern: /(?:^|[\s;&|])rm\s+-[^\r\n]*r[^\r\n]*f[^\r\n]*(?:\/|\$HOME|~)\b|remove-item\b[^\r\n]*(?:-recurse|-force)[^\r\n]*(?:[a-z]:\\|\/|~)/i,
    reason: "Exclusão recursiva ampla foi bloqueada.",
  },
  {
    pattern: /\b(?:get-childitem|gci|dir)\s+env:|\b(?:get-content|cat|type)\b[^\r\n]*(?:\.env\b|credentials\b|browser.*profile)|\bprintenv\b/i,
    reason: "Leitura ampla de variáveis ou arquivos de credenciais foi bloqueada.",
  },
  {
    pattern: /\b(?:mshta|regsvr32|rundll32)\b|\bwmic\b[^\r\n]*process\s+call\s+create\b/i,
    reason: "Execução indireta de código foi bloqueada.",
  },
];

const READ_ONLY_RULES = [
  /^(?:hostname|ver|systeminfo|tasklist)\s*$/i,
  /^whoami(?:\s+\/(?:all|groups|priv))?\s*$/i,
  /^ipconfig(?:\s+\/(?:all|displaydns))?\s*$/i,
  /^(?:ping|tracert|traceroute|nslookup)\s+[-\w.:[\]\s]+$/i,
  /^(?:get-process|get-service|get-computerinfo|get-volume|get-disk)(?:\s+[-\w.*:'",= ]+)?$/i,
  /^get-ciminstance\s+(?:win32_operatingsystem|win32_computersystem|win32_processor|win32_logicaldisk)(?:\s+[-\w.*:'",= ]+)?$/i,
  /^winget\s+(?:list|search|show|source\s+list)(?:\s+[^;&|><\r\n]*)?$/i,
  /^(?:uname|uptime|free|df|ps|ip|ifconfig)(?:\s+[^;&|><\r\n]*)?$/i,
  /^git\s+(?:status|log|diff|branch|rev-parse)(?:\s+[^;&|><\r\n]*)?$/i,
  /^npm\s+(?:list|view|outdated)(?:\s+[^;&|><\r\n]*)?$/i,
];

const HIGH_IMPACT_RULES = [
  /\b(?:del|erase)\b[^\r\n]*\/(?:s|q)\b|\b(?:rd|rmdir)\b[^\r\n]*\/s\b/i,
  /\b(?:remove-item|rm|unlink)\b/i,
  /\b(?:winget|choco|scoop|apt|apt-get|dnf|yum|pacman|brew|npm)\s+(?:uninstall|remove|purge)\b/i,
  /\b(?:shutdown|restart-computer|stop-computer|reboot|poweroff)\b/i,
  /\b(?:taskkill|stop-process)\b/i,
  /\b(?:reg(?:\.exe)?\s+(?:add|delete)|set-itemproperty|remove-itemproperty)\b/i,
  /\b(?:sc(?:\.exe)?\s+(?:start|stop|config)|start-service|stop-service|set-service)\b/i,
  /\b(?:netsh|new-netfirewallrule|set-netfirewallprofile|remove-netfirewallrule)\b/i,
  /\b(?:net\s+user|set-localuser|remove-localuser|net\s+localgroup)\b/i,
  /\b(?:takeown|icacls|chmod|chown)\b/i,
  /\b(?:set-dnsclientserveraddress|new-netipaddress|remove-netipaddress)\b/i,
  /\b(?:curl|wget|irm|invoke-webrequest)\b/i,
  /\bstart-process\b|\.(?:exe|msi|bat|cmd|ps1|sh)\b/i,
  /^(?:powershell|pwsh|cmd|bash|sh|python|python3|node)\b/i,
];

const APP_ALIASES = {
  win32: {
    chrome: "chrome.exe",
    edge: "msedge.exe",
    firefox: "firefox.exe",
    explorer: "explorer.exe",
    notepad: "notepad.exe",
    bloco: "notepad.exe",
    calculator: "calc.exe",
    calculadora: "calc.exe",
    taskmanager: "taskmgr.exe",
    gerenciador: "taskmgr.exe",
    whatsapp: "WhatsApp.exe",
  },
  darwin: {
    chrome: "Google Chrome",
    firefox: "Firefox",
    finder: "Finder",
    notes: "Notes",
    calculator: "Calculator",
    calculadora: "Calculator",
  },
  linux: {
    chrome: "google-chrome",
    firefox: "firefox",
    files: "xdg-open",
    explorer: "xdg-open",
    calculator: "gnome-calculator",
    calculadora: "gnome-calculator",
  },
};

const WEB_ALIASES = {
  youtube: "https://www.youtube.com/",
  google: "https://www.google.com/",
  gmail: "https://mail.google.com/",
  maps: "https://maps.google.com/",
  "google maps": "https://maps.google.com/",
};

function normalizeCommand(command) {
  return String(command || "").trim();
}

function assessCommand(command) {
  const normalized = normalizeCommand(command);
  if (!normalized) return { blocked: true, needsApproval: false, reason: "Comando vazio." };
  if (normalized.length > MAX_COMMAND_LENGTH) {
    return { blocked: true, needsApproval: false, reason: "Comando grande demais." };
  }
  for (const rule of BLOCKED_RULES) {
    if (rule.pattern.test(normalized)) {
      return { blocked: true, needsApproval: false, reason: rule.reason };
    }
  }
  const readOnly = READ_ONLY_RULES.some((rule) => rule.test(normalized));
  return {
    blocked: false,
    needsApproval: !readOnly,
    reason: readOnly
      ? "Diagnóstico somente leitura."
      : "Este comando pode alterar o computador e exige confirmação local.",
  };
}

function requiresAlwaysConfirmation(command) {
  const normalized = normalizeCommand(command);
  return HIGH_IMPACT_RULES.some((rule) => rule.test(normalized));
}

function redactSecrets(value) {
  return String(value || "")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "[CHAVE PRIVADA OCULTA]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, "$1[OCULTO]")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|senha)\b(\s*[:=]\s*)([^\s,;]+)/gi, "$1$2[OCULTO]")
    .replace(/\b(?:ghp|github_pat|sk|sbp)_[A-Za-z0-9_-]{16,}\b/g, "[TOKEN OCULTO]");
}

function limitOutput(value) {
  const redacted = redactSecrets(value).trim();
  if (redacted.length <= MAX_OUTPUT_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_OUTPUT_LENGTH)}\n… saída truncada pelo Orb`;
}

async function executeCommand(command) {
  const options = {
    timeout: 25000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    encoding: "utf8",
  };
  try {
    const result = process.platform === "win32"
      ? await execFileAsync("powershell.exe", [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "RemoteSigned",
          "-Command",
          command,
        ], options)
      : await execFileAsync("/bin/sh", ["-lc", command], options);
    return { ok: true, output: limitOutput([result.stdout, result.stderr].filter(Boolean).join("\n")) || "Comando concluído sem saída." };
  } catch (error) {
    const err = error || {};
    const output = limitOutput([err.stdout, err.stderr, err.message].filter(Boolean).join("\n"));
    return { ok: false, error: output || "Falha ao executar o comando." };
  }
}

function diagnosticCommand(name) {
  const key = String(name || "").toLowerCase();
  const windows = {
    disks: "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,Size,FreeSpace | Format-Table -AutoSize",
    network: "ipconfig /all",
    processes: "Get-Process | Sort-Object CPU -Descending | Select-Object -First 40 Name,Id,CPU,WorkingSet | Format-Table -AutoSize",
    services: "Get-Service | Sort-Object Status,DisplayName | Select-Object -First 80 Status,Name,DisplayName | Format-Table -AutoSize",
  };
  const posix = {
    disks: "df -h",
    network: "ip addr 2>/dev/null || ifconfig",
    processes: "ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -n 45",
    services: "systemctl --no-pager --plain --type=service --state=running 2>/dev/null | head -n 85",
  };
  return (process.platform === "win32" ? windows : posix)[key] || null;
}

function systemInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    ok: true,
    output: [
      `Sistema: ${os.type()} ${os.release()} (${os.arch()})`,
      `Máquina: ${os.hostname()}`,
      `CPU: ${os.cpus()[0]?.model || "desconhecida"} (${os.cpus().length} núcleos lógicos)`,
      `Memória: ${Math.round((total - free) / 1024 / 1024)} MB usados de ${Math.round(total / 1024 / 1024)} MB`,
      `Tempo ligado: ${Math.round(os.uptime() / 60)} minutos`,
    ].join("\n"),
  };
}

async function launchApp(target) {
  const platformAliases = APP_ALIASES[process.platform] || {};
  const normalized = String(target || "").trim().toLowerCase();
  const website = WEB_ALIASES[normalized];
  if (website) {
    try {
      const child = process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", "start", "", website], { detached: true, stdio: "ignore", windowsHide: true })
        : process.platform === "darwin"
          ? spawn("open", [website], { detached: true, stdio: "ignore" })
          : spawn("xdg-open", [website], { detached: true, stdio: "ignore" });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1800);
        child.once("spawn", () => { clearTimeout(timer); resolve(); });
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
      });
      child.unref();
      return { ok: true, output: `${target} foi aberto diretamente no navegador padrão.` };
    } catch (error) {
      return { ok: false, error: limitOutput(error?.message || error) };
    }
  }
  const executable = platformAliases[normalized];
  if (!executable) {
    return {
      ok: false,
      blocked: true,
      error: `Aplicativo não liberado: ${target || "(vazio)"}. Use um nome conhecido ou peça confirmação para um comando.`,
    };
  }
  try {
    const child = process.platform === "darwin"
      ? spawn("open", ["-a", executable], { detached: true, stdio: "ignore" })
      : process.platform === "linux" && executable === "xdg-open"
        ? spawn(executable, [os.homedir()], { detached: true, stdio: "ignore" })
        : spawn(executable, [], { detached: true, stdio: "ignore", windowsHide: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 2000);
      child.once("spawn", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    child.unref();
    return { ok: true, output: `Aplicativo aberto: ${target}.` };
  } catch (error) {
    return { ok: false, error: limitOutput(error?.message || error) };
  }
}

function appendAudit(auditPath, entry) {
  if (!auditPath) return;
  try {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
  } catch {
    // Auditoria é melhor esforço e nunca deve derrubar o acesso remoto.
  }
}

async function runTool(request, options = {}) {
  const action = String(request?.action || "");
  const mode = request?.mode === "autonomous" ? "autonomous" : "supervised";
  const auditPath = options.auditPath;
  const execute = typeof options.execute === "function" ? options.execute : executeCommand;
  let result;
  let audit = { action, mode, approved: false, decision: "allowed" };

  if (action === "diagnostic") {
    const name = String(request?.name || "").toLowerCase();
    if (name === "info") result = systemInfo();
    else {
      const command = diagnosticCommand(name);
      result = command ? await execute(command) : { ok: false, blocked: true, error: `Diagnóstico desconhecido: ${name || "(vazio)"}.` };
    }
    audit.name = name;
  } else if (action === "launch_app") {
    result = await launchApp(request?.target);
    audit.target = String(request?.target || "").slice(0, 80);
  } else if (action === "run_command") {
    const command = normalizeCommand(request?.command);
    const assessment = assessCommand(command);
    audit.commandHash = crypto.createHash("sha256").update(command).digest("hex").slice(0, 16);
    audit.decision = assessment.blocked ? "blocked" : assessment.needsApproval ? "approval-required" : "read-only";
    if (assessment.blocked) {
      result = { ok: false, blocked: true, error: assessment.reason };
    } else if (assessment.needsApproval) {
      const alwaysConfirm = requiresAlwaysConfirmation(command);
      if (mode === "autonomous" && !alwaysConfirm) {
        audit.decision = "autonomous";
        result = { ...(await execute(command)), autonomous: true };
      } else {
        const approved = typeof options.confirm === "function" ? await options.confirm(command, { mode, highImpact: alwaysConfirm }) : false;
        audit.approved = approved;
        audit.decision = alwaysConfirm ? "high-impact-approval" : "approval-required";
        if (!approved) result = { ok: false, approved: false, error: "A pessoa no computador não autorizou este comando." };
        else result = { ...(await execute(command)), approved: true };
      }
    } else {
      result = await execute(command);
    }
  } else {
    result = { ok: false, blocked: true, error: `Ferramenta desconhecida: ${action || "(vazia)"}.` };
    audit.decision = "blocked";
  }

  appendAudit(auditPath, { ...audit, ok: !!result.ok });
  return result;
}

module.exports = {
  assessCommand,
  limitOutput,
  redactSecrets,
  requiresAlwaysConfirmation,
  runTool,
};
