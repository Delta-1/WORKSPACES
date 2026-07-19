# 📒 Notas de Atualização — Workspace

> Tudo que o Workspace virou, contado do começo até agora — em linguagem simples.
> (Este arquivo é o "leia-me" fácil. O README técnico continua na raiz do projeto.)

---

## 🎯 O foco: **tudo em um só lugar**

O Workspace nasceu de uma ideia simples: em vez de a empresa pular entre 5 programas
diferentes (um pra WhatsApp, um pra tarefas, um pra acesso remoto, um pra
financeiro, um pra arquivos…), **tudo fica dentro de um app só**, com uma
inteligência artificial que ajuda em cada parte.

É **multiempresa** e **marca branca**: cada empresa entra com o próprio código,
tem a própria logo, cores, número de WhatsApp, agentes de IA e dados totalmente
separados dos outros.

**O que isso resolve na prática:** menos programa aberto, menos senha, menos
retrabalho. A pessoa fala com o cliente, abre uma tarefa, acessa a máquina dele,
lança uma despesa e pede ajuda pra IA — sem sair da tela.

---

## 🧭 A trajetória (da 1ª versão até agora)

### 1) A base (o esqueleto)
- App **Next.js** premium (splash, menu lateral estilo "vidro", perfil).
- **Login** com Google e com **e-mail/senha + código da empresa** (onboarding com
  porte/CNPJ e planos).
- Permissões por cargo: **Gestor**, **Gerente**, **Funcionário**.

### 2) Organização do trabalho
- **Organograma** visual (arrasta e solta).
- **Kanban** de tarefas ligado a setores.
- **Calendário**, **Mural de avisos** e **Modo TV** (painel pra pendurar na parede
  com o progresso de cada setor).

### 3) Arquivos em grafo (estilo Obsidian)
- Pastas e arquivos viram uma **teia** que você navega, com física suave.
- Integração opcional com **Google Drive**.

### 4) WhatsApp de verdade (CRM)
- Conecta o WhatsApp por **QR Code** (vários números).
- Recebe e manda **texto, áudio, imagem, vídeo e arquivo**.
- Fila de **atendimentos** com protocolo, etiquetas e histórico.
- **Chatbot** configurável (personalidade, instruções, IA própria, base de
  conhecimento).

### 5) Inteligência artificial em toda parte
- **Copiloto interno** (para gestores): enxerga o grafo, servidores, arquivos,
  financeiro — e executa por comando.
- **Laboratório de agentes**: crie vários agentes com propósitos diferentes,
  cada um com número, personalidade e um **fluxograma** de atendimento (estilo n8n).

### 6) Acesso remoto (estilo AnyDesk)
- Um **agente** instalado na máquina do cliente permite ver a tela e controlar.
- **Orb**: um assistente de voz que **controla o computador sozinho**.
- Permissões por máquina (controle, arquivos, print) na engrenagem.

### 7) Financeiro
- Controle **da empresa** e **da casa**, com uma "super calculadora".

---

## 🆕 As atualizações mais recentes (o que acabou de entrar)

### 🤖 Atendimento por WhatsApp mais inteligente
- **Fim do loop chato:** quando o bot decide encerrar ou passar pra um humano,
  ele **realmente** encerra/transfere (antes ficava repetindo "vou encerrar").
- **Bot fica quieto** quando um atendente humano assume — sem responder por cima.
- **Áudio é prioridade** para **todos** os agentes (não só o copiloto): responde
  em voz quando dá, e troca pra texto se a pessoa pedir.
- **Todos os bots enxergam imagens:** o cliente manda um print/foto e o bot
  entende (diagnostica erro, vê comprovante, etc.).
- **Memória evolutiva:** cada agente ganha uma "pasta-cérebro" no grafo e vai
  **aprendendo** com os atendimentos (vícios de linguagem, jeito de falar, fatos).
- **Backup e limpeza** de **todas** as conversas de uma vez.
- Novos modelos de agente: **Suporte, Recepção/Triagem, Vendas e Financeiro**.

### 🖱️ Orb (assistente que mexe no PC) muito mais preciso
- Age **em passos**: faz algo, **vê o resultado** num print novo e continua até
  concluir a tarefa (antes agia uma vez e parava).
- **Pergunta em vez de adivinhar** quando há itens de nome parecido.
- Print maior e mais nítido → mira o ícone certo.
- **Mouse humano** (desliza até o alvo) e abre app da área de trabalho com duplo
  clique.

### 📦 Instalador e atualização automática
- O agente virou **instalador de verdade (NSIS)** — instala e **atualiza sozinho**
  (antes era "portátil", só abria).
- **Publicador de versão** no site: sobe o `.exe`/`.AppImage` **ou cola um link
  direto** (ex.: Release do GitHub), e todas as máquinas se atualizam sozinhas —
  **sem precisar digitar número de versão**.

### 🌐 Workspace.IA (a grande novidade)
- **Um link público por empresa** (`/work/seu-link`) que **qualquer pessoa abre
  sem login** e é ajudada a mexer no próprio computador.
- **Dois poderes:**
  - **Guiado:** a IA **circula na tela** (🔴 vermelho = "clique aqui", 🟡 amarelo
    = "olhe aqui") e explica o passo a passo.
  - **Autônomo:** a IA **faz sozinha** (clica, digita, instala).
- **Instalar acesso + colar código:** a pessoa conecta a própria máquina e a IA
  passa a **ver a tela**.
