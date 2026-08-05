-- ============================================================================
-- O BIBLIOPEN SAI DO WORKSPACES.
--
-- O BibliOpen é um site próprio, estático, que busca ao vivo em catálogos
-- abertos (Project Gutenberg, Internet Archive, Wikisource, Open Library). Ele
-- não tem — e não deve ter — banco de dados: o acervo é a web.
--
-- Manter um espelho do acervo aqui criava duas fontes de verdade para a mesma
-- pergunta ("esse livro existe?"), e as duas iam divergir no primeiro dia.
--
-- A NINA CONTINUA. Ela segue sendo a bibliotecária, só que agora consulta os
-- catálogos direto (whatsapp-service/src/catalogos.js), sem passar por aqui.
-- É por isso que a capacidade `biblioteca` dos agentes permanece.
--
-- Removido com 48 linhas de semente de catálogo, 0 licenças e 0 eventos — nada
-- que alguém tenha cadastrado à mão.
-- ============================================================================

drop table if exists public.library_events cascade;
drop table if exists public.library_licenses cascade;
drop table if exists public.library_books cascade;

drop function if exists public.library_pode_ler(uuid, uuid, text);
