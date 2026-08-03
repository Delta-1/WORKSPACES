# Regras das IAs de mensagem (Workspace)

Estas regras são **injetadas automaticamente** no prompt de **todas** as IAs de
mensagem (bots de atendimento, copiloto e agentes como a Yumi), para **todos os
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
  falada por **áudio** e a parte **de baixo** é enviada por **texto** (ex.: a Yumi
  se apresenta por voz e manda a listinha de funções em texto).
- Respostas que são uma **listagem** já são enviadas por **texto** automaticamente.

## Yumi (assistente acadêmica) — comportamento

- Memória **contínua por contato** (lembra dos dados e do tipo de arquivo que a
  pessoa costuma pedir e se adapta).
- Na abertura: apresentação por **voz** + **listinha** de funções por texto.
- Dá uma **previsão de tempo** ao começar a produzir um documento.
- Pede um **arquivo de exemplo/modelo** quando a pessoa tiver, para se inspirar.
- Entrega **.docx + PDF** (trabalhos) e **.pptx** (apresentações).

## Grupos de WhatsApp

O número lista os grupos de que participa (`whatsapp_groups`, atualizada ao
conectar e pelo botão "Atualizar lista"). A IA é ligada **grupo a grupo**:
grupo que não está na tabela — ou está com `ai_enabled = false` — continua sendo
ignorado exatamente como sempre foi. Ligar é decisão explícita do gestor.

Cada grupo escolhe **qual agente** responde (ou usa o do número) e se ela fala
**só quando marcam** o número (@) ou respondem uma mensagem dela — que é o
padrão. Sem isso um bot respondendo tudo vira spam no grupo.

Sincronizar **não apaga** o que o gestor configurou: o upsert manda só nome,
participantes e `is_admin`; `ai_enabled`, `chatbot_id` e `only_mention` ficam de pé.

O grupo entra como um contato com `is_group = true`, então conversa, histórico,
pausa do bot e a caixa de entrada funcionam sem nada novo. Em compensação, tudo
que é de atendimento 1:1 fica **desligado** em grupo: saudação, fluxograma,
encerramento por inatividade, relatório de contato, `/configia`, login do
copiloto e a baixa automática de comprovante do Cobrador — uma foto qualquer no
grupo não pode dar cobrança por paga.

A IA recebe cada mensagem como `"Nome: texto"` (senão lê a conversa de dez
pessoas como se fosse uma só) e ganha as regras de convívio no prompt: resposta
curta, sem cumprimentar toda hora, assunto pessoal no privado. Quando a conversa
claramente não é com ela, responde `[[NADA]]` — filtrado antes do envio, para
poder ficar quieta sem inventar uma resposta.

## Documentos do Estúdio (Yumi)

A Yumi produz **todos** os modelos do Estúdio → Documentos: currículo,
monografia, trabalho acadêmico, contrato, orçamento, questionário, resumo e
resumão. O roteiro é sempre o mesmo:

1. `documento_modelos` — lê o catálogo do site (`/api/studio/models`). É a fonte
   única: modelo novo criado no app aparece aqui sozinho, sem deploy do serviço.
2. Pergunta os campos do modelo **um por vez**, em conversa natural.
3. `documento_previa` — manda a **imagem** de como o documento vai ficar e
   espera a aprovação. Modelos com variação (temas do currículo, normas da
   monografia) têm uma prévia por variação.
4. `documento_criar` — só depois do "pode fazer". A Yumi escreve o conteúdo e o
   site monta o `.docx` (`/api/studio/render`), com a mesma formatação da tela.

Depende de `APP_URL` configurada no serviço. Sem ela, a Yumi segue atendendo
normalmente, apenas sem oferecer os modelos do Estúdio.

### Monografia — quando o modelo é o da faculdade

Antes de escrever, a Yumi pergunta quatro coisas: **universidade e curso**,
**ABNT ou APA**, se quer a **logo** da instituição na capa e se ela **tem o
modelo/manual** da faculdade.

Se tiver, `documento_norma_do_arquivo` lê o arquivo (PDF, Word ou foto da capa)
e extrai margens, fonte, entrelinha, recuo, papel, estilo de citação e se a capa
tem moldura. A formatação sai do documento dela, em vez de a Yumi escolher uma
norma parecida.

O que o modelo devolve é uma **proposta**: quem decide é `resolveNorm`
(`lib/doc-templates/norms.ts`), no app. Cada campo é conferido — margem fora de
0,5-8 cm, entrelinha absurda ou citação inventada são descartadas em silêncio e o
valor da norma base prevalece. Uma leitura ruim nunca vira um documento sem
margem: no pior caso ele sai na norma base inteira.

