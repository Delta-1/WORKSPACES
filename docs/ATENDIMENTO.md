# Workspaces Atendimento

- Aplicativo da equipe: `/atendimento`.
- Manual ilustrado online: `/ajuda/atendimento`.
- Versão web: PWA instalável, com identidade própria e início direto em Mensagens. O sistema completo continua em `/`.
- Versão Android: APK instalável e AAB de release pelo workflow **Workspaces Android (APK + Play Store)**. Consulte [instalação, login e assinatura](ANDROID.md).

## Acesso do funcionário

O gestor copia o acesso em Configurações, junto ao código empresarial. O funcionário cria uma conta individual (ou entra na conta existente), confirma seu e-mail se solicitado e confirma o código em Entrar na empresa. O banco atribui o papel de funcionário e mantém o vínculo nos próximos acessos. Para uma conta já vinculada a outro ambiente, o seletor de ambientes permite entrar na empresa correta. Setor e permissões são revisados pelo gestor em Funcionários.

A entrada dedicada usa as mesmas sessões, empresas, permissões, canais e validações de atendimento do sistema completo. Ela não cria uma base separada. Funcionários usam a lista de conversas clássica; gestores conservam os layouts existentes.

## Validação em 21/10/2026

- Build de produção e TypeScript aprovados.
- Oito testes existentes aprovados (métricas, mídias e service worker).
- Conta temporária real: autenticação por e-mail/senha, confirmação de empresa, atendimento, resolução e persistência após recarregar.
- Banco real, com rollback: exclusividade ao assumir, autorização para responder, transferência, conclusão, reabertura, supervisão por setor, relatórios e isolamento entre empresas.
- Navegador Chromium: 320x568, 360x640, 390x844, 430x932, 768x1024, 1366x768, 844x390 e 390x420. Campo de mensagem dentro da tela, sem rolagem horizontal; altura reduzida simula o espaço disponível com teclado, sem equivaler a teste em aparelhos físicos.
- Estado sem internet e retorno ao app verificados. Duas conexões WhatsApp informadas como conectadas pelo serviço em produção.
- As imagens do guia usam dados fictícios. Nenhuma mensagem foi enviada a clientes nos testes. A entrega de texto/áudio em um destinatário WhatsApp real não faz parte desta validação; exige número de teste autorizado. Instalação nativa em aparelhos físicos e fluxo externo Google/confirmacão de e-mail também não foram executados nesta validação.

As correções de áudio do serviço WhatsApp foram preservadas. Este release altera interface, acesso e instalação; não altera o serviço WhatsApp nem o schema do banco.

## Editar e apagar para todos

As mensagens de WhatsApp enviadas pelo funcionário têm um menu de três pontos. Edição de texto: até 15 minutos; solicitação de exclusão: até dois dias. A exclusão mantém um aviso e remove texto e referências de mídia do histórico. O autor, empresa e número são conferidos novamente no serviço persistente. Chaves antigas de chats individuais podem ser recuperadas do ID WhatsApp e JID salvo; mensagens sem identificação original não simulam alteração local.

O serviço usa os comandos nativos `edit` e `delete` do Baileys e só atualiza o histórico depois da submissão confirmada. Os eventos `messages.update` refletem edições e revogações de outros dispositivos. Realtime e polling atualizam conteúdo com o mesmo ID e preservam alterações novas contra respostas antigas. Não há retransmissão automática de comandos ao WhatsApp.

Verificação desta atualização: 46 testes automáticos aprovados, incluindo serialização nativa MESSAGE_EDIT/REVOKE, rejeição sem alteração local, autoria, empresa, número, limites, chaves de grupos e sincronização de exclusão. Menus e diálogos testados em 320x568, 390x844, 844x390 e 1366x768 com respostas simuladas, incluindo cancelar, salvar, erro e apagar. A validação no banco usa transação com rollback; nenhum cliente recebeu mensagens nesses testes. Recebimento final em um aparelho WhatsApp real exige um destinatário de teste autorizado.

`GET /api/whatsapp/features` permite conferir a versão do recurso no serviço persistente sem expor endereço ou credenciais desse serviço.


### Mensagens e notas de voz (23/10/2026)

- Envios manuais, automações e respostas de IA usam OGG/Opus com `ptt: true`, duração e waveform. A verificação do upload cifrado no CDN e a recuperação de mídia continuam obrigatórias; uma falha não é registrada como envio de áudio bem-sucedido.
- A IA espelha áudios recebidos e responde principalmente por texto a textos, com respostas curtas ocasionais em voz. Pedido explícito por texto é respeitado; `voice_reply: false` desativa a voz.
- Voz tenta ElevenLabs com chave válida e depois Gemini TTS com credencial Gemini do agente, da mesma empresa ou do ambiente. IDs de chave ElevenLabs não substituem a chave secreta. Sem credencial/quota de voz, a resposta permanece em texto; `/health` expõe somente o estado do provedor.
- O histórico recebido do WhatsApp importa mensagens recebidas e enviadas, inclusive mensagens encapsuladas. Importação não aciona o bot, não reabre atendimentos e não substitui a prévia mais recente por uma mensagem antiga. O WhatsApp determina quanto histórico disponibiliza na reconexão.
- O chat reúne atendimentos anteriores do mesmo contato e número, abre no final e mantém a posição de leitura ao consultar mensagens anteriores. Consultas atrasadas não removem mensagens recebidas, edições confirmadas ou avisos de exclusão.
- A edição exige a versão correspondente do servidor WhatsApp; mantém autoria e limite de 15 minutos. O editor recebe foco e aceita Ctrl/Cmd+Enter.

