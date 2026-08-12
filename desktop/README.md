# Workspaces Desktop

O app do **Workspaces** para computador (Windows, Mac e Linux), feito com Electron.
Abre o Workspaces numa janela própria — com o ícone do Workspaces na barra de
tarefas — e deixa você jogar **cada app numa janela separada** (widget): arraste o
Kanban para um monitor e o Calendário para outro, cada um independente.

## Rodar em desenvolvimento

```bash
cd desktop
npm install
npm start
```

Na primeira vez o app pergunta o **endereço do seu Workspaces** (ex.:
`suaempresa.com` ou o link do deploy). Ele guarda e reabre direto nas próximas.
Para trocar depois: menu **Arquivo → Configurar endereço…**.

Você pode pré-configurar o endereço ao gerar o instalador, com a variável
`WORKSPACES_URL` (aí o app já abre sem perguntar):

```bash
WORKSPACES_URL="https://suaempresa.com" npm run dist
```

## Gerar os instaladores

```bash
npm run dist        # do sistema atual
npm run dist:win    # Windows  (Workspaces-Setup.exe)
npm run dist:mac    # macOS    (.dmg)
npm run dist:linux  # Linux    (.AppImage)
```

Os arquivos saem em `desktop/dist/`. O ícone usado é `build/icon.png` (o ícone do
Workspaces). Para instaladores de produção o ideal é ter também `build/icon.icns`
(Mac) e `build/icon.ico` (Windows); o electron-builder gera a partir do PNG de
512×512, mas versões dedicadas ficam mais nítidas.

## Como funciona o "abrir em janela"

O app web detecta que está rodando dentro do desktop (`window.workspacesDesktop`)
e, no menu do botão direito de um app, **Abrir em outra aba / janela** passa a
abrir uma **janela nativa** carregando a rota `?solo=<app>` do site — que mostra
só aquele app. Uma janela por app; abrir de novo traz a existente para frente.
