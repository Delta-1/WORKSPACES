# WhatsApp Service

Serviço Node separado que mantém a conexão do WhatsApp (via [Baileys](https://github.com/WhiskeySockets/Baileys)) sempre ligada. Precisa rodar num host com processo persistente — **não funciona na Vercel** (serverless, desliga entre requisições).

## Por que separado do app principal?

O app principal (Next.js) roda bem em serverless para tudo — login, IA, banco de dados. Mas a sessão do WhatsApp precisa ficar conectada o tempo todo, então ela mora aqui, num serviço próprio (ex: Railway, Render, uma VPS).

## Deploy (Railway)

1. Crie um novo projeto no [Railway](https://railway.app), apontando para este repositório com **root directory** = `whatsapp-service`.
2. Configure as variáveis de ambiente (veja `.env.example`):
   - `WHATSAPP_SERVICE_SECRET`: uma senha aleatória forte — o app principal precisa da mesma senha para poder chamar esse serviço.
   - `SUPABASE_URL`: mesma URL do app principal.
   - `SUPABASE_SERVICE_ROLE_KEY`: a chave **service_role** (Project Settings → API no Supabase) — não é a `anon`. Esse serviço grava contatos/conversas/mensagens sem um usuário logado, então precisa de uma chave que ignore as políticas de RLS. Nunca coloque essa chave no app principal (Vercel) nem em qualquer código que rode no navegador.
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

## Notas de voz

Todo áudio enviado pelo atendimento ou pelas automações é convertido para OGG/Opus mono antes do envio. O payload inclui duração e waveform calculadas pelo servidor. Falhas na conversão impedem o envio, sem usar o arquivo original como uma nota de voz incompatível. O histórico guarda o arquivo convertido.

`GET /health` inclui `voiceAudio.pipelineVersion` e `voiceAudio.ready`: o teste de conversão é executado localmente na inicialização, sem enviar mensagens. `ready: false` indica que o conversor precisa ser corrigido no deploy. Um `waId` confirma a submissão ao WhatsApp, não a leitura nem a reprodução no aparelho destinatário. Áudios antigos já entregues com falha devem ser reenviados depois da atualização.