Validação: testes Node de mídia (conversão, cifra, upload e repetição), regras de edição/exclusão, mesclagem de histórico e síntese/seleção de voz; TypeScript e build de produção. Após publicar, conferir a revisão de ambos os serviços e `voiceAudio.pipelineVersion: 4`, `format: ogg-opus-ptt`, `ready` e `uploadProbeReady` no servidor.


### Perfil e identificação do atendente (24/10/2026)

Qualquer usuário pode abrir o avatar no canto superior direito e escolher **Editar perfil** para alterar nome da conta, foto, nome de atendimento, cargo/função, sobre mim e idioma. Cargo/função é uma apresentação pessoal; permissões continuam vinculadas ao cargo de acesso da conta. O formulário confirma a gravação antes de fechar e mantém os dados preenchidos quando houver erro. Nome, idioma e remoção de foto persistem após novo login.

O nome de atendimento aparece em negrito na posição escolhida, nos textos e legendas enviados manualmente pelo Workspace. Quando vazio, usa o nome da conta; sem nome, usa “Atendente”. O servidor resolve o remetente autenticado e a empresa do número, sem aceitar nomes enviados pelo navegador. Automações e bots mantêm suas próprias mensagens. Áudios e figurinhas mantêm seus formatos nativos: a identificação consta no histórico interno, pois esses formatos não recebem uma legenda no WhatsApp.

Cada mensagem guarda `signature_name`, uma cópia do nome no momento do envio. Alterar o perfil não reescreve mensagens antigas. A edição mantém essa assinatura, enquanto o editor permite modificar somente o texto, sem duplicar o rodapé. Excluir uma mensagem remove também sua apresentação visual.

Migração: `attendant_profile_signatures`. Adiciona nome de atendimento, preferência de idioma quando ausente e cópia de assinatura na mensagem. `ensure_profile` usa metadados OAuth somente para criar um perfil novo; em perfis existentes, preserva a personalização salva.


### Posição da identificação

Em **avatar → Editar perfil → Posição da identificação**, cada usuário escolhe **Acima da mensagem** (padrão) ou **Abaixo da mensagem**. A prévia acompanha a seleção. A escolha é aplicada aos novos textos e legendas no WhatsApp e ao histórico interno. Cada mensagem guarda `signature_position`; edições preservam a posição e o nome usados no envio. Mensagens anteriores a esta opção mantêm o rodapé com que foram entregues.


### Recebimento rápido e áudio compatível (24/10/2026)

Mensagens novas são persistidas antes de baixar anexos ou executar IA/automações. Há filas independentes para gravação, histórico e processamento do bot; um áudio lento ou uma resposta longa da IA não deve bloquear a chegada da próxima mensagem no painel. Mídias ainda sem download aparecem no histórico e são atualizadas após o arquivo ser salvo. Uma falha de download mantém um aviso, em vez de descartar a mensagem. Falhas temporárias de gravação têm tentativas limitadas, e o bot só processa mensagens após confirmar a persistência.

A tela aplica eventos Realtime diretamente e reconcilia as 100 mensagens recentes a cada 1,5 segundo quando visível, mantendo o histórico anterior e a posição de leitura. A reconexão do canal também dispara uma reconciliação. Consultas usam índices por conversa/horário e por empresa/contato/número. A janela de reconciliação é um mecanismo de recuperação, não uma garantia de prazo sob falha de rede.

O pipeline de voz v5 usa a mesma reconstrução do STARSIS: decodifica a gravação WebM/AAC para PCM mono com timestamps normalizados, produz Ogg/Opus, verifica páginas/CRC/encerramento e confirma a decodificação antes do upload cifrado. Duração, waveform e nome do arquivo são incluídos também nas respostas por voz do bot. Gravações com timestamp deslocado, páginas corrompidas e arquivos truncados têm testes de regressão.

`/health` expõe `incomingMessages` com contagem de persistência/erros e última latência observada, sem conteúdo de clientes; `voiceAudio.pipelineVersion` deve ser 5 e os testes de codec/upload devem estar prontos.

### Abertura no final da conversa

Ao entrar, trocar ou reabrir uma conversa, o chat posiciona a última mensagem na área visível. O ajuste acompanha o carregamento de imagens e mudanças de tamanho da tela. Rolagens geradas pelo navegador durante o carregamento não desativam esse comportamento. Ao subir o histórico com mouse, toque ou teclado, a posição de leitura é preservada; voltar ao final ou reabrir a conversa retoma o acompanhamento das mensagens mais recentes. O mesmo comportamento vale para conversas internas da equipe.

Regressão de interface: `tests/browser/chat-scroll.cjs` cobre os layouts clássico, Kanban e CRM em desktop e celular, com histórico longo, imagem atrasada, rolagem de layout, leitura manual, troca/reabertura e chat interno.
