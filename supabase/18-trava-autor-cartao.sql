-- GuipaHub — autor do cartão não muda; criador apaga o próprio por padrão
--
-- Rodar UMA VEZ no SQL Editor, depois do 17. Seguro rodar de novo.
--
-- 1. O 17 decide quem exclui pelo autor (criado_por). Mas a política de
--    UPDATE deixa quem edita mexer em qualquer coluna — bastava trocar o
--    criado_por para o próprio e-mail e o cartão do colega virava "seu".
--    Este gatilho trava autor e data de criação numa edição.
-- 2. O pedido é "quem criou pode apagar o próprio". O padrão do time
--    estava com Excluir desligado, então ninguém além do admin apagava
--    nem o próprio cartão. Liga no padrão (quem tem exceção própria
--    continua com a dela; muda em Configurações › Permissões).

create or replace function public.trava_autor_cartao()
returns trigger
language plpgsql
as $$
begin
  new.criado_por := old.criado_por;
  return new;
end;
$$;

drop trigger if exists cartoes_trava_autor on public.cartoes;
create trigger cartoes_trava_autor
  before update on public.cartoes
  for each row execute function public.trava_autor_cartao();

update public.config_app
   set valor = jsonb_set(valor, '{demandas,excluir}', 'true'::jsonb, true),
       alterado_em = now(), alterado_por = 'script 18'
 where chave = 'permissoes_padrao';

-- Conferência
select 'gatilho' as item,
       (select count(*)::text from pg_trigger where tgname = 'cartoes_trava_autor') as valor
union all
select 'padrao demandas', (select (valor -> 'demandas')::text from public.config_app where chave = 'permissoes_padrao');
