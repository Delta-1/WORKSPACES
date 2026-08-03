-- ============================================================================
-- Fim dos "pips": o saldo passa a ser em REAIS.
--
-- Guardado em CENTAVOS, como inteiro. Dinheiro em float arredonda errado
-- (0.1 + 0.2 nunca é 0.3), e com centavos toda a aritmética continua exata e
-- atômica dentro do banco — a IA segue sem calcular nada.
--
-- Nenhum saldo ou transação existia quando isto rodou, então não há conversão
-- de dados a fazer: 0 linhas nas duas tabelas. (Se houvesse, seria
-- balance_cents = balance * 50, já que 1 pip valia R$ 0,50.)
-- ============================================================================

alter table public.contact_credits  rename column balance to balance_cents;
alter table public.credit_transactions rename column delta to delta_cents;
alter table public.credit_transactions rename column balance_after to balance_after_cents;

comment on column public.contact_credits.balance_cents is 'Saldo em CENTAVOS de real. Nunca negativo (CHECK).';
comment on column public.credit_transactions.delta_cents is 'Movimento em CENTAVOS: positivo = recarga, negativo = serviço consumido.';

-- As funções antigas ficavam com a assinatura de pips; recriamos falando centavos.
drop function if exists public.credits_add(uuid, uuid, integer, text, text, text);
drop function if exists public.credits_debit(uuid, uuid, integer, text, text);
drop function if exists public.credits_extrato(uuid, integer);
drop function if exists public.credits_balance(uuid);

create function public.credits_balance(p_contact uuid)
returns integer
language sql
security definer
set search_path to 'public'
as $$
  select coalesce((select balance_cents from public.contact_credits where contact_id = p_contact), 0);
$$;

-- Recarga (pagamento aprovado, bônus, ajuste). `p_ref` torna a operação
-- idempotente: o mesmo pagamento nunca credita duas vezes.
create function public.credits_add(
  p_contact uuid, p_company uuid, p_cents integer,
  p_reason text default 'recarga', p_detail text default null, p_ref text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance integer;
begin
  if p_cents is null or p_cents <= 0 then
    raise exception 'o valor da recarga deve ser positivo';
  end if;

  if p_ref is not null and exists (select 1 from public.credit_transactions where ref = p_ref) then
    return public.credits_balance(p_contact);
  end if;

  insert into public.contact_credits (contact_id, company_id, balance_cents)
  values (p_contact, p_company, p_cents)
  on conflict (contact_id) do update
    set balance_cents = public.contact_credits.balance_cents + p_cents,
        company_id = coalesce(public.contact_credits.company_id, excluded.company_id),
        updated_at = now()
  returning balance_cents into v_balance;

  insert into public.credit_transactions (contact_id, company_id, delta_cents, balance_after_cents, reason, detail, ref)
  values (p_contact, p_company, p_cents, v_balance, coalesce(p_reason, 'recarga'), p_detail, p_ref);

  return v_balance;
end;
$$;

-- Cobrança de um serviço. O UPDATE só acerta a linha se houver saldo — se não
-- houver, nada muda e a função diz quanto falta, em centavos.
create function public.credits_debit(
  p_contact uuid, p_company uuid, p_cents integer,
  p_reason text default 'servico', p_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance integer;
  v_atual integer;
begin
  if p_cents is null or p_cents <= 0 then
    raise exception 'o valor do serviço deve ser positivo';
  end if;

  update public.contact_credits
     set balance_cents = balance_cents - p_cents, updated_at = now()
   where contact_id = p_contact and balance_cents >= p_cents
  returning balance_cents into v_balance;

  if v_balance is null then
    v_atual := public.credits_balance(p_contact);
    return jsonb_build_object(
      'ok', false, 'saldo_centavos', v_atual, 'faltam_centavos', p_cents - v_atual,
      -- Vírgula, não ponto: o `D` do to_char usa o separador da locale do
      -- banco (ponto), e esta frase vai direto para o cliente no WhatsApp.
      'mensagem', format('Saldo insuficiente: tem R$ %s e o serviço custa R$ %s.',
                         replace(to_char(v_atual / 100.0, 'FM999999990.00'), '.', ','),
                         replace(to_char(p_cents / 100.0, 'FM999999990.00'), '.', ','))
    );
  end if;

  insert into public.credit_transactions (contact_id, company_id, delta_cents, balance_after_cents, reason, detail)
  values (p_contact, p_company, -p_cents, v_balance, coalesce(p_reason, 'servico'), p_detail);

  return jsonb_build_object('ok', true, 'saldo_centavos', v_balance, 'cobrado_centavos', p_cents);
end;
$$;

create function public.credits_extrato(p_contact uuid, p_limit integer default 10)
returns table (quando timestamptz, delta_centavos integer, saldo_centavos integer, motivo text, detalhe text)
language sql
security definer
set search_path to 'public'
as $$
  select created_at, delta_cents, balance_after_cents, reason, detail
  from public.credit_transactions
  where contact_id = p_contact
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.credits_add(uuid, uuid, integer, text, text, text) from public;
revoke all on function public.credits_debit(uuid, uuid, integer, text, text) from public;
grant execute on function public.credits_add(uuid, uuid, integer, text, text, text) to service_role;
grant execute on function public.credits_debit(uuid, uuid, integer, text, text) to service_role;

revoke all on function public.credits_balance(uuid) from public;
revoke all on function public.credits_extrato(uuid, integer) from public;
grant execute on function public.credits_balance(uuid) to authenticated, service_role;
grant execute on function public.credits_extrato(uuid, integer) to authenticated, service_role;

-- Comentários que ainda citavam a moeda antiga e o nome antigo da agente.
comment on column public.contacts.memory is
  'Fatos que a IA lembra do contato (nome_completo, universidade, faculdade, curso, cidade, professor, norma, logo_url…). Só chaves conhecidas; escrito por contact_memory_set.';
comment on column public.contacts.billing_exempt is
  'true = ADM: usa os serviços sem pagar. Nada é descontado do saldo e a IA não fala de preço.';
