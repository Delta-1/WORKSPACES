-- Memória do contato: o que a Nina aprendeu sobre a pessoa e deve lembrar nas
-- próximas conversas (universidade, curso, norma preferida, logo da instituição).
-- Fica no cadastro do contato, junto do saldo de pips, para não depender do
-- histórico da conversa — que é cortado.
alter table public.contacts add column if not exists memory jsonb not null default '{}'::jsonb;

comment on column public.contacts.memory is
  'Fatos que a IA lembra do contato (nome_completo, universidade, faculdade, curso, cidade, professor, norma, logo_url…). Só chaves conhecidas; escrito por contact_memory_set.';

-- Grava a memória mesclando com o que já existe: a IA manda só o que descobriu
-- agora e nunca apaga o resto sem querer. Chave com valor vazio/null é removida.
create or replace function public.contact_memory_set(p_contact uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual jsonb;
  v_novo  jsonb;
  k text;
  v jsonb;
begin
  if p_contact is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return '{}'::jsonb;
  end if;

  select coalesce(memory, '{}'::jsonb) into v_atual from public.contacts where id = p_contact;
  if v_atual is null then return '{}'::jsonb; end if;
  v_novo := v_atual;

  for k, v in select * from jsonb_each(p_patch) loop
    if v is null or jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
      v_novo := v_novo - k;
    else
      v_novo := jsonb_set(v_novo, array[k], v, true);
    end if;
  end loop;

  update public.contacts set memory = v_novo where id = p_contact;
  return v_novo;
end;
$$;

revoke all on function public.contact_memory_set(uuid, jsonb) from public;
grant execute on function public.contact_memory_set(uuid, jsonb) to authenticated, service_role;
