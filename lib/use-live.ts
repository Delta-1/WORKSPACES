"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase-client";

/**
 * Recarrega a tela quando as tabelas mudam no banco — é o que faz o site
 * atualizar sozinho, sem F5.
 *
 * Um hook só, em vez de cada tab montar o próprio canal, porque o padrão tem
 * três armadilhas que já morderam este código:
 *   • o callback muda a cada render; usá-lo como dependência do efeito faria
 *     assinar/desassinar em loop (por isso o ref);
 *   • uma rajada de eventos (importação, várias linhas de uma vez) chamaria o
 *     load dezenas de vezes (por isso o debounce);
 *   • e assinar tabela fora da publicação `supabase_realtime` conecta e nunca
 *     recebe nada — se você adicionar uma tabela aqui, adicione lá também
 *     (database/migrations/20260806_realtime_tabelas_faltantes.sql).
 */
export function useLive(
  tables: readonly string[],
  companyId: string | null | undefined,
  reload: () => void
) {
  const cb = useRef(reload);
  useEffect(() => { cb.current = reload; });

  // A lista vira string para a dependência comparar por valor — um array novo
  // por render não pode significar "reassine tudo".
  const chave = tables.join(",");

  useEffect(() => {
    if (!supabase || !companyId || !chave) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const agendar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 250);
    };
    const ch = supabase.channel(`live:${chave}:${companyId}`);
    for (const table of chave.split(",")) {
      // Filtrar por empresa no servidor: sem isto todo cliente receberia os
      // eventos de todas as empresas (o RLS não se aplica ao realtime do
      // postgres_changes da mesma forma que ao select).
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `company_id=eq.${companyId}` },
        agendar
      );
    }
    ch.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase?.removeChannel(ch);
    };
  }, [chave, companyId]);
}
