-- GuipaHub — Central Guipa compartilhada
--
-- Rodar UMA VEZ no SQL Editor. Seguro rodar de novo.
--
-- Até aqui a Central morava no navegador de cada pessoa: o "material
-- oficial da GUIPA" de um não aparecia para mais ninguém, e cada um que
-- entrava via a sua Central vazia. Agora materiais, guias e imagens
-- moram no banco, iguais para o time inteiro, e quem cria, edita ou
-- exclui segue a permissão "central" de Configurações.

-- ---------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------

create table if not exists public.central_materiais (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  categoria  text not null default '',
  url        text not null default '',
  notas      text not null default '',
  criado_por text not null default '',
  criado_em  timestamptz not null default now()
);

create table if not exists public.central_guias (
  id         uuid primary key default gen_random_uuid(),
  grupo      text not null default '',
  titulo     text not null,
  valor      text not null default '',
  notas      text not null default '',
  criado_por text not null default '',
  criado_em  timestamptz not null default now()
);

-- A imagem em si fica no armazenamento de arquivos (bucket "central",
-- abaixo). Aqui fica só o nome que aparece na tela e o caminho dela lá.
create table if not exists public.central_imagens (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  caminho    text not null unique,
  tipo       text not null default '',
  bytes      bigint not null default 0,
  criado_por text not null default '',
  criado_em  timestamptz not null default now()
);

-- Quem criou é carimbado pelo banco, como nas marcas (07).
drop trigger if exists central_materiais_carimba on public.central_materiais;
create trigger central_materiais_carimba before insert on public.central_materiais
  for each row execute function public.carimba_criador();
drop trigger if exists central_guias_carimba on public.central_guias;
create trigger central_guias_carimba before insert on public.central_guias
  for each row execute function public.carimba_criador();
drop trigger if exists central_imagens_carimba on public.central_imagens;
create trigger central_imagens_carimba before insert on public.central_imagens
  for each row execute function public.carimba_criador();

-- ---------------------------------------------------------------
-- 2. Quem pode o quê
-- ---------------------------------------------------------------
--
-- Ler: todo mundo da GUIPA. Criar, editar e excluir: a permissão
-- "central" de cada um. Separado por comando, para "pode criar mas não
-- excluir" existir de verdade.

do $$
declare t text;
begin
  foreach t in array array['central_materiais', 'central_guias', 'central_imagens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_le', t);
    execute format('drop policy if exists %I on public.%I', t || '_cria', t);
    execute format('drop policy if exists %I on public.%I', t || '_edita', t);
    execute format('drop policy if exists %I on public.%I', t || '_exclui', t);
    execute format('create policy %I on public.%I for select using (public.eh_da_guipa())',
                   t || '_le', t);
    execute format('create policy %I on public.%I for insert with check (public.pode_ou_admin(''central'', ''criar''))',
                   t || '_cria', t);
    execute format('create policy %I on public.%I for update using (public.pode_ou_admin(''central'', ''editar'')) with check (public.pode_ou_admin(''central'', ''editar''))',
                   t || '_edita', t);
    execute format('create policy %I on public.%I for delete using (public.pode_ou_admin(''central'', ''excluir''))',
                   t || '_exclui', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 3. Onde as imagens moram
-- ---------------------------------------------------------------
--
-- Bucket PRIVADO: sem login da GUIPA, a imagem não abre nem com o link.
-- O app pede um link assinado que vence em uma hora.

insert into storage.buckets (id, name, public, file_size_limit)
values ('central', 'central', false, 26214400)   -- 25 MB por arquivo
on conflict (id) do nothing;

-- storage.objects é uma tabela só para todos os buckets: os nomes das
-- políticas levam "central_" para não colidir com os de outro bucket.
drop policy if exists central_arquivos_le on storage.objects;
create policy central_arquivos_le on storage.objects
  for select using (bucket_id = 'central' and public.eh_da_guipa());

drop policy if exists central_arquivos_sobe on storage.objects;
create policy central_arquivos_sobe on storage.objects
  for insert with check (bucket_id = 'central' and public.pode_ou_admin('central', 'criar'));

drop policy if exists central_arquivos_apaga on storage.objects;
create policy central_arquivos_apaga on storage.objects
  for delete using (bucket_id = 'central' and public.pode_ou_admin('central', 'excluir'));

-- ---------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------

select 'tabelas' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name like 'central\_%'
union all
select 'politicas nas tabelas', count(*)::text
  from pg_policies where schemaname = 'public' and tablename like 'central\_%'
union all
select 'bucket privado', (select (not public)::text from storage.buckets where id = 'central')
union all
select 'politicas do bucket', count(*)::text
  from pg_policies where schemaname = 'storage' and policyname like 'central\_arquivos\_%';
