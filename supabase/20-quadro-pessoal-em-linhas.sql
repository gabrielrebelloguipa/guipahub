-- GuipaHub — quadro pessoal nas mesmas tabelas do quadro de marca
--
-- Rodar UMA VEZ no SQL Editor, depois do 19. Seguro rodar de novo.
--
-- O 16 guardava o quadro pessoal inteiro num documento só por pessoa.
-- Dois problemas: cada mudança regravava o quadro todo, e com o app
-- aberto em dois computadores o último a salvar apagava o que o outro
-- fez. Agora o quadro pessoal é um quadro como os de marca (quadros /
-- listas / cartoes), com `dono` preenchido:
--   · cada cartão é uma linha: salvar um cartão grava só ele, e dois
--     computadores só se atropelam se mexerem no MESMO cartão;
--   · só o dono lê e grava o quadro pessoal — nem admin vê;
--   · quadro pessoal não entra no histórico do time.
-- E, pedido do Gabriel: nos quadros de MARCA, criar, excluir e mexer em
-- colunas é só admin. No pessoal a pessoa faz o que quiser.

-- ---------------------------------------------------------------
-- 1. quadros: de marca OU de uma pessoa
-- ---------------------------------------------------------------

alter table public.quadros alter column marca_id drop not null;
alter table public.quadros add column if not exists dono text;

create unique index if not exists quadros_um_por_pessoa
  on public.quadros (lower(dono)) where dono is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quadro_de_marca_ou_pessoal') then
    alter table public.quadros add constraint quadro_de_marca_ou_pessoal
      check ((marca_id is null) <> (dono is null));
  end if;
end $$;

