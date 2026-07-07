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
3. A tabela `public.admins` (coluna `email`) define quem vira "Administrador" no app; qualquer outro e-mail autenticado entra como "Funcionário".

## Integração com WhatsApp

A conexão usa [Baileys](https://github.com/WhiskeySockets/Baileys), que fala diretamente o protocolo do WhatsApp Web — não é a API oficial da Meta. Na aba WhatsApp, clique em "Gerar QR Code", escaneie com o celular (WhatsApp > Aparelhos Conectados) e a sessão fica ativa. A sessão é salva em `.data/wa-session` (não versionada) para não precisar escanear de novo a cada reinício.

Quando conectado, mensagens recebidas de clientes são respondidas automaticamente pela IA (usando o nome da empresa configurado em Configurações), a menos que `autoReply` seja desativado.

Isso exige que o servidor tenha acesso de saída à internet para falar com os servidores do WhatsApp.

## Módulos implementados

- **UX/Visual**: splash screen animada (portas deslizantes), dock inferior com efeito *liquid glass*, gaveta de aplicativos estilo Android, menu de perfil com logout e alternância de tema claro/escuro.
- **Copiloto de IA**: chat interno com texto, upload de imagem e gravação de áudio (transcrita no navegador via Web Speech API).
- **WhatsApp nativo**: QR Code de conexão, resposta automática via IA, log de conversas e envio manual de teste.
- **Arquivos em grafo**: visualização estilo Obsidian (pasta central ramificando em subpastas/arquivos), busca e upload/download pelos nós.

## Pendências conhecidas / próximos passos

- Autenticação real de usuários e hierarquia de permissões (Gestor / Gerente / Funcionário).
- Organograma visual (canvas de hierarquia) e Kanban.
- Modo TV com indicadores de progresso por setor e fotos de funcionários.
- Persistência real (hoje os dados ficam em `.data/db.json`, um arquivo local — trocar por banco de dados antes de produção).
