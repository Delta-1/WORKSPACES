# Workspaces Atendimento

- Aplicativo da equipe: `/atendimento`.
- Manual ilustrado online: `/ajuda/atendimento`.
- É uma PWA instalável, com identidade própria e início direto em Mensagens. O sistema completo continua em `/`.

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
