-- Contato ADM: usa os serviços da Nina sem pagar nada.
--
-- É para quem testa a plataforma (o dono, a equipe): não faz sentido comprar
-- pips toda vez que for conferir se a monografia está saindo certa. A isenção
-- vale no BANCO, não só no prompt — mesmo que a IA chame a cobrança, nada é
-- debitado.
alter table public.contacts add column if not exists billing_exempt boolean not null default false;

comment on column public.contacts.billing_exempt is
  'true = ADM: usa os serviços sem pagar. Nenhum pip é debitado e a IA não fala de preço.';
