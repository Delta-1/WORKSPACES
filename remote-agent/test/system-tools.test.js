"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assessCommand, redactSecrets, requiresAlwaysConfirmation, runTool } = require("../src/system-tools");

test("permite diagnósticos conhecidos sem confirmação", () => {
  assert.deepEqual(assessCommand("ipconfig /all"), {
    blocked: false,
    needsApproval: false,
    reason: "Diagnóstico somente leitura.",
  });
  assert.equal(assessCommand("Get-Process").needsApproval, false);
});

test("exige confirmação para comandos que alteram o computador", () => {
  const result = assessCommand("winget install --id Google.Chrome");
  assert.equal(result.blocked, false);
  assert.equal(result.needsApproval, true);
});

test("bloqueia ofuscação, persistência e operações destrutivas", () => {
  assert.equal(assessCommand("powershell -EncodedCommand AAAA").blocked, true);
  assert.equal(assessCommand("net user suporte senha /add").blocked, true);
  assert.equal(assessCommand("schtasks /create /tn update /tr calc.exe /sc onlogon").blocked, true);
  assert.equal(assessCommand("vssadmin delete shadows /all").blocked, true);
  assert.equal(assessCommand("winget install AnyDesk").blocked, true);
  assert.equal(assessCommand("Get-ChildItem env:").blocked, true);
  assert.equal(assessCommand("mshta https://example.com/file").blocked, true);
});

test("oculta segredos antes de devolver a saída ao modelo", () => {
  const text = redactSecrets("access_token=abc123456789 password: segredo Bearer abcdefghijklmnop");
  assert.equal(text.includes("segredo"), false);
  assert.equal(text.includes("abcdefghijklmnop"), false);
  assert.match(text, /\[OCULTO\]/);
});

test("não executa alteração quando a confirmação local é recusada", async () => {
  let asked = false;
  const result = await runTool(
    { action: "run_command", command: "echo teste > arquivo.txt" },
    { confirm: async () => { asked = true; return false; } },
  );
  assert.equal(asked, true);
  assert.equal(result.ok, false);
  assert.equal(result.approved, false);
});

test("modo autônomo executa alteração comum sem confirmação repetitiva", async () => {
  let executed = false;
  const result = await runTool(
    { action: "run_command", mode: "autonomous", command: "winget install --id Google.Chrome" },
    {
      confirm: async () => { throw new Error("não deveria confirmar"); },
      execute: async () => { executed = true; return { ok: true, output: "instalado" }; },
    },
  );
  assert.equal(executed, true);
  assert.equal(result.ok, true);
  assert.equal(result.autonomous, true);
});

test("ações de alto impacto continuam exigindo confirmação no modo autônomo", async () => {
  assert.equal(requiresAlwaysConfirmation("shutdown /s /t 0"), true);
  assert.equal(requiresAlwaysConfirmation("curl https://example.com/app.exe -o app.exe"), true);
  let asked = false;
  const result = await runTool(
    { action: "run_command", mode: "autonomous", command: "shutdown /s /t 0" },
    {
      confirm: async (_command, context) => {
        asked = context.highImpact;
        return false;
      },
      execute: async () => { throw new Error("não deveria executar"); },
    },
  );
  assert.equal(asked, true);
  assert.equal(result.ok, false);
});
