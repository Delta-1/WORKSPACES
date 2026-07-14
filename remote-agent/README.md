# Workspace — Agente de Acesso Remoto

App desktop (Electron) que roda na máquina do cliente. Captura a tela e recebe
controle de mouse/teclado do operador via **WebRTC**, com sinalização pelo
**Supabase Realtime**. Feito para a **mesma VPN/rede** (conexão direta, sem TURN).

Sai **um único .exe portátil** (sem instalador). O cliente só dá dois cliques.

---

## 1) Gerar o .exe (você, a empresa, UMA vez)

Precisa de **Node.js** no seu computador.

```bash
cd remote-agent
cp config.example.json config.json
# edite config.json com o supabaseUrl e a anon key (PÚBLICA) do seu projeto
#   (qualquer "arquivo de acesso" baixado na aba já traz esses 2 valores)
npm install
npm run dist:win     # -> remote-agent/dist/WorkspaceAcessoRemoto.exe
```

> `dist:mac` gera .dmg e `dist:linux` gera AppImage.

## 2) Mandar pro cliente (um único .exe, sem digitar nada)

1. Na aba **Acesso Remoto**, gere o acesso do cliente e copie o **código** (12 dígitos).
2. **Renomeie** o exe incluindo o código:
   `WorkspaceAcessoRemoto-123456789012.exe`
3. Mande **só esse .exe** pro cliente.
4. O cliente **dá dois cliques** → o app lê o código do nome do arquivo e **conecta
   sozinho** (fica um ícone na bandeja). Nada de instalar nem digitar.
5. Você clica em **Conectar** na plataforma e controla a tela.

> Alternativa: mande o exe **sem renomear**. Aí, na 1ª vez, o cliente digita o código de
> 12 dígitos numa janelinha (depois fica salvo).

---

## Rodar em desenvolvimento
```bash
cd remote-agent
npm install
cp config.example.json config.json   # preencha url + anon key
npm start                            # digite o código quando pedir
```

## Observações importantes
- **Windows** mostra "app não verificado" na 1ª execução (Mais informações → Executar
  assim mesmo). Some se você assinar o app com um certificado de code signing.
- **macOS**: conceda **Gravação de Tela** e **Acessibilidade** ao app em
  Ajustes → Privacidade e Segurança.
- Precisa estar na **mesma VPN/rede** (conexão direta, sem custo de relay).
- O `config.json` só tem valores **públicos** (url + anon key). **Nunca** ponha a
  service_role aqui.
- O pareamento do cliente fica salvo em `userData/pairing.json` na máquina dele.