-- 'marca' | 'meu' | 'outro'. security definer para ler o quadro mesmo
-- quando a política não deixaria (é o que decide a política).
create or replace function public.tipo_quadro(q uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when dono is null then 'marca'
           when lower(dono) = lower(public.email_da_sessao()) then 'meu'
           else 'outro'
         end
    from public.quadros where id = q
$$;

-- ---------------------------------------------------------------
-- 2. Regras de acesso
-- ---------------------------------------------------------------

drop policy if exists quadros_le on public.quadros;
drop policy if exists quadros_escreve on public.quadros;
create policy quadros_le on public.quadros for select
  using (public.eh_da_guipa()
         and (dono is null or lower(dono) = lower(public.email_da_sessao())));
-- Quadro de marca nasce com a marca (07); o pessoal, pela função abaixo.
create policy quadros_escreve on public.quadros for all
  using (dono is null and public.sou_admin())
  with check (dono is null and public.sou_admin());

drop policy if exists listas_le on public.listas;
drop policy if exists listas_escreve on public.listas;
create policy listas_le on public.listas for select
  using (public.eh_da_guipa() and public.tipo_quadro(quadro_id) in ('marca', 'meu'));
create policy listas_escreve on public.listas for all
  using (case public.tipo_quadro(quadro_id)
           when 'meu' then true
           when 'marca' then public.sou_admin()
           else false end)
  with check (case public.tipo_quadro(quadro_id)
           when 'meu' then true
           when 'marca' then public.sou_admin()
           else false end);

drop policy if exists cartoes_le on public.cartoes;
drop policy if exists cartoes_cria on public.cartoes;
drop policy if exists cartoes_edita on public.cartoes;
drop policy if exists cartoes_exclui on public.cartoes;
create policy cartoes_le on public.cartoes for select
  using (public.eh_da_guipa() and public.tipo_quadro(quadro_id) in ('marca', 'meu'));
create policy cartoes_cria on public.cartoes for insert
  with check (case public.tipo_quadro(quadro_id)
           when 'meu' then true
           when 'marca' then public.pode_ou_admin('demandas', 'criar')
           else false end);
create policy cartoes_edita on public.cartoes for update
  using (case public.tipo_quadro(quadro_id)
           when 'meu' then true
           when 'marca' then public.pode_ou_admin('demandas', 'editar')
                          or public.pode_ou_admin('demandas', 'mover')
           else false end)
  with check (case public.tipo_quadro(quadro_id)
           when 'meu' then true
           when 'marca' then public.pode_ou_admin('demandas', 'editar')
                          or public.pode_ou_admin('demandas', 'mover')
           else false end);
create policy cartoes_exclui on public.cartoes for delete
  using (case public.tipo_quadro(quadro_id)
           when 'meu' then true
           when 'marca' then public.pode_ou_admin('demandas', 'excluir_outros')
                          or (public.pode_ou_admin('demandas', 'excluir')
                              and lower(criado_por) = lower(public.email_da_sessao()))
           else false end);

-- ---------------------------------------------------------------
-- 3. Quadro pessoal fica fora do histórico do time
-- ---------------------------------------------------------------

create or replace function public.registra_cartao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nome_de  text;
  nome_para text;
  mudou    text[] := '{}';
begin
  -- Quadro pessoal: nada de histórico (o histórico é lido pelo time todo).
  if exists (select 1 from public.quadros
              where id = case when tg_op = 'DELETE' then old.quadro_id else new.quadro_id end
                and dono is not null) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    select nome into nome_para from public.listas where id = new.lista_id;
    insert into public.cartoes_eventos
      (quadro_id, cartao_id, cartao_titulo, tipo, para_lista, autor, autor_nome)
    values
      (new.quadro_id, new.id, new.titulo, 'criou', coalesce(nome_para, ''),
       public.email_da_sessao(), public.nome_da_sessao());
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.cartoes_eventos
      (quadro_id, cartao_id, cartao_titulo, tipo, autor, autor_nome)
    values
      (old.quadro_id, null, old.titulo, 'excluiu',
       public.email_da_sessao(), public.nome_da_sessao());
    return old;
  end if;

  if new.lista_id is distinct from old.lista_id then
    select nome into nome_de   from public.listas where id = old.lista_id;
    select nome into nome_para from public.listas where id = new.lista_id;
    insert into public.cartoes_eventos
      (quadro_id, cartao_id, cartao_titulo, tipo, de_lista, para_lista, autor, autor_nome)
    values
      (new.quadro_id, new.id, new.titulo, 'moveu',
       coalesce(nome_de, ''), coalesce(nome_para, ''),
       public.email_da_sessao(), public.nome_da_sessao());
  end if;

  if new.titulo      is distinct from old.titulo      then mudou := array_append(mudou, 'título'); end if;
  if new.solicitante is distinct from old.solicitante then mudou := array_append(mudou, 'solicitante'); end if;
  if new.prazo       is distinct from old.prazo       then mudou := array_append(mudou, 'prazo'); end if;
  if new.prioridade  is distinct from old.prioridade  then mudou := array_append(mudou, 'prioridade'); end if;
  if new.notas       is distinct from old.notas       then mudou := array_append(mudou, 'notas'); end if;

  if array_length(mudou, 1) > 0 then
    update public.cartoes_eventos e
       set texto = (
             select string_agg(distinct x, ', ')
               from unnest(string_to_array(e.texto, ', ') || mudou) as x
           ),
           cartao_titulo = new.titulo,
           criado_em = now()
     where e.id = (
             select id from public.cartoes_eventos
              where cartao_id = new.id and tipo = 'editou'
                and autor = public.email_da_sessao()
                and criado_em > now() - interval '2 minutes'
              order by criado_em desc limit 1
           );
    if not found then
      insert into public.cartoes_eventos
        (quadro_id, cartao_id, cartao_titulo, tipo, texto, autor, autor_nome)
      values
        (new.quadro_id, new.id, new.titulo, 'editou', array_to_string(mudou, ', '),
         public.email_da_sessao(), public.nome_da_sessao());
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 4. "Meu quadro": devolve o quadro pessoal de quem chama, criando com
--    as cinco colunas padrão na primeira vez.
-- ---------------------------------------------------------------

create or replace function public.criar_quadro_pessoal(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  q uuid;
begin
  select id into q from public.quadros where lower(dono) = lower(p_email);
  if q is not null then return q; end if;
  insert into public.quadros (dono, criado_por) values (lower(p_email), lower(p_email))
  returning id into q;
  insert into public.listas (quadro_id, nome, cor, concluida, ordem) values
    (q, 'Pendentes',    '#c78b2b', false, 0),
    (q, 'Em andamento', '#4f8fdb', false, 1),
    (q, 'Em validação', '#8a6fc4', false, 2),
    (q, 'On hold',      '#8b8d85', false, 3),
    (q, 'Concluído',    '#5fae5a', true,  4);
  return q;
end;
$$;
revoke execute on function public.criar_quadro_pessoal(text) from public, anon, authenticated;

create or replace function public.meu_quadro_pessoal()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_da_guipa() then raise exception 'sem acesso'; end if;
  return public.criar_quadro_pessoal(public.email_da_sessao());
end;
$$;
grant execute on function public.meu_quadro_pessoal() to authenticated;

-- ---------------------------------------------------------------
-- 5. Migra o que estava no documento do 16 (só quem ainda não tem
--    quadro pessoal com cartões).
-- ---------------------------------------------------------------

do $$
declare
  k record; q uuid; l jsonb; d jsonb; i int; mapa jsonb; primeira uuid; nova uuid;
begin
  for k in select * from public.kanban_pessoal loop
    if exists (select 1 from public.quadros qq join public.cartoes c on c.quadro_id = qq.id
                where lower(qq.dono) = lower(k.email)) then
      continue;
    end if;
    q := public.criar_quadro_pessoal(k.email);

    -- colunas: troca as padrão pelas do documento, guardando o mapa id antigo → novo
    if jsonb_array_length(k.listas) > 0 then
      delete from public.listas where quadro_id = q;
      mapa := '{}'::jsonb;
      i := 0;
      for l in select * from jsonb_array_elements(k.listas) loop
        insert into public.listas (quadro_id, nome, cor, concluida, ordem)
        values (q, coalesce(l->>'nome', 'Lista'), coalesce(l->>'cor', '#8b8d85'),
                coalesce((l->>'concluida')::boolean, false), i)
        returning id into nova;
        mapa := mapa || jsonb_build_object(l->>'id', nova::text);
        i := i + 1;
      end loop;
    end if;
    select id into primeira from public.listas where quadro_id = q order by ordem limit 1;

    i := 0;
    for d in select * from jsonb_array_elements(k.demandas) loop
      insert into public.cartoes
        (quadro_id, lista_id, titulo, solicitante, prazo, prioridade, notas, ordem,
         criado_por, criado_em)
      values
        (q,
         coalesce((mapa ->> (d->>'status'))::uuid, primeira),
         coalesce(nullif(d->>'titulo', ''), 'Sem título'),
         coalesce(d->>'solicitante', ''),
         nullif(d->>'prazo', '')::date,
         coalesce(nullif(d->>'prioridade', ''), 'normal'),
         coalesce(d->>'notas', ''),
         i,
         lower(k.email),
         coalesce(nullif(d->>'criadoEm', '')::timestamptz, now()));
      i := i + 1;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------

select 'quadros pessoais' as item,
       (select string_agg(q.dono || ': ' ||
                 (select count(*) from public.cartoes c where c.quadro_id = q.id) || ' cartões, ' ||
                 (select count(*) from public.listas l where l.quadro_id = q.id) || ' colunas', ' · ')
          from public.quadros q where q.dono is not null) as valor
union all
select 'eventos de quadro pessoal (tem que ser 0)',
       (select count(*)::text from public.cartoes_eventos e
          join public.quadros q on q.id = e.quadro_id where q.dono is not null);
