// TUTORIAIS — o passo a passo que aparece na primeira vez em cada app.
//
// A ideia: quem entra pela primeira vez não sabe que o Kanban conversa com o
// Calendário, nem que a IA usa os arquivos. Então cada app tem um guia curto,
// que aparece SÓ na primeira visita e nunca mais — a menos que a pessoa peça
// para rever (Configurações → Rever tutoriais).
//
// São passos de TEXTO, não setas grudadas na tela: seta apontando para um botão
// quebra assim que o layout muda de tamanho ou o botão sai da tela. Um cartão
// que explica em palavras funciona em qualquer tela e não mente.

export type TutorialStep = { titulo: string; texto: string };
export type Tutorial = { titulo: string; passos: TutorialStep[] };

// As boas-vindas, mostradas uma vez logo após entrar. As `chave` batem com os
// ids de app em app/page.tsx (APPS[].id).
export const WELCOME = "bemvindo";

export const TUTORIALS: Record<string, Tutorial> = {
  [WELCOME]: {
    titulo: "Bem-vindo ao seu Workspace 👋",
    passos: [
      { titulo: "Tudo num lugar só", texto: "Aqui ficam suas tarefas, agenda, arquivos, atendimento por WhatsApp e a inteligência artificial — conversando entre si, sem você repetir informação." },
      { titulo: "Os apps ficam no menu", texto: "Cada ferramenta é um app no menu lateral (ou na barra de baixo, no celular). Já deixamos ligados os que combinam com o que você escolheu no cadastro." },
      { titulo: "A primeira vez de cada um", texto: "Quando você abrir um app pela primeira vez, aparece um guia rápido como este. Depois ele some. Pode revê-los quando quiser em Configurações → Rever tutoriais." },
    ],
  },

  kanban: {
    titulo: "Kanban — seu quadro de tarefas",
    passos: [
      { titulo: "Arraste para andar", texto: "Cada cartão é uma tarefa. Arraste entre as colunas (A fazer → Em andamento → Concluído) conforme o trabalho avança." },
      { titulo: "Ligado ao Calendário", texto: "Toda tarefa com data de entrega aparece automaticamente no Calendário. Mudou a data aqui, muda lá — sem digitar duas vezes." },
      { titulo: "A IA também usa", texto: "O copiloto e os bots conseguem criar e mover tarefas por você. Peça no WhatsApp: 'cria uma tarefa pra sexta' e ela aparece no quadro na hora." },
    ],
  },

  calendario: {
    titulo: "Calendário — a agenda de todos",
    passos: [
      { titulo: "Uma agenda da equipe", texto: "Eventos, prazos de tarefas e compromissos ficam juntos aqui. Todo mundo vê a mesma agenda, atualizada na hora." },
      { titulo: "Vem do Kanban", texto: "As datas de entrega das tarefas do Kanban entram sozinhas. O que você marca aqui de compromisso também pode virar tarefa." },
      { titulo: "Sincroniza com o Google", texto: "Dá para conectar o Google Agenda: o que muda aqui reflete lá, e o que está lá aparece aqui." },
    ],
  },

  mundo: {
    titulo: "Mundo — informações essenciais",
    passos: [
      { titulo: "Radar global", texto: "Veja no mapa eventos naturais ativos, como tempestades, incêndios, vulcões e inundações, com dados quase em tempo real." },
      { titulo: "Filtre e investigue", texto: "Escolha o período e a categoria, pesquise eventos e abra as fontes originais para entender cada ocorrência." },
      { titulo: "Também na tela inicial", texto: "O Pulso do mundo resume os acontecimentos mais recentes na Home e no Modo TV. Novas fontes de notícias poderão entrar nesse mesmo painel." },
    ],
  },

  mensagens: {
    titulo: "Mensagens — o WhatsApp da empresa",
    passos: [
      { titulo: "Conecte um número", texto: "Em WhatsApp/Configuração, leia o QR Code com o celular. Cada número conectado é uma linha de atendimento." },
      { titulo: "Bots respondem por você", texto: "Você escolhe um agente de IA para cuidar de um número ou de um grupo. Ele responde sozinho e passa para um humano quando precisa." },
      { titulo: "Tudo vira contato", texto: "Quem te chama vira um contato, com histórico. A IA pode salvar e corrigir o nome da pessoa conforme a conversa." },
    ],
  },

  labs: {
    titulo: "Labs — onde você cria os bots",
    passos: [
      { titulo: "Monte um agente", texto: "Dê um nome, uma personalidade e diga o que ele pode fazer (as 'capacidades'). Ele passa a atender no WhatsApp com isso." },
      { titulo: "Ligue capacidades", texto: "Cada capacidade é uma habilidade: consultar clientes, cobrar, gerar documentos, acessar máquinas. Ligue só o que aquele bot precisa." },
      { titulo: "Fluxo automático", texto: "Na aba Automação você desenha o passo a passo do atendimento — pergunta, espera, ação — sem escrever código." },
    ],
  },

  clientes: {
    titulo: "Clientes — seu CRM",
    passos: [
      { titulo: "Cadastre e encontre", texto: "Guarde seus clientes com telefone e e-mail. A busca acha rápido, e o atendimento no WhatsApp já reconhece quem é." },
      { titulo: "Formulários", texto: "Crie formulários para coletar dados; as respostas caem aqui e podem ser preenchidas pela própria IA na conversa." },
    ],
  },

  financeiro: {
    titulo: "Financeiro — contas no controle",
    passos: [
      { titulo: "Entradas e saídas", texto: "Lance o que entra e o que sai. O resumo do mês se atualiza sozinho conforme você registra." },
      { titulo: "Serve casa e empresa", texto: "Numa conta pessoal, é o controle das contas de casa. Numa empresa, é o caixa do negócio." },
    ],
  },

  logistica: {
    titulo: "Logística Internacional",
    passos: [
      { titulo: "Da carga ao documento", texto: "Acompanhe cargas, frota e estoque, e gere os documentos aduaneiros (DUE, MIC-DTA, CRT) sem sair daqui." },
      { titulo: "Portal do motorista", texto: "O motorista recebe um link próprio para ver a viagem e enviar comprovantes de entrega — sem precisar de login." },
    ],
  },

  cobrador: {
    titulo: "Cobrador — cobrança automática",
    passos: [
      { titulo: "Cobre por Pix", texto: "Programe cobranças e lembretes por WhatsApp. O Pix é gerado pela API do Mercado Pago, então o pagamento volta identificado." },
      { titulo: "Baixa sozinha", texto: "Quando o Pix cai, a cobrança é baixada automaticamente e o valor aparece na Carteira — sem ninguém conferir comprovante." },
    ],
  },

  carteira: {
    titulo: "Carteira — o dinheiro que entra",
    passos: [
      { titulo: "Saldo e recebimentos", texto: "Veja o saldo do Mercado Pago e o que caiu de cada cobrança, tudo num lugar." },
      { titulo: "Atualiza na hora", texto: "Quando um pagamento cai, o saldo aqui muda sozinho — você não precisa recarregar a página." },
    ],
  },

  estudio: {
    titulo: "Estúdio — documentos e apresentações",
    passos: [
      { titulo: "Modelos prontos", texto: "Currículo, monografia, contrato, orçamento e mais. Escolha o modelo, preencha e exporte." },
      { titulo: "PDF com design + editável", texto: "Você recebe o PDF já formatado (bonito) e o .docx para ajustar. A Yumi também monta tudo isso pelo WhatsApp." },
    ],
  },

  remoto: {
    titulo: "Acesso Remoto",
    passos: [
      { titulo: "Veja e controle máquinas", texto: "Instale o agente num computador e acesse-o à distância pela tela do Workspace." },
      { titulo: "A IA ajuda", texto: "O copiloto pode operar a máquina por você — abrir programas, organizar arquivos — com sua autorização." },
    ],
  },

  arquivos: {
    titulo: "Arquivos — a memória da empresa",
    passos: [
      { titulo: "Tudo conectado", texto: "Seus arquivos e pastas ficam num grafo navegável. A IA usa esse acervo para responder com base no que é seu." },
      { titulo: "Google Drive", texto: "Conecte o Drive para trazer o que já está lá, sem duplicar nada." },
    ],
  },
};

export const hasTutorial = (appId: string) => !!TUTORIALS[appId];
