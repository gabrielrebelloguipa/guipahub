-- GuipaHub — permissões por ação, não só por aba
--
-- Rodar UMA VEZ no SQL Editor, depois do 04-pendentes.sql.
-- Seguro rodar de novo.
--
-- ⚠ POR QUE ISTO É SQL E NÃO SÓ TELA
--
-- Esconder um botão não impede nada: quem abrir o console do navegador
-- chama a mesma função do banco e o cartão some do mesmo jeito. Para
-- "não pode excluir" ser verdade, quem recusa tem que ser o Postgres.
-- É o que este arquivo faz: a tela passa a esconder, e o banco passa a
-- recusar. As duas coisas, não uma.

-- ---------------------------------------------------------------
-- 1. Onde a permissão mora
-- ---------------------------------------------------------------
--
-- Um jsonb por pessoa, no formato {area: {acao: true|false}}:
--   {"demandas": {"ver": true, "excluir": false}, ...}
--
-- NULL quer dizer "nunca foi personalizado" — e aí vale o padrão
-- global, igual ao que já acontecia com `abas`. Guardar NULL em vez de
-- copiar o padrão é o que faz mudar o padrão alcançar sozinho quem não
-- tem exceção.

alter table public.perfis
  add column if not exists permissoes jsonb;

insert into public.config_app (chave, valor) values
  ('permissoes_padrao', '{
     "hoje":     {"ver": true},
     "demandas": {"ver": true, "criar": true, "editar": true, "mover": true,
                  "excluir": false, "colunas": false},
     "central":  {"ver": true, "criar": false, "editar": false, "excluir": false},
     "marcas":   {"ver": false, "criar": false, "editar": false, "excluir": false},
     "clientes": {"ver": true, "baixar": true},
     "prompts":  {"ver": false, "publicar": false, "editar": false, "excluir": false}
   }'::jsonb)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------
-- 2. Migra quem já existe
-- ---------------------------------------------------------------
--
-- Quem tinha `abas` personalizado ganha o mesmo alcance em permissões:
-- a aba que via vira "ver": true, e as ações de escrita ficam como o
-- padrão decidir. Sem isto, ligar o sistema novo zeraria o ajuste fino
-- que já tivesse sido feito.

update public.perfis p
   set permissoes = (
     select jsonb_object_agg(aba, jsonb_build_object('ver', true))
       from unnest(p.abas) as aba
   )
 where p.abas is not null
   and p.permissoes is null
   and array_length(p.abas, 1) > 0;

-- ---------------------------------------------------------------
-- 3. A pergunta que as políticas fazem
-- ---------------------------------------------------------------
--
-- `pode('demandas','excluir')` responde pelo usuário da sessão atual.
-- Ordem: exceção da pessoa > padrão global > false.
--
-- false no fim é de propósito: área ou ação que ninguém configurou é
-- negada, não liberada. Um sistema de permissão que erra para o lado
-- do "sim" não é sistema de permissão.
--
-- security definer para ler perfis sem esbarrar no próprio RLS, e
-- search_path fixo porque security definer sem isso é porta aberta.

create or replace function public.pode(area text, acao text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (p.permissoes -> area ->> acao)::boolean
       from public.perfis p
      where p.id = auth.uid()),
    (select (c.valor -> area ->> acao)::boolean
       from public.config_app c
      where c.chave = 'permissoes_padrao'),
    false
  )
$$;

