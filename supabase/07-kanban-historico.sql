-- GuipaHub — responsável pela conta, histórico do kanban e quadro padrão
--
-- Rodar UMA VEZ no SQL Editor, depois do 06-permissoes.sql.
-- Seguro rodar de novo.

-- ---------------------------------------------------------------
-- 1. Quem cuida da conta, e quem cadastrou a marca
-- ---------------------------------------------------------------
--
-- Cada pessoa do comercial tem a sua carteira. O responsável é guardado
-- por e-mail, e não por id de perfil, porque a conta da pessoa só passa
-- a existir no primeiro login: dá para atribuir a carteira de alguém
-- que ainda não entrou no GuipaHub.

alter table public.marcas
  add column if not exists responsavel text not null default '';

-- As 272 do cadastro inicial foram geradas por script, não por alguém
-- da equipe. Marcar como "sistema" deixa isso visível em vez de
-- atribuir ao Gabriel um cadastro que ele não fez à mão.
--
-- Como achar exatamente as 272, sem pegar marca cadastrada à mão: elas
-- entraram num único INSERT, e no Postgres o now() é o instante do
-- começo da transação — então as 272 têm o MESMO criado_em, ao
-- microssegundo. O instante compartilhado pelo maior número de linhas
-- é o do cadastro em lote.
update public.marcas
   set criado_por = 'sistema'
 where criado_em = (
         select criado_em from public.marcas
          group by criado_em
         having count(*) > 50
          order by count(*) desc
          limit 1
       );

-- Daqui pra frente, quem cadastra fica registrado pelo próprio banco.
-- Confiar no valor que o app manda permitiria qualquer um assinar pelo
-- outro; o e-mail do token da sessão não dá para falsificar.
create or replace function public.email_da_sessao()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '')
$$;

create or replace function public.nome_da_sessao()
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() ->> 'email',
    ''
  )
$$;

create or replace function public.carimba_criador()
returns trigger
language plpgsql
as $$
begin
  if public.email_da_sessao() <> '' then
    new.criado_por := public.email_da_sessao();
  end if;
  return new;
end;
$$;

drop trigger if exists marcas_carimba on public.marcas;
create trigger marcas_carimba
  before insert on public.marcas
  for each row execute function public.carimba_criador();

drop trigger if exists cartoes_carimba on public.cartoes;
create trigger cartoes_carimba
  before insert on public.cartoes
  for each row execute function public.carimba_criador();

-- ---------------------------------------------------------------
-- 2. Quem é quem
-- ---------------------------------------------------------------
--
-- O 04 fechou a leitura da tabela de perfis (quem é admin, quais
-- permissões cada um tem). Mas para escolher o responsável de uma conta
-- e mostrar o nome de quem comentou, o time precisa da lista de NOMES.
-- Esta função devolve só nome e e-mail — o que um diretório de empresa
-- já mostra — e nada de permissão.

