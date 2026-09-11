-- GuipaHub — configurações e permissões de aba
--
-- Rodar UMA VEZ no SQL Editor, depois do schema.sql.
-- Seguro rodar de novo (tudo com IF NOT EXISTS / DROP IF EXISTS).

-- ---------------------------------------------------------------
-- 1. perfis — uma linha por pessoa que já entrou
-- ---------------------------------------------------------------

-- Só aparece aqui quem já fez login pelo menos uma vez. Não dá para
-- pré-cadastrar permissão de alguém que nunca entrou: o Supabase Auth
-- cria o usuário no primeiro login, não antes. Quem entra pela primeira
-- vez recebe as abas padrão e passa a aparecer na lista.
create table if not exists public.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nome        text not null default '',
  -- null = ainda não foi personalizado, então vale o padrão global.
  -- Guardar null em vez de copiar o padrão faz diferença: quando o
  -- padrão mudar, quem nunca foi personalizado acompanha sozinho.
  abas        text[],
  admin       boolean not null default false,
  criado_em   timestamptz not null default now(),
  visto_em    timestamptz not null default now()
);

create unique index if not exists perfis_email on public.perfis (lower(email));

-- ---------------------------------------------------------------
-- 2. config_app — ajustes globais, uma linha por chave
-- ---------------------------------------------------------------

create table if not exists public.config_app (
  chave       text primary key,
  valor       jsonb not null,
  alterado_em timestamptz not null default now(),
  alterado_por text not null default ''
);

-- Valores iniciais. `on conflict do nothing` para não sobrescrever o que
-- já estiver configurado quando este script rodar de novo.
insert into public.config_app (chave, valor) values
  ('abas_padrao', '["hoje","demandas","central","marcas","clientes","prompts"]'::jsonb),
  ('drive', '{"raizId":"","raizNome":"","somenteRaiz":false}'::jsonb)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------
-- 3. o primeiro a entrar vira admin
-- ---------------------------------------------------------------

-- Sem isto ninguém conseguiria abrir Configurações — e não haveria como
-- promover ninguém, porque promover exige ser admin. O primeiro login
-- resolve o problema do ovo e da galinha.
create or replace function public.ao_criar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email, nome, admin)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    not exists (select 1 from public.perfis)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists criar_perfil on auth.users;
create trigger criar_perfil
  after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- Quem já entrou antes deste script existir não passou pelo gatilho.
insert into public.perfis (id, email, nome, admin)
select u.id,
       coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
       true
from auth.users u
where not exists (select 1 from public.perfis p where p.id = u.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------

alter table public.perfis     enable row level security;
alter table public.config_app enable row level security;

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.admin from public.perfis p where p.id = auth.uid()),
    false
  )
$$;

-- Todo mundo da GUIPA lê os perfis: a lista de quem existe não é
-- segredo, e a interface precisa dela para montar a tela de permissões.
drop policy if exists perfis_le on public.perfis;
create policy perfis_le on public.perfis
  for select using (public.eh_da_guipa());

-- Escrever em perfil alheio é privilégio de admin. Cada um pode tocar no
-- próprio (o carimbo de visto_em), mas NUNCA nas próprias permissões —
-- senão qualquer pessoa se promoveria a admin e a regra seria decorativa.
drop policy if exists perfis_escreve_admin on public.perfis;
create policy perfis_escreve_admin on public.perfis
  for all using (public.sou_admin()) with check (public.sou_admin());

drop policy if exists perfis_toca_no_proprio on public.perfis;
create policy perfis_toca_no_proprio on public.perfis
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and admin = (select p.admin from public.perfis p where p.id = auth.uid())
    and abas is not distinct from (select p.abas from public.perfis p where p.id = auth.uid())
  );

drop policy if exists config_le on public.config_app;
create policy config_le on public.config_app
  for select using (public.eh_da_guipa());

drop policy if exists config_escreve on public.config_app;
create policy config_escreve on public.config_app
  for all using (public.sou_admin()) with check (public.sou_admin());

-- ---------------------------------------------------------------
-- 5. tempo real
-- ---------------------------------------------------------------

-- Mudança de permissão aparece na tela da pessoa sem precisar recarregar.
alter publication supabase_realtime add table public.perfis;
alter publication supabase_realtime add table public.config_app;