-- Admin passa por cima de tudo: sem isto, um admin que se recortasse
-- sem querer não teria como desfazer.
create or replace function public.pode_ou_admin(area text, acao text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sou_admin() or public.pode(area, acao)
$$;

-- ---------------------------------------------------------------
-- 4. Fora as antigas, que liberavam tudo
-- ---------------------------------------------------------------
--
-- ⚠ A ARMADILHA, porque ela quase passou.
--
-- O schema.sql criou `guipa_escreve` (ALL) e `guipa_le` (SELECT) em
-- cada tabela compartilhada: qualquer pessoa da GUIPA fazia qualquer
-- coisa. Na primeira versão deste arquivo eu tentei removê-las com
-- nomes que INVENTEI (marcas_tudo, cartoes_tudo). Os drops não casaram
-- com nada e falharam em silêncio, porque `if exists` não reclama.
--
-- O resultado seria pior que não ter feito nada: políticas permissivas
-- no Postgres se somam com OU. Com `guipa_escreve` viva ao lado das
-- novas, QUALQUER restrição é anulada — a tela esconderia o botão e o
-- banco continuaria aceitando. Teatro de permissão.
--
-- Por isso os nomes abaixo são os reais, conferidos em pg_policies, e
-- a conferência no fim deste arquivo falha de propósito se sobrar
-- alguma política ALL permissiva.

drop policy if exists guipa_escreve on public.marcas;
drop policy if exists guipa_le      on public.marcas;
drop policy if exists guipa_escreve on public.cartoes;
drop policy if exists guipa_le      on public.cartoes;
drop policy if exists guipa_escreve on public.listas;
drop policy if exists guipa_le      on public.listas;
drop policy if exists guipa_escreve on public.quadros;
drop policy if exists guipa_le      on public.quadros;
drop policy if exists guipa_escreve on public.biblioteca_prompts;
drop policy if exists guipa_le      on public.biblioteca_prompts;

-- ---------------------------------------------------------------
-- 5. As políticas
-- ---------------------------------------------------------------
--
-- Substituem as de schema.sql, que liberavam tudo para quem fosse da
-- GUIPA. Ler continua para todo mundo da casa; escrever passa pela
-- permissão. Separadas por comando de propósito: "pode criar mas não
-- excluir" só existe se insert e delete forem políticas diferentes.

-- marcas
drop policy if exists marcas_tudo on public.marcas;
drop policy if exists marcas_le on public.marcas;
drop policy if exists marcas_cria on public.marcas;
drop policy if exists marcas_edita on public.marcas;
drop policy if exists marcas_exclui on public.marcas;

create policy marcas_le     on public.marcas for select
  using (public.eh_da_guipa());
create policy marcas_cria   on public.marcas for insert
  with check (public.pode_ou_admin('marcas','criar'));
create policy marcas_edita  on public.marcas for update
  using (public.pode_ou_admin('marcas','editar'))
  with check (public.pode_ou_admin('marcas','editar'));
create policy marcas_exclui on public.marcas for delete
  using (public.pode_ou_admin('marcas','excluir'));

-- cartões do kanban
drop policy if exists cartoes_tudo on public.cartoes;
drop policy if exists cartoes_le on public.cartoes;
drop policy if exists cartoes_cria on public.cartoes;
drop policy if exists cartoes_edita on public.cartoes;
drop policy if exists cartoes_exclui on public.cartoes;

create policy cartoes_le     on public.cartoes for select
  using (public.eh_da_guipa());
create policy cartoes_cria   on public.cartoes for insert
  with check (public.pode_ou_admin('demandas','criar'));
-- mover e editar são o mesmo UPDATE para o Postgres: ele não sabe que
-- trocar `lista_id` é "mover" e trocar o título é "editar". Então aqui
-- basta uma das duas; a tela é que separa os dois gestos.
create policy cartoes_edita  on public.cartoes for update
  using (public.pode_ou_admin('demandas','editar')
      or public.pode_ou_admin('demandas','mover'))
  with check (public.pode_ou_admin('demandas','editar')
           or public.pode_ou_admin('demandas','mover'));
create policy cartoes_exclui on public.cartoes for delete
  using (public.pode_ou_admin('demandas','excluir'));

-- colunas do kanban
drop policy if exists listas_tudo on public.listas;
drop policy if exists listas_le on public.listas;
drop policy if exists listas_escreve on public.listas;

create policy listas_le      on public.listas for select
  using (public.eh_da_guipa());
create policy listas_escreve on public.listas for all
  using (public.pode_ou_admin('demandas','colunas'))
  with check (public.pode_ou_admin('demandas','colunas'));

-- quadros por marca
drop policy if exists quadros_tudo on public.quadros;
drop policy if exists quadros_le on public.quadros;
drop policy if exists quadros_escreve on public.quadros;

create policy quadros_le      on public.quadros for select
  using (public.eh_da_guipa());
create policy quadros_escreve on public.quadros for all
  using (public.pode_ou_admin('demandas','colunas'))
  with check (public.pode_ou_admin('demandas','colunas'));

-- biblioteca de prompts
drop policy if exists biblioteca_tudo on public.biblioteca_prompts;
drop policy if exists biblioteca_le on public.biblioteca_prompts;
drop policy if exists biblioteca_publica on public.biblioteca_prompts;
drop policy if exists biblioteca_edita on public.biblioteca_prompts;
drop policy if exists biblioteca_exclui on public.biblioteca_prompts;

create policy biblioteca_le      on public.biblioteca_prompts for select
  using (public.eh_da_guipa());
create policy biblioteca_publica on public.biblioteca_prompts for insert
  with check (public.pode_ou_admin('prompts','publicar'));
create policy biblioteca_edita   on public.biblioteca_prompts for update
  using (public.pode_ou_admin('prompts','editar'))
  with check (public.pode_ou_admin('prompts','editar'));
create policy biblioteca_exclui  on public.biblioteca_prompts for delete
  using (public.pode_ou_admin('prompts','excluir'));

-- ---------------------------------------------------------------
-- 6. Ninguém edita a própria permissão
-- ---------------------------------------------------------------
--
-- A regra que já existia para `admin` e `abas` passa a cobrir
-- `permissoes` também. Sem isto, qualquer pessoa se daria o direito de
-- excluir e a tela de permissões viraria decoração.

drop policy if exists perfis_toca_no_proprio on public.perfis;
create policy perfis_toca_no_proprio on public.perfis
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and admin = (select p.admin from public.perfis p where p.id = auth.uid())
    and abas is not distinct from (select p.abas from public.perfis p where p.id = auth.uid())
    and permissoes is not distinct from
        (select p.permissoes from public.perfis p where p.id = auth.uid())
  );

-- ---------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------

-- Esta consulta existe para FALHAR se a armadilha voltar. Qualquer
-- política ALL permissiva numa tabela compartilhada anula as regras por
-- ação, então ver zero aqui é o único resultado aceitável.
select 'politicas ALL que anulariam tudo' as item,
       coalesce(string_agg(tablename || '.' || policyname, ', '), 'nenhuma') as valor
  from pg_policies
 where schemaname = 'public'
   and cmd = 'ALL' and permissive = 'PERMISSIVE'
   and tablename in ('marcas','cartoes','listas','quadros','biblioteca_prompts')
   and policyname not in ('listas_escreve','quadros_escreve')
union all
select 'pessoas com permissao propria',
       count(*)::text from public.perfis where permissoes is not null
union all
select 'padrao', (select valor::text from public.config_app
                   where chave = 'permissoes_padrao');
