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
| `ANTHROPIC_API_KEY` | Ativa o copiloto de IA de verdade (Claude) e as respostas automáticas do WhatsApp. Sem ela, o app roda em **modo demo** (respostas simuladas, deixado claro na interface). |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ativam o login com Google via Supabase Auth. Sem elas, a tela de login cai num "modo demo" com botão de entrada direta. |

## Login com Google (Supabase Auth)

1. No [Google Cloud Console](https://console.cloud.google.com), crie um OAuth Client ID do tipo "Aplicativo da Web" com o URI de redirecionamento `https://<seu-projeto>.supabase.co/auth/v1/callback`.
2. No painel do Supabase: **Authentication → Sign In / Providers → Google**, cole o Client ID e o Client Secret e salve.
3. A tabela `public.admins` (coluna `email`) define quem vira **Gestor Geral** no primeiro login (via `ensure_profile`); qualquer outro e-mail entra como **Funcionário** até um gestor promovê-lo/vincular a um setor.

## Banco de dados (Supabase)

Schema em `public`: `sectors` (organograma, com `parent_id`/`leader_id`/posição no canvas), `profiles` (1:1 com `auth.users`, com `role` e `sector_id`), `tasks` (Kanban, por setor), `attendance` (ponto/presença) e `company_settings` (nome, logo, posição do logo no Modo TV). RLS aplica a hierarquia de permissões diretamente no banco:

- **Gestor**: acesso total.
- **Gerente/Funcionário**: só veem e editam tarefas do próprio setor (`sector_id` do seu perfil).
- Qualquer autenticado pode ler `sectors`/`profiles`/`company_settings`, mas só o Gestor edita.

## Integração com WhatsApp

A conexão usa [Baileys](https://github.com/WhiskeySockets/Baileys), que fala diretamente o protocolo do WhatsApp Web — não é a API oficial da Meta. Na aba WhatsApp, clique em "Gerar QR Code", escaneie com o celular (WhatsApp > Aparelhos Conectados) e a sessão fica ativa. A sessão é salva em `.data/wa-session` (não versionada) para não precisar escanear de novo a cada reinício.

Quando conectado, mensagens recebidas de clientes são respondidas automaticamente pela IA (usando o nome da empresa configurado em Configurações), a menos que `autoReply` seja desativado.

Isso exige que o servidor tenha acesso de saída à internet para falar com os servidores do WhatsApp.

## Módulos implementados

- **UX/Visual**: splash screen animada (portas deslizantes), dock inferior com efeito *liquid glass*, gaveta de aplicativos estilo Android, menu de perfil com logout e alternância de tema claro/escuro.
- **Copiloto de IA**: chat interno com texto, upload de imagem e gravação de áudio (transcrita no navegador via Web Speech API).
- **WhatsApp nativo**: QR Code de conexão, resposta automática via IA, log de conversas e envio manual de teste.
- **Arquivos em grafo**: visualização estilo Obsidian (pasta central ramificando em subpastas/arquivos), busca e upload/download pelos nós.
- **Organograma visual**: canvas de arrastar/soltar para desenhar setores, definir líder e ver funcionários vinculados (edição restrita ao Gestor).
- **Kanban real**: tarefas por setor persistidas no Supabase, com drag and drop entre A Fazer / Em Execução / Concluído.
- **Permissões por papel**: Gestor Geral (tudo), Administrador de Setor / Gerente e Funcionário (escopo do próprio setor via RLS).
- **Modo TV**: overlay em tela cheia com relógio, progresso `concluído/total` por setor e fotos dos funcionários com ponto batido no dia; logo com posição configurável.

No painel do Organograma, o Gestor também define o papel de cada funcionário (Funcionário/Gerente/Gestor) e vincula/remove pessoas de um setor direto pela lista lateral.

## Pendências conhecidas / próximos passos

- Permissões mais finas no organograma (hoje Gerente só visualiza, não edita seu próprio setor).
- Upload de foto de perfil próprio (hoje `avatar_url` só vem do Google).
- Mover o armazenamento de arquivos (`.data/db.json`) para o mesmo Supabase, hoje ele é local.
