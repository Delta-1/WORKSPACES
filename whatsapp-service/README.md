# WhatsApp Service

Serviço Node separado que mantém a conexão do WhatsApp (via [Baileys](https://github.com/WhiskeySockets/Baileys)) sempre ligada. Precisa rodar num host com processo persistente — **não funciona na Vercel** (serverless, desliga entre requisições).

## Por que separado do app principal?

O app principal (Next.js) roda bem em serverless para tudo — login, IA, banco de dados. Mas a sessão do WhatsApp precisa ficar conectada o tempo todo, então ela mora aqui, num serviço próprio (ex: Railway, Render, uma VPS).

## Deploy (Railway)

1. Crie um novo projeto no [Railway](https://railway.app), apontando para este repositório com **root directory** = `whatsapp-service`.
2. Configure as variáveis de ambiente (veja `.env.example`):
   - `WHATSAPP_SERVICE_SECRET`: uma senha aleatória forte — o app principal precisa da mesma senha para poder chamar esse serviço.
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY`: mesmos valores do app principal.
   - `ANTHROPIC_API_KEY`: opcional, ativa a resposta automática por IA às mensagens recebidas.
3. Deploy. Railway detecta o `package.json` e roda `npm start`.
4. Copie a URL pública gerada (ex: `https://seu-servico.up.railway.app`).
5. No projeto da Vercel (app principal), adicione as variáveis:
   - `WHATSAPP_SERVICE_URL` = a URL do passo 4
   - `WHATSAPP_SERVICE_SECRET` = a mesma senha do passo 2
6. Redeploy o app principal. A aba WhatsApp passa a falar com esse serviço.

## Rodando localmente

```bash
cd whatsapp-service
npm install
cp .env.example .env   # preencha os valores
npm start
```

A sessão do WhatsApp fica salva em `.wa-session/` (não versionada), então não precisa escanear o QR de novo a cada reinício.
