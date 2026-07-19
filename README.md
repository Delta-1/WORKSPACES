# Workspace — tudo da sua empresa em um lugar só

**Workspace** junta, num app só, o que a empresa usa no dia a dia: atendimento por
**WhatsApp** com robôs de IA, **acesso remoto** ao computador do cliente (com um
assistente que resolve sozinho), **tarefas**, **arquivos**, **financeiro** e um
**link público de IA** que ajuda qualquer pessoa a mexer no próprio PC. É
multiempresa e marca branca: cada empresa tem a própria logo, dados e agentes.

> 📒 **Quer saber tudo que já foi feito e como usar?**
> Leia as **[Notas de Atualização](./nota-de-atualizacao/README.md)** — a história
> do projeto, todas as ferramentas, o que cada uma resolve e um tutorial rápido,
> em linguagem simples.

## ⬇️ Downloads (testar o agente de Acesso Remoto)

Os instaladores do **agente de Acesso Remoto** ficam na aba **[Releases](https://github.com/Delta-1/WORKSPACES/releases/latest)**
do repositório (canto direito da página do projeto no GitHub). A cada build
automático, uma nova release é publicada com os arquivos anexados:

- **Windows:** `WorkspaceAcessoRemoto-Setup.exe` — instala e se atualiza sozinho.
- **Linux:** `*.AppImage`.

> Como publicar uma nova versão: em **Actions → "Build Remote Agent (.exe)" → Run
> workflow**. Quando terminar, os arquivos aparecem em Releases; copie o link do
> `.exe`/`.AppImage` e cole no site em **Configurações → Instalação → Publicar
> atualização** para todas as máquinas se atualizarem.

---

## Detalhes técnicos

Plataforma de workspace multiempresa com copiloto de IA interno, WhatsApp nativo (via QR Code) e visualização de arquivos em grafo.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

| Variável | Efeito |
| --- | --- |
| `ANTHROPIC_API_KEY` | Chave padrão do servidor para o copiloto de IA e resposta automática do WhatsApp, usada quando o usuário não configurou a própria chave em Configurações. Sem ela (e sem chave pessoal), o app roda em **modo demo**. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ativam o login com Google via Supabase Auth e todo o restante do backend (banco, Kanban, organograma, arquivos). Sem elas, a tela de login cai num "modo demo" com botão de entrada direta. |
| `WHATSAPP_SERVICE_URL` / `WHATSAPP_SERVICE_SECRET` | Apontam para o serviço separado do WhatsApp (ver seção abaixo). Sem elas, o WhatsApp roda no próprio processo do Next.js — funciona localmente, mas não em serverless (Vercel). |

## Login com Google (Supabase Auth)

1. No [Google Cloud Console](https://console.cloud.google.com), crie um OAuth Client ID do tipo "Aplicativo da Web" com o URI de redirecionamento `https://<seu-projeto>.supabase.co/auth/v1/callback`.
2. No painel do Supabase: **Authentication → Sign In / Providers → Google**, cole o Client ID e o Client Secret e salve.
3. A tabela `public.admins` (coluna `email`) define quem vira **Gestor Geral** no primeiro login (via `ensure_profile`); qualquer outro e-mail entra como **Funcionário** até um gestor promovê-lo/vincular a um setor.
4. As variáveis `NEXT_PUBLIC_*` são embutidas no código **no momento do build** — se você mudá-las na Vercel depois do primeiro deploy, precisa gerar um novo deploy para elas passarem a valer.

## Banco de dados (Supabase)

Schema em `public`: `sectors` (organograma), `profiles` (1:1 com `auth.users`, com `role` e `sector_id`), `tasks` (Kanban, por setor), `attendance` (ponto/presença), `files` (módulo Arquivos, com posição `pos_x`/`pos_y` livre, `drive_file_id` e `chatbot_id` para a pasta do bot), `ai_config` (chave de IA por usuário) e `company_settings` (nome, logo, Modo TV, Google Drive). Módulo de atendimento/CRM: `contacts`, `conversations` (com `protocol` sequencial, `number_id`, `last_message`), `whatsapp_messages`, `internal_messages`, `announcements` (mural), `tags` + `contact_tags` (etiquetas), `chatbots` (assistentes configuráveis) e `whatsapp_numbers` + `whatsapp_number_access` (multicanal e permissões por número). RLS aplica a hierarquia de permissões diretamente no banco:

- **Gestor**: acesso total.
- **Gerente/Funcionário**: só veem e editam tarefas do próprio setor (`sector_id` do seu perfil); só o Gestor (ou o Gerente do setor sendo visualizado) pode criar tarefas.
- Qualquer autenticado pode ler `sectors`/`profiles`/`company_settings`/`files`, mas escrita é restrita por papel.
- `ai_config` é privado por usuário (`auth.uid() = user_id`).
- **Conversas por número**: a leitura das conversas respeita `whatsapp_number_access` via a função `can_access_number()` — se um número tem setores/pessoas marcados, só eles veem aquelas conversas; sem restrição, todos os autenticados veem. Gestor gerencia números, chatbots e etiquetas.
- O `whatsapp-service` usa a **service_role key** (só no Railway, nunca no navegador) para gravar contatos/conversas/mensagens sem depender de um usuário logado.

## Integração com WhatsApp

A conexão usa [Baileys](https://github.com/WhiskeySockets/Baileys), que fala diretamente o protocolo do WhatsApp Web — não é a API oficial da Meta.

**Importante:** a sessão do WhatsApp precisa de um processo sempre ligado, o que a Vercel (serverless) não oferece. Por isso existe `/whatsapp-service`, um serviço Node separado e independente que você hospeda em algo como Railway/Render/uma VPS — veja `whatsapp-service/README.md` para o passo a passo. Configurando `WHATSAPP_SERVICE_URL` e `WHATSAPP_SERVICE_SECRET` no app principal, a aba WhatsApp passa a falar com esse serviço; sem essas variáveis, ele roda no próprio processo do Next.js (ok para rodar localmente).

### Multicanal (vários números)

Na aba **WhatsApp**, o Gestor adiciona quantos números quiser (ex.: "Vendas", "Suporte"). Cada número:

- Gera seu **próprio QR Code** e roda uma sessão Baileys independente no serviço (`.wa-session/<numberId>`), reconectando sozinho no boot.
- Pode ter um **setor responsável** (novas conversas já entram naquele setor) e um **chatbot** vinculado.
- Tem **permissões**: marque setores e/ou funcionários específicos que podem atender aquele número. Sem nada marcado, todos veem.

### Chatbot configurável (auto-resposta)

Em **Configurações → Chatbot de Atendimento**, o Gestor define nome/persona ("Pedro"), saudação de primeiro contato, instruções de comportamento, base de conhecimento (texto + pasta de arquivos própria que também aparece no grafo principal) e o provedor de IA + chave (Anthropic/Gemini/OpenAI). Ligando o chatbot e a "Auto-resposta da IA" no número desejado, ele passa a atender os clientes automaticamente antes de repassar para um humano.

### Atendimento (WhatsApp Web + fila)

- **Aba WhatsApp Web**: layout fiel ao WhatsApp Web, com lista de conversas (prévia da última mensagem, hora, não lidas, etiquetas), busca, filtros (Todos/Espera/Atendendo), etiquetagem de contatos e **sincronia em tempo real** via Supabase Realtime.
- **Etiquetas automáticas**: todo contato novo recebe a etiqueta "Novo contato"; o Gestor/Gerente cria e aplica outras.
- **Notificações**: quando entra um cliente na fila, o app toca um sino (repetido até alguém assumir) e dispara notificação do navegador.
- **Aba Chat** (Atendendo/Espera/Contatos/Interno) e **Atendimentos** (fila com protocolo, filtros, paginação) completam o fluxo.

## Integração de IA (Anthropic / Gemini)

Cada usuário pode configurar sua própria chave de IA em **Configurações → Integração de IA**, escolhendo entre Anthropic (Claude) e Google Gemini — fica salva por usuário na tabela `ai_config` e é usada no Copiloto de IA. Sem chave própria, cai na `ANTHROPIC_API_KEY` do servidor (se configurada) ou modo demo.

## Google Drive

Em **Configurações → Google Drive**, o Gestor pode ativar a sincronização e clicar em "Conectar Google Drive e sincronizar agora": isso pede permissão adicional (`drive.file`) na conta Google, cria no Drive uma pasta para cada pasta do módulo Arquivos e salva o `drive_file_id` correspondente. Como o Google só concede acesso por sessão (não guardamos token de longa duração), é preciso clicar em sincronizar de novo sempre que criar pastas novas.

## Módulos implementados

- **UX/Visual**: splash screen animada (portas deslizantes), dock inferior com efeito *liquid glass*, gaveta de aplicativos estilo Android, menu de perfil com logout e alternância de tema claro/escuro.
- **Copiloto de IA**: chat interno com texto, upload de imagem e gravação de áudio (transcrita no navegador via Web Speech API), com escolha de provedor (Anthropic/Gemini) por usuário.
- **WhatsApp estilo DropDesk**: multicanal (vários números, cada um com QR e sessão própria), permissões por setor/funcionário por número, chatbot configurável de auto-resposta, aba WhatsApp Web com sincronia em tempo real, etiquetas automáticas e notificações sonoras de novos clientes — pronto para rodar num serviço sempre ligado separado da Vercel.
- **Arquivos em grafo**: visualização estilo Obsidian, com nós que podem ser livremente arrastados (posição persistida no Supabase), busca, criação de pastas, upload/download e sincronização opcional com o Google Drive.
- **Organograma visual**: canvas de arrastar/soltar para desenhar setores, definir líder, promover/rebaixar papel de cada funcionário e vincular/remover pessoas de um setor (edição restrita ao Gestor).
- **Kanban real**: tarefas por setor persistidas no Supabase, criadas via modal (assunto + setor) restrito ao Gestor ou ao Gerente do setor, com drag and drop entre A Fazer / Em Execução / Concluído.
- **Permissões por papel**: Gestor Geral (tudo), Administrador de Setor / Gerente e Funcionário (escopo do próprio setor via RLS).
- **Modo TV**: overlay em tela cheia com relógio, progresso `concluído/total` por setor e fotos dos funcionários com ponto batido no dia; logo com posição configurável.

## Pendências conhecidas / próximos passos

- Módulos **Empresas** (cadastro de empresas-cliente) e **Relatórios** do CRM — próxima rodada.
- Permissões mais finas no organograma (hoje Gerente só visualiza, não edita seu próprio setor).
- Upload de foto de perfil próprio (hoje `avatar_url` só vem do Google).
- Sincronização de arquivos (não só pastas) com o Google Drive.
- Envio de mídia (foto/áudio/arquivo) pelo WhatsApp — hoje o envio pela plataforma é de texto.
- O fallback in-process (`lib/whatsapp.ts`, usado sem `WHATSAPP_SERVICE_URL`) é single-número e não persiste no schema novo — use o `whatsapp-service` para o fluxo completo.
