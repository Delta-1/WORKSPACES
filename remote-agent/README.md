# Workspace — Agente de Acesso Remoto

App desktop (Electron) que roda na máquina do cliente. Ele captura a tela e recebe
controle de mouse/teclado do operador via **WebRTC**, com sinalização pelo
**Supabase Realtime**. Feito para uso na **mesma VPN/rede** (conexão direta, sem TURN).

## Como funciona
1. Na plataforma → aba **Acesso Remoto** → **Gerar acesso** com o nome do cliente.
2. Clique em **Baixar arquivo** — isso baixa `NomeCliente-acesso-remoto.json`.
3. Na máquina do cliente, renomeie o arquivo para **`config.json`** e coloque-o ao lado do agente instalado.
4. Execute o agente. Ele fica **Online** na plataforma.
5. Na plataforma, clique em **Conectar** para ver e controlar a tela.

## Rodar em desenvolvimento
```bash
cd remote-agent
npm install
# coloque um config.json aqui (baixado da plataforma)
npm start
```

## Gerar o instalador (.exe / .dmg / AppImage)
```bash
npm install
npm run dist:win     # Windows (NSIS)
npm run dist:mac     # macOS (DMG)
npm run dist:linux   # Linux (AppImage)
```
O instalador sai em `remote-agent/dist/`.

> Observações
> - **Assinatura de código** é opcional. Sem assinar, o Windows/macOS mostram um aviso de
>   "app não verificado" na primeira execução (basta permitir). Para produção, use um
>   certificado de code signing.
> - **macOS** exige conceder permissão de **Gravação de Tela** e **Acessibilidade** ao app
>   (Ajustes → Privacidade e Segurança) para captura e controle funcionarem.
> - O `config.json` contém `agentId`, `accessCode`, `supabaseUrl` e `supabaseAnonKey`
>   (a anon key é pública por design). Não coloque a service_role aqui.

## Segurança
- O agente autentica-se pelo `accessCode` (código de acesso único do cliente).
- A conexão de tela/controle é **ponta a ponta via WebRTC** (criptografada).
- Recomendado: manter as máquinas na mesma VPN e girar o `accessCode` se necessário
  (remova e gere um novo acesso na plataforma).