A logo vai em `capa.logo_url`, embutida como data URL — sai igual na prévia, no
PDF e no `.docx`, e a proporção real da imagem é lida do próprio arquivo
(`lib/studio-docx.ts`), então nada é entregue esticado.

`ler_arquivo_enviado` é a versão geral: devolve o texto de qualquer PDF/Word que
a pessoa mandou, para a Yumi aproveitar os dados (nome, universidade, o enunciado
do professor). PDF escaneado volta sem texto — aí ela pede uma foto.

Quando a pessoa **não tem tema**, a Yumi não escolhe por ela: pergunta curso,
matéria e interesse e sugere três temas viáveis, com uma linha dizendo por quê.

## A Yumi lembra das pessoas

`contacts.memory` (jsonb) guarda o que ela aprendeu: nome completo, universidade,
faculdade, curso, cidade, orientador(a), norma preferida. Entra no prompt de toda
conversa daquele contato — é o que faz a Yumi "lembrar" mesmo depois de o
histórico ser cortado.

Escrita só por `memoria_salvar` → `contact_memory_set`, que **mescla** com o que
já existe: salvar a universidade não apaga o curso guardado semanas atrás. Campo
vazio remove a chave.

Na segunda monografia ela chega sabendo e **confirma** ("continua na UPDS,
medicina?") em vez de perguntar tudo de novo.

## Saldo em reais

Tudo em **reais**, sem moeda interna: monografia/trabalho **R$ 50,00**,
apresentação **R$ 10,00**. Os valores vivem em `lib/precos.ts` e a Yumi os
consulta com `tabela_precos` — ela nunca inventa preço.

Por dentro é **centavos** (inteiro). Dinheiro em ponto flutuante arredonda errado
— `0.1 + 0.2` não dá `0.3` — e um centavo furado numa cobrança é problema de
verdade. Reais só aparecem no texto que a Yumi lê.

**A Yumi nunca calcula saldo.** Todo movimento passa pelas funções do banco
(`credits_add` / `credits_debit`), que são atômicas: não existe saldo negativo, e
uma cobrança sem saldo é recusada pelo Postgres, não pela IA. O saldo vem sempre
de `saldo_consultar`, mesmo quando a Yumi "acha" que sabe o valor.

Fluxo obrigatório antes de qualquer serviço pago:

1. dizer o preço em reais;
2. consultar `saldo_consultar`;
3. pedir confirmação — *"vou descontar R$ 50,00 do seu saldo de R$ 80,00, posso?"*;
4. só com o sim, `cobrar_servico`;
5. só então produzir.

Recarga pelo chat com `saldo_recarregar`: **Pix criado pela API** (a Yumi manda o
QR como imagem e o copia-e-cola em mensagem separada) ou **link de cartão**. O
saldo entra sozinho pelo webhook do Mercado Pago quando o pagamento é aprovado;
`pagamento_conferir` é a rede de segurança para quando a pessoa diz "já paguei"
antes de o webhook chegar. Creditar duas vezes é impossível: `credits_add` é
idempotente pelo id do pagamento. O valor creditado é o que o Mercado Pago
realmente recebeu — não o que a IA achou que era.

As ferramentas de cobrança só existem para o agente que tem a capacidade
**"Saldo e cobrança"** (`creditos`) marcada no Labs. Sem ela, a Yumi atende
normalmente e não cobra nada.

Quem recebe: o token do próprio agente (`chatbots.mercadopago_token`) e, na falta
dele, o `MERCADOPAGO_ACCESS_TOKEN` da plataforma — que é o caso hoje.

Na primeira conversa a Yumi se apresenta, **pergunta o nome** e o guarda no
contato (`salvar_nome_contato`), sem sobrescrever um nome já cadastrado.

### Contato ADM — usa sem pagar

`contacts.billing_exempt` marca quem usa os serviços de graça (quem testa a
plataforma). O interruptor fica no perfil do contato, em Mensagens.

A isenção é aplicada em `/api/creditos`, o **único** ponto por onde o saldo se
move: `cobrar` devolve ok sem chamar `credits_debit`, `saldo` não consulta nada e
`recarregar` não gera pagamento. Não depende da IA lembrar — mesmo que ela chame
a cobrança, nada é descontado e nada entra no extrato.

No prompt ela ainda recebe a instrução de **não falar de preço, valor nem saldo**
com esse contato, para não ficar anunciando valor a quem não vai pagar.
