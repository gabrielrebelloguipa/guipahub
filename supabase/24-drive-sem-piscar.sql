-- GuipaHub — acesso ao Drive renovado sem ida ao Google
--
-- Rodar UMA VEZ no SQL Editor, depois do 23. Seguro rodar de novo.
--
-- O Google dá o acesso ao Drive por 1 hora. Renovar sem passar pela tela
-- dele exige o "refresh token" da pessoa + o segredo do cliente Google,
-- e o segredo não pode morar no site. Quem faz a troca é a função
-- drive-token (supabase/functions/drive-token), que guarda o refresh
-- token de cada um aqui.
--
-- Tabela fechada: RLS ligada e NENHUMA política — pelo app ninguém lê nem
-- grava, nem o próprio dono. Só a função, com a chave de serviço.

create table if not exists public.drive_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.drive_tokens enable row level security;
revoke all on public.drive_tokens from anon, authenticated;

-- Conferência: rls ligada e zero políticas
select 'rls' as item, relrowsecurity::text as valor from pg_class where oid = 'public.drive_tokens'::regclass
union all
select 'políticas', count(*)::text from pg_policies where tablename = 'drive_tokens';
