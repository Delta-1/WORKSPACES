import type { Metadata } from "next";
import { BookOpen, MessageSquare, Smartphone } from "lucide-react";

export const metadata: Metadata = { title: "Manual do funcionário | Workspaces Atendimento" };

const steps = [
  { image: "01-cadastro.png", title: "1. Crie sua conta ou entre", text: "No primeiro acesso, toque em Criar conta. Informe seu próprio e-mail e escolha sua senha. Se houver pedido de confirmação, abra o e-mail e confirme antes de entrar. Se você já tem conta, use Entrar com o mesmo e-mail e senha. O Google também está disponível." },
  { image: "02-empresa.png", title: "2. Confirme sua empresa", text: "Peça o código ao gestor ou use o link de acesso enviado por ele. Depois do login, confirme o código e toque em Entrar na empresa. Isso vincula sua conta como funcionário. Você não precisa criar outra empresa ou escolher um plano. Nos próximos acessos, o vínculo já estará salvo." },
  { image: "03-conversas.png", title: "3. Escolha o cliente", text: "O app abre direto em Mensagens. Pesquise pelo nome ou telefone e toque na conversa. No celular, a conversa ocupa a tela; use a seta para voltar à lista. A aba Equipe serve para conversar internamente com colegas." },
  { image: "04-chat.png", title: "4. Assuma e atenda", text: "Toque em Assumir atendimento para ficar responsável. Escreva a mensagem e toque na seta de enviar. Use + para anexos e o rosto para emojis e figurinhas. No microfone, grave, pare, ouça e confirme em Enviar áudio. Se outro atendente estiver responsável, a conversa informa o bloqueio." },
  { image: "05-finalizar.png", title: "5. Finalize ou transfira", text: "Ao terminar, toque em Finalizar, escolha Resolvido ou Não resolvido e confirme. A observação é opcional. Para passar a conversa a um colega, toque em Transferir e escolha o novo responsável. O histórico continua registrado." },
];

export default function Page() {
  return <main className="fixed inset-0 overflow-y-auto bg-[#060a12] text-slate-100">
    <div className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
      <a href="/atendimento" className="inline-flex min-h-11 items-center text-emerald-300">← Abrir atendimento</a>
      <div className="mt-6 flex items-center gap-3 text-emerald-300"><BookOpen /><span className="text-sm font-semibold uppercase tracking-widest">Guia da equipe</span></div>
      <h1 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight">Workspaces Atendimento</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-400">Instale, entre na sua empresa e comece a atender pelo celular ou computador.</p>
      <div className="my-7 flex flex-wrap gap-3">
        <a href="/atendimento" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-600 px-5 font-semibold"><MessageSquare size={20} /> Abrir aplicativo</a>
      </div>
      <section className="my-10 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-8">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Smartphone /> Instale na tela inicial</h2>
        <div className="mt-5 grid gap-6 sm:grid-cols-3 text-sm leading-7 text-slate-300">
          <p><b className="text-white">Android</b><br />Abra o link no Chrome. Toque em Instalar app ou use o menu ⋮ → Instalar aplicativo / Adicionar à tela inicial. Confirme.</p>
          <p><b className="text-white">iPhone</b><br />Abra o link no Safari. Toque em Compartilhar → Adicionar à Tela de Início → Adicionar.</p>
          <p><b className="text-white">Computador</b><br />Abra no Chrome ou Edge e use o ícone de instalação na barra de endereço. Você também pode usar diretamente no navegador.</p>
        </div>
        <p className="mt-5 text-sm text-slate-400">Se abriu o link dentro do WhatsApp, escolha abrir no navegador. O app usa internet e atualiza pelo site. Esta versão é um aplicativo web instalável (PWA).</p>
      </section>
      <div className="space-y-8">
        {steps.map(step => <section key={step.image} className="grid gap-6 rounded-2xl border border-white/10 p-5 sm:p-8 sm:grid-cols-[1fr_240px] items-center">
          <div><h2 className="text-2xl font-semibold">{step.title}</h2><p className="mt-4 text-slate-300 leading-8">{step.text}</p></div>
          {/* Screenshots show only a temporary test account and fictional data. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/ajuda/atendimento/${step.image}`} alt={step.title} width={390} height={844} className="mx-auto w-full max-w-[240px] rounded-2xl border border-white/15" />
        </section>)}
      </div>
      <section className="my-10 grid gap-8 rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-5 sm:p-8 sm:grid-cols-2">
        <div className="sm:col-span-2"><h2 className="text-xl font-semibold">Editar e apagar mensagens para todos</h2><p className="mt-4 text-slate-300 leading-7">Nas mensagens enviadas por você, toque nos três pontos ao lado do horário. Use Editar mensagem para corrigir um texto em até 15 minutos, ou Apagar para todos para solicitar a exclusão em até dois dias. A edição aparece com a indicação “editada”; a exclusão deixa o aviso “Mensagem apagada”. A alteração só entra no histórico depois que o serviço consegue enviá-la ao WhatsApp. Se houver erro, confira o aviso e a conversa antes de repetir. Arquivos já salvos pelo destinatário podem permanecer no aparelho dele.</p></div>
        <div><h2 className="text-xl font-semibold">Para o gestor liberar a equipe</h2><ol className="mt-4 list-decimal space-y-3 pl-5 text-slate-300 leading-7"><li>No sistema completo, abra Configurações e localize o Código empresarial.</li><li>Use Copiar acesso do funcionário e envie o texto à pessoa.</li><li>Depois que ela entrar, abra Funcionários e confira o cadastro, setor e acesso a Mensagens.</li><li>Conecte o WhatsApp da empresa e mantenha o canal conectado para receber e enviar mensagens.</li></ol></div>
        <div><h2 className="text-xl font-semibold">Se algo não aparecer</h2><p className="mt-4 text-slate-300 leading-7">Confira a internet e a empresa selecionada no topo. Peça ao gestor para revisar seu setor, permissões, plano da empresa e conexão do WhatsApp. No primeiro uso do microfone, permita o acesso. Não compartilhe sua senha com colegas.</p><p className="mt-4 text-slate-400 text-sm leading-6">O login fica salvo neste navegador ou app até você sair ou limpar os dados. Em aparelho compartilhado, saia pelo perfil. Navegadores antigos ou sem suporte à instalação podem usar o link diretamente.</p></div>
      </section>
      <p className="text-sm text-slate-500">Atualizado em 21/10/2026. Telas ilustrativas com dados fictícios. A quantidade de canais e os clientes dependem da sua empresa. A entrega ao WhatsApp do cliente depende da conexão e do serviço de WhatsApp.</p>
    </div>
  </main>;
}
