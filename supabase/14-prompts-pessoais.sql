-- GuipaHub — prompts de cada pessoa no banco, envio e favoritos
--
-- Rodar UMA VEZ no SQL Editor, depois do 13. Seguro rodar de novo.
--
-- Até aqui o prompt pessoal morava no navegador de cada um: ninguém via
-- o de ninguém, nem dava para mandar um prompt para um colega. Agora:
--   · prompts: os prompts de cada pessoa (dono). Cada um só vê os seus.
--     Guarda quem criou e, quando veio de outra pessoa, quem enviou.
--   · enviar = inserir uma cópia com o colega como dono. O banco carimba
--     quem enviou, para ninguém mandar prompt "em nome" de outro.
--   · prompts_favoritos: prompts da biblioteca do time que a pessoa
--     marcou com ★. Aparecem na aba dela junto com os próprios.

-- ---------------------------------------------------------------
-- 1. Prompts de cada pessoa
-- ---------------------------------------------------------------

create table if not exists public.prompts (
  id            uuid primary key default gen_random_uuid(),
  dono          text not null,                  -- e-mail de quem tem o prompt
  titulo        text not null,
  texto         text not null default '',
  tags          text[] not null default '{}',
  categoria     text not null default 'outro',
  ferramenta    text not null default '',
  modelo        text not null default '',
  favorito      boolean not null default false,
  criado_por    text not null default '',       -- quem escreveu o prompt
  enviado_por   text not null default '',       -- quem mandou (vazio = é do dono)
  da_biblioteca uuid,                           -- veio de um prompt do time
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists prompts_dono on public.prompts (lower(dono), criado_em desc);

alter table public.prompts enable row level security;

drop policy if exists prompts_le on public.prompts;
create policy prompts_le on public.prompts for select
  using (lower(dono) = lower(public.email_da_sessao()));

-- Inserir: o próprio prompt, ou um enviado para outra pessoa da GUIPA.
drop policy if exists prompts_cria on public.prompts;
create policy prompts_cria on public.prompts for insert
  with check (
    public.eh_da_guipa()
    and (lower(dono) = lower(public.email_da_sessao())
         or exists (select 1 from public.perfis p where lower(p.email) = lower(dono)))
  );

drop policy if exists prompts_edita on public.prompts;
create policy prompts_edita on public.prompts for update
  using (lower(dono) = lower(public.email_da_sessao()))
  with check (lower(dono) = lower(public.email_da_sessao()));

drop policy if exists prompts_exclui on public.prompts;
create policy prompts_exclui on public.prompts for delete
  using (lower(dono) = lower(public.email_da_sessao()));

-- Carimbo: quem envia é sempre a sessão; quem criou não se forja nem se
-- troca depois; o dono não muda numa edição.
create or replace function public.carimba_prompt()
returns trigger
language plpgsql
as $$
declare
  eu text := lower(public.email_da_sessao());
begin
  if tg_op = 'INSERT' then
    new.dono := lower(new.dono);
    if eu <> '' and new.dono <> eu then
      new.enviado_por := eu;
      if coalesce(new.criado_por, '') = '' then new.criado_por := eu; end if;
    else
      new.enviado_por := '';
      if eu <> '' then new.criado_por := coalesce(nullif(new.criado_por, ''), eu); end if;
    end if;
  else
    new.dono        := old.dono;
    new.criado_por  := old.criado_por;
    new.enviado_por := old.enviado_por;
    new.criado_em   := old.criado_em;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists prompts_carimba on public.prompts;
create trigger prompts_carimba
  before insert or update on public.prompts
  for each row execute function public.carimba_prompt();

-- ---------------------------------------------------------------
-- 2. Favoritos da biblioteca do time
-- ---------------------------------------------------------------

create table if not exists public.prompts_favoritos (
  email     text not null,
  prompt_id uuid not null references public.biblioteca_prompts (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (email, prompt_id)
);

alter table public.prompts_favoritos enable row level security;

drop policy if exists favoritos_proprios on public.prompts_favoritos;
create policy favoritos_proprios on public.prompts_favoritos for all
  using (lower(email) = lower(public.email_da_sessao()))
  with check (lower(email) = lower(public.email_da_sessao()));

-- ---------------------------------------------------------------
-- 3. Tempo real: prompt enviado aparece para quem recebe sem recarregar
-- ---------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['prompts', 'prompts_favoritos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------

select 'tabelas' as item,
       (select string_agg(table_name, ', ') from information_schema.tables
         where table_schema = 'public' and table_name in ('prompts', 'prompts_favoritos')) as valor
union all
select 'politicas de prompts',
       (select count(*)::text from pg_policies where tablename in ('prompts', 'prompts_favoritos'))
union all
select 'gatilho', (select count(*)::text from pg_trigger where tgname = 'prompts_carimba');
