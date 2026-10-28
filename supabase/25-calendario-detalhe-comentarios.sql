-- GuipaHub — Calendário Comercial: detalhes do item e comentários do time
--
-- Rodar UMA VEZ no SQL Editor, depois do 24. Seguro rodar de novo.
--
-- Cada item ganha descrição, período, local e link. E uma conversa, como
-- o cartão do kanban de marca: quem escreveu edita e exclui; admin exclui
-- qualquer um; toda versão vai para auditoria_comentarios (só admin lê).

alter table public.calendario_itens
  add column if not exists descricao text not null default '',
  add column if not exists inicio    date,
  add column if not exists fim       date,
  add column if not exists local     text not null default '',
  add column if not exists link      text not null default '';

create table if not exists public.calendario_comentarios (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.calendario_itens (id) on delete cascade,
  item_titulo text not null default '',
  texto       text not null check (length(trim(texto)) > 0),
  autor       text not null default '',
  autor_nome  text not null default '',
  criado_em   timestamptz not null default now(),
  editado_em  timestamptz
);
create index if not exists calendario_comentarios_item
  on public.calendario_comentarios (item_id, criado_em);

alter table public.calendario_comentarios enable row level security;

drop policy if exists calcom_le on public.calendario_comentarios;
drop policy if exists calcom_cria on public.calendario_comentarios;
drop policy if exists calcom_edita on public.calendario_comentarios;
drop policy if exists calcom_exclui on public.calendario_comentarios;
create policy calcom_le on public.calendario_comentarios for select
  using (public.eh_da_guipa() and public.pode_ou_admin('calendario', 'ver'));
create policy calcom_cria on public.calendario_comentarios for insert
  with check (public.pode_ou_admin('calendario', 'comentar'));
create policy calcom_edita on public.calendario_comentarios for update
  using (autor = public.email_da_sessao())
  with check (autor = public.email_da_sessao());
create policy calcom_exclui on public.calendario_comentarios for delete
  using (autor = public.email_da_sessao() or public.sou_admin());

-- Autor e data vêm da sessão, não do app; editar mexe só no texto.
create or replace function public.carimba_comentario_calendario()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.autor      := public.email_da_sessao();
    new.autor_nome := public.nome_da_sessao();
    new.criado_em  := now();
    new.editado_em := null;
    select i.titulo into new.item_titulo from public.calendario_itens i where i.id = new.item_id;
    new.item_titulo := coalesce(new.item_titulo, '');
  else
    new.id          := old.id;
    new.item_id     := old.item_id;
    new.item_titulo := old.item_titulo;
    new.autor       := old.autor;
    new.autor_nome  := old.autor_nome;
    new.criado_em   := old.criado_em;
    new.editado_em  := case when new.texto is distinct from old.texto then now() else old.editado_em end;
  end if;
  return new;
end;
$$;

drop trigger if exists calendario_comentarios_carimba on public.calendario_comentarios;
create trigger calendario_comentarios_carimba
  before insert or update on public.calendario_comentarios
  for each row execute function public.carimba_comentario_calendario();

-- Mesma auditoria dos comentários do kanban.
create or replace function public.audita_comentario_calendario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linha public.calendario_comentarios;
begin
  if tg_op = 'DELETE' then
    linha := old;
  else
    linha := new;
  end if;
  if tg_op = 'UPDATE' and new.texto is not distinct from old.texto then
    return null;
  end if;
  insert into public.auditoria_comentarios
    (comentario_id, quadro_id, marca_nome, cartao_id, cartao_titulo, acao,
     autor_comentario, feito_por, feito_por_nome, texto_antes, texto_depois)
  values
    (linha.id, null, 'Calendário Comercial', linha.item_id, linha.item_titulo,
     case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'editou' else 'excluiu' end,
     linha.autor, public.email_da_sessao(), public.nome_da_sessao(),
     case when tg_op = 'INSERT' then '' else old.texto end,
     case when tg_op = 'DELETE' then '' else new.texto end);
  return null;
end;
$$;

drop trigger if exists calendario_comentarios_audita on public.calendario_comentarios;
create trigger calendario_comentarios_audita
  after insert or update or delete on public.calendario_comentarios
  for each row execute function public.audita_comentario_calendario();

do $$
begin
  alter publication supabase_realtime add table public.calendario_comentarios;
exception when duplicate_object then null;
end $$;

-- Todo mundo que vê o calendário pode comentar (padrão).
update public.config_app
   set valor = jsonb_set(valor, '{calendario,comentar}', 'true'::jsonb, true)
 where chave = 'permissoes_padrao'
   and not (valor -> 'calendario' ? 'comentar');

-- Conferência
select 'colunas novas' as item,
       (select count(*)::text from information_schema.columns
         where table_name = 'calendario_itens' and column_name in ('descricao','inicio','fim','local','link')) as valor
union all
select 'padrão', (valor -> 'calendario')::text from public.config_app where chave = 'permissoes_padrao';
