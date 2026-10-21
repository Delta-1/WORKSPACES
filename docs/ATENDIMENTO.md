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