create or replace function public.pessoas_da_guipa()
returns table (email text, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select p.email, p.nome
    from public.perfis p
   where public.eh_da_guipa()
   order by lower(coalesce(nullif(p.nome, ''), p.email))
$$;

grant execute on function public.pessoas_da_guipa() to authenticated;

-- ---------------------------------------------------------------
-- 3. O histórico de cada cartão
-- ---------------------------------------------------------------
--
-- Uma linha por acontecimento: criou, moveu, editou, comentou, excluiu.
-- Comentário mora aqui também — é um acontecimento com texto, e assim a
-- linha do tempo do cartão sai de uma consulta só, já na ordem certa.
--
-- O nome de quem fez é guardado junto, e não buscado depois: o
-- histórico tem que continuar dizendo quem foi mesmo se a pessoa sair
-- da empresa ou trocar de nome.
--
-- `cartao_id` vira nulo quando o cartão é excluído, em vez de apagar o
-- histórico em cascata. Excluir um cartão não pode apagar a prova de
-- que ele existiu — por isso o título também fica guardado no evento.

create table if not exists public.cartoes_eventos (
  id            uuid primary key default gen_random_uuid(),
  quadro_id     uuid not null references public.quadros (id) on delete cascade,
  cartao_id     uuid references public.cartoes (id) on delete set null,
  cartao_titulo text not null default '',
  tipo          text not null check (tipo in ('criou','moveu','editou','comentou','excluiu')),
  de_lista      text not null default '',
  para_lista    text not null default '',
  texto         text not null default '',
  autor         text not null default '',
  autor_nome    text not null default '',
  criado_em     timestamptz not null default now()
);

create index if not exists cartoes_eventos_por_cartao
  on public.cartoes_eventos (cartao_id, criado_em);
create index if not exists cartoes_eventos_por_quadro
  on public.cartoes_eventos (quadro_id, criado_em desc);

-- O gatilho escreve o histórico, não o app. Se fosse o app, bastaria
-- chamar o banco pelo console sem passar pela função que registra, e o
-- cartão mudaria de coluna sem deixar rastro. Assim, qualquer mudança
-- — pela tela, pelo console ou por script — fica registrada.
--
-- security definer porque quem pode mover cartão não pode escrever
-- direto no histórico (a política abaixo só deixa inserir comentário).
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

  -- UPDATE: mudar de coluna e mudar conteúdo são registrados separados,
  -- porque são perguntas diferentes ("quem mandou para Validação?" e
  -- "quem mudou o prazo?").
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

  -- array_append e nao `mudou || 'campo'`: com ||, o Postgres le o texto
  -- solto como uma LISTA mal escrita ("malformed array literal") e o
  -- gatilho derruba a edicao inteira. Foi o teste com transacao desfeita
  -- que pegou isso -- editar cartao em quadro de marca estava falhando.
  if new.titulo      is distinct from old.titulo      then mudou := array_append(mudou, 'título'); end if;
  if new.solicitante is distinct from old.solicitante then mudou := array_append(mudou, 'solicitante'); end if;
  if new.prazo       is distinct from old.prazo       then mudou := array_append(mudou, 'prazo'); end if;
  if new.prioridade  is distinct from old.prioridade  then mudou := array_append(mudou, 'prioridade'); end if;
  if new.notas       is distinct from old.notas       then mudou := array_append(mudou, 'notas'); end if;

  if array_length(mudou, 1) > 0 then
    -- O cartão salva a cada tecla. Sem isto, digitar uma nota de 200
    -- letras gravaria 200 eventos "editou". Se a MESMA pessoa editou o
    -- mesmo cartão há menos de 2 minutos, atualiza aquele evento em vez
    -- de criar outro.
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

drop trigger if exists cartoes_historico_ins on public.cartoes;
create trigger cartoes_historico_ins
  after insert on public.cartoes
  for each row execute function public.registra_cartao();

drop trigger if exists cartoes_historico_upd on public.cartoes;
create trigger cartoes_historico_upd
  after update on public.cartoes
  for each row execute function public.registra_cartao();

drop trigger if exists cartoes_historico_del on public.cartoes;
create trigger cartoes_historico_del
  after delete on public.cartoes
  for each row execute function public.registra_cartao();

-- Acesso: todo mundo da GUIPA lê o histórico. Escrever pela API só
-- comentário, e só em nome próprio — o autor tem que ser quem está
-- logado. Ninguém edita nem apaga histórico: um registro que dá para
-- reescrever não é registro.
alter table public.cartoes_eventos enable row level security;

drop policy if exists eventos_le on public.cartoes_eventos;
create policy eventos_le on public.cartoes_eventos
  for select using (public.eh_da_guipa());

drop policy if exists eventos_comenta on public.cartoes_eventos;
create policy eventos_comenta on public.cartoes_eventos
  for insert with check (
    tipo = 'comentou'
    and autor = public.email_da_sessao()
    and public.pode_ou_admin('demandas', 'comentar')
  );

-- Comentar entra no padrão de permissões ligado: quem vê o quadro
-- normalmente pode comentar. Dá para tirar de alguém em Configurações.
update public.config_app
   set valor = jsonb_set(valor, '{demandas,comentar}', 'true'::jsonb, true)
 where chave = 'permissoes_padrao'
   and not (valor -> 'demandas' ? 'comentar');

-- Adicionar duas vezes à publicação dá erro, e este arquivo tem que
-- poder rodar de novo.
do $$
begin
  alter publication supabase_realtime add table public.cartoes_eventos;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------
-- 4. Toda marca nasce com quadro
-- ---------------------------------------------------------------
--
-- Antes o quadro só existia depois de alguém clicar em "Criar quadro",
-- e as 272 marcas apareciam como "sem quadro". Agora o banco cria o
-- quadro e as cinco colunas junto com a marca — tanto para as que já
-- existem quanto para as próximas.

create or replace function public.cria_quadro_padrao(p_marca uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q uuid;
begin
  insert into public.quadros (marca_id, criado_por)
  values (p_marca, 'sistema')
  on conflict (marca_id) do nothing
  returning id into q;

  if q is null then return; end if;   -- já tinha quadro

  insert into public.listas (quadro_id, nome, cor, concluida, ordem) values
    (q, 'Pendentes',    '#c78b2b', false, 0),
    (q, 'Em andamento', '#4f8fdb', false, 1),
    (q, 'Em validação', '#8a6fc4', false, 2),
    (q, 'On hold',      '#8b8d85', false, 3),
    (q, 'Concluído',    '#5fae5a', true,  4);
end;
$$;

create or replace function public.marca_nasce_com_quadro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cria_quadro_padrao(new.id);
  return new;
end;
$$;

drop trigger if exists marcas_quadro on public.marcas;
create trigger marcas_quadro
  after insert on public.marcas
  for each row execute function public.marca_nasce_com_quadro();

-- As que já existem e ainda não têm quadro.
select public.cria_quadro_padrao(m.id)
  from public.marcas m
 where not exists (select 1 from public.quadros q where q.marca_id = m.id);

-- ---------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------

select 'marcas' as item, count(*)::text as valor from public.marcas
union all
select 'marcas sem quadro', count(*)::text from public.marcas m
 where not exists (select 1 from public.quadros q where q.marca_id = m.id)
union all
select 'colunas criadas', count(*)::text from public.listas
union all
select 'cadastradas pelo sistema', count(*)::text from public.marcas where criado_por = 'sistema'
union all
select 'gatilhos de historico', count(*)::text from pg_trigger
 where tgname like 'cartoes_historico_%'
union all
select 'comentar no padrao',
       (select valor -> 'demandas' ->> 'comentar' from public.config_app
         where chave = 'permissoes_padrao');
