-- GuipaHub — dois ajustes pendentes, num arquivo só
--
-- Rodar UMA VEZ no SQL Editor do Supabase. Seguro rodar de novo.
-- Junta o conteúdo do 03-trancar-perfis.sql, que nunca chegou a rodar,
-- com o novo padrão de abas. São independentes; estão juntos só para
-- você colar uma vez em vez de duas.

-- ---------------------------------------------------------------
-- 1. Fecha a leitura da lista de pessoas  (era o 03)
-- ---------------------------------------------------------------
--
-- Antes: qualquer pessoa da GUIPA conseguia LER a tabela de perfis —
-- quem existe, quais abas cada um tem, quem é admin. Não dava para
-- ALTERAR nada (isso sempre exigiu admin), mas dava para ver abrindo o
-- console do navegador.
--
-- Agora: cada pessoa lê só a própria linha. Admin continua lendo todas,
-- porque a tela de permissões precisa da lista para existir.
--
-- Não quebra nada: a lista completa só é usada em Configurações, que só
-- admin abre. O resto do app precisa apenas da própria linha, para saber
-- quais abas mostrar.

drop policy if exists perfis_le on public.perfis;
create policy perfis_le on public.perfis
  for select using (
    id = auth.uid() or public.sou_admin()
  );

-- ---------------------------------------------------------------
-- 2. Abas que quem entra pela primeira vez enxerga
-- ---------------------------------------------------------------
--
-- Passa a ser: Hoje, Kanban, Central Guipa e Imagens.
-- Ficam de fora Marcas e Prompts — não por serem secretas, mas porque
-- ainda não estão prontas para o time usar. Quando estiverem, basta
-- marcar as duas em Configurações › Permissões, sem rodar SQL nenhum.
--
-- A chave da aba Imagens é "clientes": o rótulo mudou, a chave não,
-- porque ela está gravada nas permissões de quem já entrou.
--
-- Vale para todo mundo que NÃO tem exceção própria, inclusive quem já
-- entrou e nunca foi personalizado.

update public.config_app
   set valor = '["hoje","demandas","central","clientes"]'::jsonb,
       alterado_em = now(),
       alterado_por = 'script 04'
 where chave = 'abas_padrao';

-- ---------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------
-- Roda junto e mostra o resultado das duas mudanças.

select 'abas padrão' as item, valor::text as valor
  from public.config_app where chave = 'abas_padrao'
union all
select 'admins', string_agg(email, ', ')
  from public.perfis where admin;