- **Login próprio** (nome de usuário + e-mail + senha, com senha **criptografada**).
- **Nunca mostra dados internos** da empresa — só ajuda.
- **Aba Clientes.IA:** todo mundo que entra pelo link vira um contato na sua base
  (nome + e-mail + máquina + última entrada), separado dos clientes normais.

### 🧰 Download de Ferramentas (mini "loja" de apps)
- Cadastre ferramentas (nome, ícone, descrição e link) em **Configurações →
  Download de Ferramentas**.
- Elas aparecem no **"+" do WhatsApp** (mandar o link pro cliente) e no **menu do
  acesso remoto** (abrir/instalar direto na máquina do cliente, ex.: CPU-Z).

---

### 🏢 Multiempresa, Casa e Administrador Geral
- **Troca de ambiente** (canto superior direito): a mesma pessoa pode estar em
  várias empresas e na própria **Casa** (conta pessoal, cadastrada só com o nome).
  Trocar não mistura nada — cada ambiente tem seus dados. Dá pra **remover** um
  ambiente da lista.
- **Administrador Geral** (o dono do software): aba **Empresas** com todas as
  empresas que usam o Workspace, licença (ativar teste 7 dias / ativar / bloquear)
  e as **chaves de IA/voz** de cada empresa (configura por ela). Só o dono publica
  as atualizações do agente; as empresas só **baixam**.

### 💳 Planos
- Aba **Planos** (do dono da empresa): liga só as ferramentas que quer
  (WhatsApp, Acesso Remoto, IA, Financeiro, Clientes, Automação), escolhe o
  **limite de contatos do WhatsApp** e vê o **valor mensal ao vivo**. O app passa
  a mostrar só o que foi ligado. (Cobrança automática via Mercado Pago entra por
  último.)

### 🎮 Modo Game (na conta Casa)
- Jogar no computador de casa **pelo celular**: tela cheia, **controle estilo
  PlayStation** (2 analógicos, D-pad, △○✕□, L1/R1), atalhos num menuzinho, e o
  analógico vira **mouse** quando não está jogando. Ligado nas Configurações da Casa.

## 🧩 O que cada ferramenta resolve

| Ferramenta | Pra que serve |
| --- | --- |
| **Mensagens (WhatsApp)** | Falar com clientes num só painel, com bot, etiquetas e histórico. |
| **Atendimentos** | Organizar a fila de chamados com protocolo e relatório final. |
| **Copiloto IA** | Um "gerente digital" que consulta e executa coisas por comando. |
| **Labs (agentes)** | Criar robôs de atendimento sob medida, com fluxograma. |
| **Arquivos (grafo)** | Enxergar e organizar tudo como uma teia navegável. |
| **Kanban / Organograma / Calendário** | Tarefas, estrutura da equipe e agenda. |
| **Acesso Remoto + Orb** | Entrar na máquina do cliente e resolver (ou deixar a IA resolver). |
| **Workspace.IA (link)** | Atendimento self-service: o cliente se ajuda sozinho pelo link. |
| **Download de Ferramentas** | Instalar apps na máquina do cliente com um clique. |
| **Financeiro** | Controlar contas da empresa e de casa. |
| **Clientes / Clientes.IA** | Base de clientes cadastrados e de quem chega pelo link. |
| **Mural / Modo TV** | Comunicados internos e painel de acompanhamento. |

---

## 📖 Como usar (tutorial rápido)

1. **Entrar:** faça login com Google ou e-mail/senha + código da empresa.
2. **Configurar a empresa:** em **Configurações**, ajuste logo, cores, endereço,
   telefone e o número de WhatsApp.
3. **Conectar o WhatsApp:** na aba **Mensagens**, escaneie o QR Code.
4. **Criar um agente:** em **Labs**, escolha um modelo (Suporte, Vendas…), dê
   personalidade e ligue no número.
5. **Acesso remoto:** baixe o agente (Configurações → Instalação), instale na
   máquina do cliente e use a aba **Acesso Remoto**.
6. **Ligar o Workspace.IA:** em **Configurações → Instalação → Workspace.IA**,
   ative e **copie o link** pra mandar aos clientes.
7. **Cadastrar ferramentas:** em **Configurações → Download de Ferramentas**,
   registre os apps que você costuma instalar.

---

## ⬇️ Baixar o agente (pra testar / instalar)

Os instaladores ficam na aba **[Releases](https://github.com/Delta-1/WORKSPACES/releases/latest)**
do repositório no GitHub (a cada build automático sai uma versão nova, com os
arquivos anexados):

- **Windows:** `WorkspaceAcessoRemoto-Setup.exe` — instala e atualiza sozinho.
- **Linux:** `*.AppImage`.

Para gerar uma versão nova: **Actions → "Build Remote Agent (.exe)" → Run
workflow**. Depois copie o link do arquivo em Releases e cole no site em
**Configurações → Instalação → Publicar atualização**.

---

## ⚙️ Onde cada coisa "mora" (pra quem publica)

- **Site (app web):** publica sozinho na **Vercel** a cada atualização.
- **Serviço do WhatsApp:** roda no **Railway** — quando mexemos nele, precisa
  **redeploy**.
- **Agente de acesso remoto:** é gerado pelo **GitHub Actions** e atualizado nas
  máquinas — quando mexemos nele, precisa **regenerar e publicar** a nova versão.

---

*Documento gerado automaticamente como registro das atualizações. Sempre que
tiver uma novidade grande, ela entra aqui.*
