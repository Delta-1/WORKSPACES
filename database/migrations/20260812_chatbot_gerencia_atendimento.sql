-- GERENCIAR ATENDIMENTO por bot.
--
-- Alguns bots devem tocar o atendimento do começo ao fim: quando respondem, a
-- conversa vira "Sendo atendido", e quando a pessoa termina (ou dá o tempo de
-- inatividade) eles FINALIZAM sozinhos. Outros bots são só um "primeiro
-- atendimento": respondem, mas a conversa CONTINUA em "Aguardando atendimento"
-- para um humano assumir e fechar. Isso é escolhido bot a bot.
-- Padrão: gerencia (mantém o comportamento atual).
alter table public.chatbots add column if not exists manages_attendance boolean not null default true;

comment on column public.chatbots.manages_attendance is
  'true = o bot abre (Sendo atendido) e finaliza o atendimento sozinho; false = só responde e deixa em Aguardando atendimento para um humano.';
