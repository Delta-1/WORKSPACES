# Regras das IAs de mensagem (Workspace)

Estas regras são **injetadas automaticamente** no prompt de **todas** as IAs de
mensagem (bots de atendimento, copiloto e agentes como a Nina), para **todos os
usuários — atuais e novos**. Não é preciso configurar nada: já vêm ligadas.

Fonte de verdade: constante `SYSTEM_RULES` em `whatsapp-service/src/server.js`.

## Regras gerais (sempre valem)

1. **Nunca** escrever ou falar a palavra "áudio" como rótulo (nada de começar com
   "Áudio:"). Ir direto à resposta. _(Reforçado também no `sanitizeForSpeech`, que
   remove esse rótulo antes de gerar a voz.)_
2. **Não repetir saudação.** Cumprimentar **uma vez** por conversa; se já
   cumprimentou (ex.: "olá, tudo bem"), continuar de onde parou. _(Reforçado pelo
   `stripRepeatedGreeting`, que remove a saudação repetida no começo da resposta
   quando o bot já falou antes.)_
3. **Não repetir** a mesma frase/resposta já enviada — variar e avançar.
4. **Usar o histórico:** não pedir de novo dados que a pessoa já deu.
5. Ser **objetivo, natural e humano** — como uma pessoa real no WhatsApp.
6. **Listas/opções vão por TEXTO** (a pessoa lê com calma), não por áudio.
7. Ser **proativo:** antecipar a necessidade e oferecer 1–2 sugestões úteis.

## Recursos de resposta disponíveis para as IAs

- **`[[TEXTO]]` (ou `[[LISTA]]`)** no meio da resposta: a parte **de cima** é
  falada por **áudio** e a parte **de baixo** é enviada por **texto** (ex.: a Nina
  se apresenta por voz e manda a listinha de funções em texto).
- Respostas que são uma **listagem** já são enviadas por **texto** automaticamente.

## Nina (assistente acadêmica) — comportamento

- Memória **contínua por contato** (lembra dos dados e do tipo de arquivo que a
  pessoa costuma pedir e se adapta).
- Na abertura: apresentação por **voz** + **listinha** de funções por texto.
- Dá uma **previsão de tempo** ao começar a produzir um documento.
- Pede um **arquivo de exemplo/modelo** quando a pessoa tiver, para se inspirar.
- Entrega **.docx + PDF** (trabalhos) e **.pptx** (apresentações).

## Documentos do Estúdio (Nina)

A Nina produz **todos** os modelos do Estúdio → Documentos: currículo,
monografia, trabalho acadêmico, contrato, orçamento, questionário, resumo e
resumão. O roteiro é sempre o mesmo:

1. `documento_modelos` — lê o catálogo do site (`/api/studio/models`). É a fonte
   única: modelo novo criado no app aparece aqui sozinho, sem deploy do serviço.
2. Pergunta os campos do modelo **um por vez**, em conversa natural.
3. `documento_previa` — manda a **imagem** de como o documento vai ficar e
   espera a aprovação. Modelos com variação (temas do currículo, normas da
   monografia) têm uma prévia por variação.
4. `documento_criar` — só depois do "pode fazer". A Nina escreve o conteúdo e o
   site monta o `.docx` (`/api/studio/render`), com a mesma formatação da tela.

Depende de `APP_URL` configurada no serviço. Sem ela, a Nina segue atendendo
normalmente, apenas sem oferecer os modelos do Estúdio.

## Pips — os créditos dos serviços da Nina

1 pip = **R$ 0,50**. Monografia/trabalho custam **100 pips (R$ 50)**; apresentação,
**20 pips (R$ 10)**. Os valores vivem em `lib/pips.ts` e a Nina os consulta com
`pips_tabela` — ela nunca inventa preço.

**A Nina nunca calcula saldo.** Todo movimento passa pelas funções do banco
(`credits_add` / `credits_debit`), que são atômicas: não existe saldo negativo, e
um débito sem saldo é recusado pelo Postgres, não pela IA. O saldo vem sempre de
`pips_saldo`, mesmo quando a Nina "acha" que sabe o valor.

Fluxo obrigatório antes de qualquer serviço pago:

1. dizer o preço em pips **e** em reais;
2. consultar `pips_saldo`;
3. pedir confirmação — *"vou usar X pips do seu saldo de Y pips, posso?"*;
4. só com o sim, `pips_cobrar`;
5. só então produzir.

Compra pelo chat com `pips_comprar`: **Pix criado pela API** (a Nina manda o QR
como imagem e o copia-e-cola em mensagem separada) ou **link de cartão**. O
crédito entra sozinho pelo webhook do Mercado Pago quando o pagamento é aprovado;
`pips_conferir` é a rede de segurança para quando a pessoa diz "já paguei" antes
de o webhook chegar. Creditar duas vezes é impossível: `credits_add` é idempotente
pelo id do pagamento.

Quem recebe: o token do próprio agente (`chatbots.mercadopago_token`) e, na falta
dele, o `MERCADOPAGO_ACCESS_TOKEN` da plataforma — que é o caso hoje.

Na primeira conversa a Nina se apresenta, **pergunta o nome** e o guarda no
contato (`salvar_nome_contato`), sem sobrescrever um nome já cadastrado.
