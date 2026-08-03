-- ============================================================================
-- CARTEIRA — a conta Mercado Pago da empresa dentro da plataforma.
--
-- O ponto principal: o Cobrador para de mandar uma chave Pix ESTÁTICA e passa a
-- gerar um Pix pela API do Mercado Pago para CADA cobrança. Com isso o
-- pagamento volta identificado (external_reference), o webhook dá baixa sozinho
-- e ninguém precisa da IA lendo o comprovante que o cliente mandou.
-- ============================================================================

-- Liga o Pix automático. Fica desligado por padrão: quem já usa a chave estática
-- continua funcionando igual até decidir mudar.
alter table public.company_settings
  add column if not exists carteira_pix_auto boolean not null default false;

comment on column public.company_settings.carteira_pix_auto is
  'true = o Cobrador gera um Pix pela API do Mercado Pago para cada cobrança (baixa automática). false = manda a chave Pix estática.';

comment on column public.company_settings.billing_mercadopago_token is
  'Access token do Mercado Pago DA EMPRESA. Configurado na Carteira; usado pelo Cobrador para gerar o Pix de cada cobrança e ler os recebimentos.';

-- Dados do Pix gerado para a cobrança e como ela foi paga de fato.
alter table public.billing_targets
  add column if not exists pix_code text,
  add column if not exists pix_criado_em timestamptz,
  add column if not exists paid_amount numeric,
  add column if not exists paid_method text;

comment on column public.billing_targets.pix_code is
  'Copia-e-cola do Pix gerado pela API para ESTA cobrança. Nulo = cobrança na chave estática.';
comment on column public.billing_targets.paid_method is
  'Como caiu: pix, credit_card, etc. — vem do Mercado Pago, não de leitura de comprovante.';

-- Um pagamento do Mercado Pago só pode quitar UMA cobrança.
create unique index if not exists billing_targets_mp_payment_uniq
  on public.billing_targets (mp_payment_id) where mp_payment_id is not null;
