# Mensagens — atendimento em equipe

## Contatos e nomes

O botão **Contatos** fica na barra lateral de Mensagens e funciona no celular e no computador. Pesquise pelo nome salvo ou número, escolha a linha de WhatsApp e abra a conversa. Para quem ainda não está na agenda, use **Conversar com um novo número**.

Ao selecionar um contato existente, o sistema usa seu cadastro e JID reais (incluindo os identificadores LID do WhatsApp), e reúne o histórico dos atendimentos daquela pessoa **na linha escolhida**. Não mistura conversas de linhas com permissões diferentes.

Nomes editados no Workspace têm prioridade. Depois vem o nome salvo na agenda do WhatsApp; o nome de perfil é apenas uma alternativa. A agenda é sincronizada nos eventos que o WhatsApp disponibiliza ao serviço. Esta atualização não promete recuperar mensagens antigas que nunca foram entregues pelo WhatsApp ao Workspace.

## Funcionários, líderes e atendimento

Funcionários usam **sempre Kanban**, mesmo se o navegador ou a empresa tiver um layout clássico salvo. As colunas são **A fazer**, **Em andamento** e **Finalizados**. Gestores e líderes podem escolher seu layout.

1. Abra uma conversa e clique em **Assumir atendimento**. O timer começa, o responsável fica visível e o bot é pausado. A primeira resposta também assume automaticamente, com disputa resolvida no banco.
2. Só o responsável pode enviar mensagens. Outros funcionários veem quem está atendendo e precisam solicitar uma transferência.
3. Use **Transferir** e escolha outro funcionário autorizado. O tempo e as mensagens do primeiro ficam registrados; o timer do novo responsável começa na transferência.
4. Use **Finalizar**, selecione **Resolvido** ou **Não resolvido** e confirme. A observação é opcional. Isso fecha o atendimento, sem apagar a conversa.
5. Um atendimento pode ser reaberto; a participação anterior continua no relatório.

O gestor acompanha a empresa. O líder acompanha os atendimentos e relatórios do seu setor, inclusive o responsável atual. Todos podem abrir a aba Relatórios. Somente líderes e cargos superiores podem consultar e emitir relatórios de funcionários; funcionários sem liderança não veem nem emitem esses dados, incluindo os próprios. O líder designado no organograma também recebe acesso aos relatórios dos setores que lidera. As regras são aplicadas no banco e no endpoint de envio, além da interface.

## Relatórios

Em **Relatórios → Atendimentos de Mensagens**, filtre período, funcionário, contato/protocolo e resultado. Clique no cartão de um funcionário para filtrar sua participação.

- **Espera**: entrada na fila até assumir.
- **Primeira resposta**: entrada na fila até a primeira mensagem do funcionário.
- **Duração**: início do atendimento até finalização ou transferência.
- **Resolução**: resolvidos divididos pelos finalizados com resultado informado.
- **Mensagens**: mensagens de saída atribuídas ao funcionário, registradas depois de o serviço aceitar o envio.

Transferências preservam a participação de ambos e não contam como finalizações resolvidas. A resolução é informada pelo atendente, não uma avaliação automática do cliente. O relatório distingue participações, finalizações e transferências. Não há estatísticas retroativas inventadas: a coleta começa com esta atualização.

**Imprimir / PDF** abre uma folha clara com resumo por funcionário, detalhes e espaço para anotações. No aplicativo Android, use também o botão nativo **Imprimir / salvar PDF** da janela do relatório.

## Figurinhas

Uma figurinha recebida tem **Salvar figurinha**. O botão **Figurinhas** abre o banco compartilhado da empresa. Você pode pesquisar, enviar ou adicionar uma imagem. PNG/JPG são ajustados para WebP de 512 × 512; WebP é preservado, inclusive quando animado. O envio usa o tipo nativo `sticker`, e não uma foto/anexo.

## Aplicativos Windows e Android

Os novos aplicativos são o **Workspace completo**, separados dos agentes de acesso remoto:

- `desktop-app`: instalador Windows `Workspace-Setup.exe`.
- `android-workspace`: APK Android para teste e instalação corporativa.
- Actions: **Build Workspace Apps (EXE + APK)**. Os arquivos ficam nos artifacts **Workspace-Windows** e **Workspace-Android** da execução.

A build aceita `workspace_url` ou a variável do repositório `WORKSPACE_APP_URL`. Sem isso, cada aplicativo pede o endereço HTTPS no primeiro acesso e o guarda. Use e-mail e senha no aplicativo incorporado; o botão **Navegador** permite usar o login Google e as funções do navegador quando necessário. A sessão do navegador externo é separada da sessão incorporada.

O site deve continuar hospedado: os aplicativos usam a mesma aplicação e banco, e recebem as melhorias do site. O APK gerado por padrão é de teste (`debug`). Para distribuição contínua com atualizações sobre a instalação anterior, adote assinatura de release com chave estável. O EXE deste workflow não tem assinatura de código comercial.

## Implantação

1. Aplicar `database/migrations/20261002150053_messaging_team_workflow.sql` no projeto Supabase do Workspace. A cópia em `supabase/migrations` permite o uso do CLI; **aplique apenas uma cópia**.
2. Publicar o site e fazer redeploy do `whatsapp-service`, que contém a sincronização de nomes, persistência de figurinhas e proteção contra troca de responsável.
3. Atualizar a página nos dispositivos já conectados.
4. Gerar os aplicativos pelo Actions e instalar nos dispositivos.

`tests/attendance-workflow.sql` valida o fluxo em uma transação com rollback, após carregar a migration na mesma transação. Não executá-lo sem transação em produção. Os testes cobrem disputa de atendimento, bloqueio de resposta alheia, supervisão, transferência, resultado obrigatório, reabertura e isolamento entre empresas.
