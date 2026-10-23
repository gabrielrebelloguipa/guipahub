-- GuipaHub — kanban pessoal no banco, por pessoa
--
-- Rodar UMA VEZ no SQL Editor, depois do 15. Seguro rodar de novo.
--
-- O quadro pessoal morava no localStorage: aparecia só no navegador
-- onde foi montado, e quem abria o GuipaHub em outro computador (ou
-- outro perfil do Chrome) via o quadro vazio. Agora fica no banco, um
-- registro por pessoa, com as colunas e as tarefas dela. Só a própria
-- pessoa lê e grava — nem admin vê o quadro pessoal de outro.

create table if not exists public.kanban_pessoal (
  email         text primary key,
  listas        jsonb not null default '[]'::jsonb,
  demandas      jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.kanban_pessoal enable row level security;

drop policy if exists kanban_pessoal_proprio on public.kanban_pessoal;
create policy kanban_pessoal_proprio on public.kanban_pessoal for all
  using (lower(email) = lower(public.email_da_sessao()))
  with check (lower(email) = lower(public.email_da_sessao()));

-- Conferência
select 'tabela' as item,
       (select count(*)::text from information_schema.tables
         where table_schema = 'public' and table_name = 'kanban_pessoal') as valor
union all
select 'politica', (select count(*)::text from pg_policies where tablename = 'kanban_pessoal');
