# Workspace — Agente de Acesso Remoto

App desktop (Electron) que roda na máquina do cliente. Captura a tela e recebe
controle de mouse/teclado do operador via **WebRTC**, com sinalização pelo
**Supabase Realtime**. Feito para a **mesma VPN/rede** (conexão direta, sem TURN).

É **um único .exe portátil**. Instala uma vez, **liga sozinho junto com o Windows**
e fica disponível pra você acessar **sempre que precisar, sem pedir permissão** na
máquina do cliente (acesso não assistido / unattended).

---

## Jeito mais fácil: baixar o .exe pronto (sem instalar nada)

Você **não precisa** de Node no seu PC. O .exe é gerado automaticamente no GitHub:

1. No repositório, abra a aba **Actions**.
2. Clique no workflow **"Build Remote Agent (.exe)"** → **Run workflow** (branch `main`).
3. Quando terminar (uns 2–3 min), abra a execução e baixe o artefato
   **`WorkspaceAcessoRemoto-exe`** → dentro vem o `WorkspaceAcessoRemoto.exe`.

Esse .exe já vem com a configuração pública (URL + anon key) embutida. Pronto pra usar.

## Fluxo de suporte (estilo AnyDesk)

1. Mande **o mesmo .exe pra todos os clientes** (não precisa personalizar).
2. O cliente **dá dois cliques**. O app gera um **código de suporte** próprio
   (derivado da máquina, sempre o mesmo naquele PC), **mostra na tela** e já fica
   online — depois some pra bandeja e **passa a subir junto com o Windows**.
3. O cliente **te informa esse código** (telefone/WhatsApp).
4. No seu Workspace → aba **Acesso Remoto**, digite o código em **Sincronizar**.
   A máquina entra na sua lista de clientes.
5. Sempre que precisar, clique em **Conectar** — vê e controla a tela, **sem o
   cliente precisar aceitar**, pela mesma VPN (conexão direta).

> O cliente **nunca acessa o site do Workspace** — só o .exe. A sincronização é só
> um vínculo do código dele com a sua empresa.

---

## Gerar o .exe você mesmo (opcional — precisa de Node)

```bash
cd remote-agent
cp config.public.json config.json   # já vem com URL + anon key públicas
npm install
npm run dist:win     # -> remote-agent/dist/WorkspaceAcessoRemoto.exe
```

> `dist:mac` gera .dmg e `dist:linux` gera AppImage.

## Rodar em desenvolvimento

```bash
cd remote-agent
npm install
cp config.public.json config.json
npm start
```

## Como funciona o "sempre disponível"

- No 1º uso o app registra-se pra **iniciar automaticamente com o sistema**
  (`openAtLogin`), então após reiniciar a máquina ele volta sozinho e fica online.
- Fica um **ícone na bandeja** (Abrir / Sair). Fechar a janela **não** encerra —
  segue rodando em segundo plano.
- Manda um **heartbeat** a cada 20s; a plataforma mostra a máquina como Online.
- Quando você clica em **Conectar**, o agente começa a transmitir a tela e a aceitar
  mouse/teclado **sem prompt** na ponta do cliente.

## Observações importantes

- **Windows** mostra "app não verificado" na 1ª execução (Mais informações →
  Executar assim mesmo). Some se você assinar o app com um certificado de code signing.
- **macOS**: conceda **Gravação de Tela** e **Acessibilidade** ao app em
  Ajustes → Privacidade e Segurança.
- Precisa estar na **mesma VPN/rede** (conexão direta, sem custo de relay).
- O `config.json` só tem valores **públicos** (url + anon key). **Nunca** ponha a
  service_role aqui.
- O pareamento do cliente fica salvo em `userData/pairing.json` na máquina dele.
