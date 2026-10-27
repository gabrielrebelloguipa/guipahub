-- GuipaHub — só vale sessão aberta pelo Google
--
-- Rodar UMA VEZ no SQL Editor, depois do 21. Seguro rodar de novo.
--
-- O Supabase do projeto aceita, além do Google, login por e-mail e senha
-- (o GuipaHub não usa, mas a porta existe). Quem sai da empresa perde a
-- conta Google na hora — mas, se tivesse criado uma senha antes por essa
-- porta, continuaria entrando. Aqui as regras do banco passam a exigir
-- que a sessão tenha sido aberta pelo Google: sessão de e-mail e senha
-- não lê nem grava nada.
--
-- O painel do Supabase (SQL Editor, configurações) não passa por estas
-- regras e não é afetado.

-- A sessão foi aberta pelo Google? (`amr` = como a pessoa se autenticou;
-- continua igual quando o token é renovado.)
create or replace function public.entrou_pelo_google()
returns boolean
language sql
stable
as $$
  select exists (
           select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
            where a ->> 'method' = 'oauth')
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
$$;

create or replace function public.eh_da_guipa()
returns boolean
language sql
stable
as $$
  select public.entrou_pelo_google()
     and coalesce(auth.jwt() ->> 'email', '') like '%@guipabrasil.com'
$$;

-- Fora do Google, a sessão não tem e-mail para as regras que comparam
-- dono/autor (prompts, quadro pessoal, comentários).
create or replace function public.email_da_sessao()
returns text
language sql
stable
as $$
  select case when public.entrou_pelo_google()
              then coalesce(auth.jwt() ->> 'email', '')
              else '' end
$$;

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.entrou_pelo_google()
     and coalesce((select p.admin from public.perfis p where p.id = auth.uid()), false)
$$;

create or replace function public.pode(area text, acao text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.entrou_pelo_google()
     and coalesce(
           (select (p.permissoes -> area ->> acao)::boolean
              from public.perfis p
             where p.id = auth.uid()),
           (select (c.valor -> area ->> acao)::boolean
              from public.config_app c
             where c.chave = 'permissoes_padrao'),
           false)
$$;

-- Conferência
select 'funcoes' as item,
       (select string_agg(proname, ', ' order by proname) from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and proname in ('entrou_pelo_google','eh_da_guipa','email_da_sessao','sou_admin','pode')) as valor;
