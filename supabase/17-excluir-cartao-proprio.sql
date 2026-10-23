-- GuipaHub — cada um exclui só o próprio cartão nos quadros de marca
--
-- Rodar UMA VEZ no SQL Editor, depois do 16. Seguro rodar de novo.
--
-- Até aqui quem tinha "Excluir" no Kanban apagava qualquer cartão de
-- qualquer quadro de marca. Agora:
--   · "Excluir" (demandas.excluir) apaga só o cartão que a pessoa criou;
--   · "Excluir de outros" (demandas.excluir_outros) apaga o de qualquer
--     um — para quem coordena o time (ex.: chefe do comercial);
--   · admin continua podendo tudo (pode_ou_admin).
-- Cartão antigo, sem autor (criado antes do 07) ou do sistema, só sai
-- com "Excluir de outros" ou admin.

drop policy if exists cartoes_exclui on public.cartoes;
create policy cartoes_exclui on public.cartoes for delete
  using (
    public.pode_ou_admin('demandas', 'excluir_outros')
    or (public.pode_ou_admin('demandas', 'excluir')
        and lower(criado_por) = lower(public.email_da_sessao()))
  );

-- O padrão de quem entra ganha a chave nova, desligada.
update public.config_app
   set valor = jsonb_set(valor, '{demandas,excluir_outros}', 'false'::jsonb, true),
       alterado_em = now(), alterado_por = 'script 17'
 where chave = 'permissoes_padrao'
   and not (valor -> 'demandas' ? 'excluir_outros');

-- Conferência
select 'politica de exclusao' as item,
       (select pg_get_expr(polqual, polrelid) from pg_policy
         where polname = 'cartoes_exclui') as valor
union all
select 'padrao excluir_outros',
       (select (valor -> 'demandas' ->> 'excluir_outros') from public.config_app
         where chave = 'permissoes_padrao');
