-- ============================================================================
-- O LIMITE DE NÚMEROS PASSA A SER DO BANCO.
--
-- Até aqui a conta era feita só no navegador: a tela somava os números e
-- escondia o botão. Só que o cadastro é um insert direto no Supabase, então
-- quem soubesse chamar a API registrava quantos quisesse — e cada número
-- registrado custa. Regra de negócio que mora na tela não é regra, é sugestão.
--
-- Agora é um gatilho BEFORE INSERT/UPDATE. Vale para todo mundo que escreve na
-- tabela: a tela, a API, o painel do Supabase, qualquer script.
--
-- `wa_number_limit = -1` é ILIMITADO (a casa do dono). Sem linha em
-- company_settings, o padrão é 3 — o mesmo que a tela já mostrava.
-- ============================================================================

create or replace function public.whatsapp_numbers_confere_limite()
returns trigger
language plpgsql
-- SECURITY DEFINER porque a função precisa LER company_settings, e o RLS de lá
-- não deixaria o usuário comum enxergar a própria linha de configuração.
security definer
set search_path to 'public'
as $$
declare
  v_limite integer;
  v_usados integer;
begin
  if new.company_id is null then
    raise exception 'Número de WhatsApp precisa estar ligado a uma empresa.'
      using errcode = 'check_violation';
  end if;

  -- Em UPDATE que não muda de empresa não há o que conferir: a linha já estava
  -- contada. Sem esta saída, editar o apelido de um número quando a empresa
  -- está no limite passaria a falhar.
  if tg_op = 'UPDATE' and new.company_id = old.company_id then
    return new;
  end if;

  select wa_number_limit into v_limite
  from public.company_settings
  where company_id = new.company_id;

  v_limite := coalesce(v_limite, 3);
  if v_limite < 0 then
    return new; -- ilimitado
  end if;

  -- Trava por empresa enquanto a transação corre. Sem isto, dois cadastros ao
  -- mesmo tempo contariam o mesmo "antes" e os dois passariam — que é
  -- exatamente como se fura um limite feito de SELECT + INSERT.
  perform pg_advisory_xact_lock(hashtext('wa_numbers:' || new.company_id::text));

  select count(*) into v_usados
  from public.whatsapp_numbers
  where company_id = new.company_id;

  if v_usados >= v_limite then
    raise exception 'Limite de % número(s) de WhatsApp atingido para esta empresa.', v_limite
      using errcode = 'check_violation',
            hint = 'Atualize o plano para registrar mais números.';
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_numbers_limite on public.whatsapp_numbers;
create trigger whatsapp_numbers_limite
  before insert or update on public.whatsapp_numbers
  for each row execute function public.whatsapp_numbers_confere_limite();

comment on function public.whatsapp_numbers_confere_limite() is
  'Segura o limite de números por empresa (company_settings.wa_number_limit; -1 = ilimitado, ausente = 3). Fica no banco porque a conta na tela é contornável.';
