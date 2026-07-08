# Workspace Multi-Empresa

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

Schema em `public`: `sectors` (organograma), `profiles` (1:1 com `auth.users`, com `role` e `sector_id`), `tasks` (Kanban, por setor), `attendance` (ponto/presença), `files` (módulo Arquivos, com posição `pos_x`/`pos_y` livre e `drive_file_id`), `ai_config` (chave de IA por usuário) e `company_settings` (nome, logo, Modo TV, Google Drive). RLS aplica a hierarquia de permissões diretamente no banco:

- **Gestor**: acesso total.
- **Gerente/Funcionário**: só veem e editam tarefas do próprio setor (`sector_id` do seu perfil); só o Gestor (ou o Gerente do setor sendo visualizado) pode criar tarefas.
- Qualquer autenticado pode ler `sectors`/`profiles`/`company_settings`/`files`, mas escrita é restrita por papel.
- `ai_config` é privado por usuário (`auth.uid() = user_id`).

## Integração com WhatsApp

A conexão usa [Baileys](https://github.com/WhiskeySockets/Baileys), que fala diretamente o protocolo do WhatsApp Web — não é a API oficial da Meta.

**Importante:** a sessão do WhatsApp precisa de um processo sempre ligado, o que a Vercel (serverless) não oferece. Por isso existe `/whatsapp-service`, um serviço Node separado e independente que você hospeda em algo como Railway/Render/uma VPS — veja `whatsapp-service/README.md` para o passo a passo. Configurando `WHATSAPP_SERVICE_URL` e `WHATSAPP_SERVICE_SECRET` no app principal, a aba WhatsApp passa a falar com esse serviço; sem essas variáveis, ele roda no próprio processo do Next.js (ok para rodar localmente).

Na aba WhatsApp, clique em "Gerar QR Code", escaneie com o celular (WhatsApp > Aparelhos Conectados) e a sessão fica ativa. Quando conectado, mensagens recebidas de clientes são respondidas automaticamente pela IA, a menos que `autoReply` seja desativado.

## Integração de IA (Anthropic / Gemini)

Cada usuário pode configurar sua própria chave de IA em **Configurações → Integração de IA**, escolhendo entre Anthropic (Claude) e Google Gemini — fica salva por usuário na tabela `ai_config` e é usada no Copiloto de IA. Sem chave própria, cai na `ANTHROPIC_API_KEY` do servidor (se configurada) ou modo demo.

## Google Drive

Em **Configurações → Google Drive**, o Gestor pode ativar a sincronização e clicar em "Conectar Google Drive e sincronizar agora": isso pede permissão adicional (`drive.file`) na conta Google, cria no Drive uma pasta para cada pasta do módulo Arquivos e salva o `drive_file_id` correspondente. Como o Google só concede acesso por sessão (não guardamos token de longa duração), é preciso clicar em sincronizar de novo sempre que criar pastas novas.

## Módulos implementados

- **UX/Visual**: splash screen animada (portas deslizantes), dock inferior com efeito *liquid glass*, gaveta de aplicativos estilo Android, menu de perfil com logout e alternância de tema claro/escuro.
- **Copiloto de IA**: chat interno com texto, upload de imagem e gravação de áudio (transcrita no navegador via Web Speech API), com escolha de provedor (Anthropic/Gemini) por usuário.
- **WhatsApp nativo**: QR Code de conexão, resposta automática via IA, log de conversas e envio manual de teste — pronto para rodar num serviço sempre ligado separado da Vercel.
- **Arquivos em grafo**: visualização estilo Obsidian, com nós que podem ser livremente arrastados (posição persistida no Supabase), busca, criação de pastas, upload/download e sincronização opcional com o Google Drive.
- **Organograma visual**: canvas de arrastar/soltar para desenhar setores, definir líder, promover/rebaixar papel de cada funcionário e vincular/remover pessoas de um setor (edição restrita ao Gestor).
- **Kanban real**: tarefas por setor persistidas no Supabase, criadas via modal (assunto + setor) restrito ao Gestor ou ao Gerente do setor, com drag and drop entre A Fazer / Em Execução / Concluído.
- **Permissões por papel**: Gestor Geral (tudo), Administrador de Setor / Gerente e Funcionário (escopo do próprio setor via RLS).
- **Modo TV**: overlay em tela cheia com relógio, progresso `concluído/total` por setor e fotos dos funcionários com ponto batido no dia; logo com posição configurável.

## Pendências conhecidas / próximos passos

- Deploy efetivo do `/whatsapp-service` (o código está pronto, falta só a hospedagem — ver README dele).
- Módulo de atendimento estilo CRM (fila de atendimento, contatos, atendentes, mural de avisos, relatórios) — próxima rodada.
- Permissões mais finas no organograma (hoje Gerente só visualiza, não edita seu próprio setor).
- Upload de foto de perfil próprio (hoje `avatar_url` só vem do Google).
- Sincronização de arquivos (não só pastas) com o Google Drive.
