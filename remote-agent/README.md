# Workspace — Agente de Acesso Remoto

App desktop (Electron) que roda na máquina do cliente. Captura a tela e recebe
controle de mouse/teclado do operador via **WebRTC**, com sinalização pelo
**Supabase Realtime**. Feito para a **mesma VPN/rede** (conexão direta, sem TURN).

No 1º uso o cliente só **digita o código de acesso** (12 dígitos) que a empresa passou —
igual AnyDesk/Google Remoto. Não precisa mexer em arquivo.

---

## Passo a passo (o que VOCÊ, a empresa, faz UMA vez)

Você gera o instalador uma vez, no seu computador, e reusa pra todos os clientes.

1. Configure o `config.json` (valores públicos do Supabase — os mesmos do site):
   ```bash
   cd remote-agent
   cp config.example.json config.json
   # edite config.json com o supabaseUrl e a anon key (pública) do seu projeto
   ```
   > Dica: qualquer "arquivo de acesso" baixado na aba **Acesso Remoto** já contém
   > `supabaseUrl` e `supabaseAnonKey` — pode renomear pra `config.json` (o agente
   > ignora os campos de cliente e pede o código na máquina).
2. Instale as dependências e gere o instalador:
   ```bash
   npm install
   npm run dist:win     # Windows (.exe)   |   dist:mac (.dmg)   |   dist:linux (AppImage)
   ```
   O instalador sai em `remote-agent/dist/`.

## O que o CLIENTE faz

1. Você manda pro cliente **só o instalador** (ex.: `Workspace Acesso Remoto Setup.exe`)
   e o **código de acesso** (aquele número de 12 dígitos que aparece no card da máquina
   na aba Acesso Remoto).
2. O cliente **instala** e **abre** o app.
3. Na primeira vez, o app pede o **código** → o cliente digita → pronto, fica **Online**.
4. Você, na plataforma, clica em **Conectar** e controla a tela.

---

## Rodar em desenvolvimento (teste rápido)
```bash
cd remote-agent
npm install
cp config.example.json config.json   # preencha url + anon key
npm start
# digite o código de acesso na janelinha que abrir
```

## Observações importantes
- **Windows/macOS** mostram aviso de "app não verificado" na 1ª execução (é só permitir).
  Some se você assinar o app com um certificado de code signing.
- **macOS**: conceda **Gravação de Tela** e **Acessibilidade** ao app em
  Ajustes → Privacidade e Segurança (senão não captura/controla).
- Precisa estar na **mesma VPN/rede** (conexão direta).
- O `config.json` só tem valores **públicos** (url + anon key). **Nunca** coloque a
  service_role aqui.
- O pareamento do cliente (código) fica salvo em `userData/pairing.json` na máquina dele.
