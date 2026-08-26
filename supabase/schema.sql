-- GuipaHub — esquema do banco
--
-- Rodar UMA VEZ no SQL Editor do Supabase (é seguro rodar de novo: tudo
-- está com IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- O que mora aqui: só o que é COMPARTILHADO — marcas, biblioteca de
-- prompts e os quadros por empresa. O que é de cada um (kanban pessoal,
-- prompts pessoais, Central Guipa) continua no navegador de quem usa e
-- não sobe para cá.
--
-- Regra de acesso, uma só: quem entrou com conta @guipabrasil.com lê e
-- escreve tudo. É ferramenta interna, todo mundo do time é par. Não vale
-- inventar hierarquia que ninguém pediu — mas as colunas `criado_por`
-- ficam registradas, então dá para apertar depois sem migrar dados.

-- ---------------------------------------------------------------
-- 0. helper: o e-mail de quem está chamando é da GUIPA?
-- ---------------------------------------------------------------

-- Lê o e-mail direto do token da sessão. Se não houver sessão, devolve
-- falso — então requisição anônima não passa por nenhuma política.
create or replace function public.eh_da_guipa()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') like '%@guipabrasil.com'
$$;

-- ---------------------------------------------------------------
-- 1. marcas
-- ---------------------------------------------------------------

create table if not exists public.marcas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  nicho       text not null,
  site        text not null,
  resumo      text not null,
  descricao   text not null,
  logo        text,                     -- data URL reduzida; nulo é normal
  criado_por  text not null default '',
  criado_em   timestamptz not null default now(),
  alterado_em timestamptz not null default now()
);

-- Duas marcas com o mesmo nome viram dois clientes na busca e no
-- dropdown de quadros. O índice compara sem maiúscula para "iFood" e
-- "IFOOD" colidirem de verdade.
create unique index if not exists marcas_nome_unico
  on public.marcas (lower(nome));

create index if not exists marcas_nicho on public.marcas (nicho);

-- ---------------------------------------------------------------
-- 2. biblioteca de prompts
-- ---------------------------------------------------------------

create table if not exists public.biblioteca_prompts (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  texto      text not null,
  tags       text[] not null default '{}',
  categoria  text not null default 'outro',
  ferramenta text not null default '',
  modelo     text not null default '',
  criado_por text not null default '',
  criado_em  timestamptz not null default now()
);

-- Publicar de novo o mesmo prompt atualiza em vez de duplicar — a
-- aplicação já faz isso, e o índice garante mesmo com dois cliques
-- simultâneos.
create unique index if not exists biblioteca_titulo_unico
  on public.biblioteca_prompts (lower(titulo));

-- ---------------------------------------------------------------
-- 3. quadros por empresa
-- ---------------------------------------------------------------

create table if not exists public.quadros (
  id         uuid primary key default gen_random_uuid(),
  marca_id   uuid not null unique
             references public.marcas (id) on delete cascade,
  criado_por text not null default '',
  criado_em  timestamptz not null default now()
);
-- `unique` no marca_id: uma empresa tem no máximo um quadro.
-- `on delete cascade`: apagar a marca leva o quadro junto — é o que a
-- interface já promete na confirmação de exclusão.

create table if not exists public.listas (
  id        uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references public.quadros (id) on delete cascade,
  nome      text not null,
  cor       text not null default '#8b8d85',
  concluida boolean not null default false,
  ordem     double precision not null default 0
);

create index if not exists listas_do_quadro on public.listas (quadro_id, ordem);

create table if not exists public.cartoes (
  id          uuid primary key default gen_random_uuid(),
  quadro_id   uuid not null references public.quadros (id) on delete cascade,
  lista_id    uuid not null references public.listas (id) on delete cascade,
  titulo      text not null,
  solicitante text not null default '',
  prazo       date,
  prioridade  text not null default 'normal',
  notas       text not null default '',
  ordem       double precision not null default 0,
  criado_por  text not null default '',
  criado_em   timestamptz not null default now(),
  alterado_em timestamptz not null default now()
);

create index if not exists cartoes_da_lista on public.cartoes (lista_id, ordem);
create index if not exists cartoes_do_quadro on public.cartoes (quadro_id);

-- `ordem` é double precision de propósito, não inteiro: para inserir um
-- cartão entre dois vizinhos basta a média das duas ordens, sem
-- reescrever a coluna inteira a cada arraste. Com inteiro, mover um
-- cartão obrigaria a renumerar todos os seguintes — dezenas de UPDATEs
-- por arraste, e conflito quando duas pessoas arrastam ao mesmo tempo.

-- ---------------------------------------------------------------
-- 4. alterado_em automático
-- ---------------------------------------------------------------

create or replace function public.marca_alterado_em()
returns trigger
language plpgsql
as $$
begin
  new.alterado_em = now();
  return new;
end;
$$;

drop trigger if exists marcas_alterado_em on public.marcas;
create trigger marcas_alterado_em
  before update on public.marcas
  for each row execute function public.marca_alterado_em();

drop trigger if exists cartoes_alterado_em on public.cartoes;
create trigger cartoes_alterado_em
  before update on public.cartoes
  for each row execute function public.marca_alterado_em();

-- ---------------------------------------------------------------
-- 5. RLS — sem isto, a chave pública do site lê e escreve tudo
-- ---------------------------------------------------------------

-- ⚠ A anon key do Supabase vai dentro do JavaScript do site: qualquer
-- pessoa consegue lê-la. O que impede o mundo de mexer no banco NÃO é
-- ela ser secreta (não é), e sim estas políticas. Ligar RLS é o passo
-- que não pode ser pulado.

alter table public.marcas             enable row level security;
alter table public.biblioteca_prompts enable row level security;
alter table public.quadros            enable row level security;
alter table public.listas             enable row level security;
alter table public.cartoes            enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'marcas', 'biblioteca_prompts', 'quadros', 'listas', 'cartoes'
  ]
  loop
    execute format('drop policy if exists guipa_le on public.%I', t);
    execute format('drop policy if exists guipa_escreve on public.%I', t);

    execute format(
      'create policy guipa_le on public.%I for select using (public.eh_da_guipa())', t);

    -- `with check` vale para INSERT e UPDATE; `using` vale para UPDATE e
    -- DELETE. Precisa dos dois, senão dá para inserir linha que a
    -- própria política não deixaria ler depois.
    execute format(
      'create policy guipa_escreve on public.%I for all
         using (public.eh_da_guipa())
         with check (public.eh_da_guipa())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 6. tempo real (opcional, mas é o que faz a mudança aparecer sozinha)
-- ---------------------------------------------------------------

-- Sem isto o time só vê a mudança de outra pessoa ao recarregar. Com
-- isto, o cartão que o colega arrastou aparece movendo na sua tela.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.marcas;
alter publication supabase_realtime add table public.biblioteca_prompts;
alter publication supabase_realtime add table public.quadros;
alter publication supabase_realtime add table public.listas;
alter publication supabase_realtime add table public.cartoes;
