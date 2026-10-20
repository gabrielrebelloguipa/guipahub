-- GuipaHub — comentário editável, com auditoria só para admin
--
-- Rodar UMA VEZ no SQL Editor, depois do 07. Seguro rodar de novo.
--
-- Até o 07 o comentário era imutável. Agora:
--   · quem escreveu pode editar e excluir o próprio comentário;
--   · admin pode excluir qualquer um (moderação), mas não editar o texto
--     de outra pessoa — reescrever a fala de alguém é pior que apagá-la;
--   · TODA versão vai para auditoria_comentarios: o texto antes e depois
--     de cada edição, e o texto do que foi excluído. Só admin lê.
--
-- A auditoria é escrita por gatilho, não pelo app. Se fosse o app,
-- bastaria editar pelo console para a versão antiga sumir sem rastro.

-- ---------------------------------------------------------------
-- 1. Marca de "editado" no comentário
-- ---------------------------------------------------------------

alter table public.cartoes_eventos
  add column if not exists editado_em timestamptz;

-- ---------------------------------------------------------------
-- 2. A auditoria
-- ---------------------------------------------------------------
--
-- Sem chave estrangeira para o comentário de propósito: o registro tem
-- que sobreviver à exclusão do comentário, do cartão e do quadro. É
-- exatamente o caso que ele existe para cobrir.

create table if not exists public.auditoria_comentarios (
  id               uuid primary key default gen_random_uuid(),
  comentario_id    uuid,
  quadro_id        uuid,
  marca_nome       text not null default '',
  cartao_id        uuid,
  cartao_titulo    text not null default '',
  acao             text not null check (acao in ('criou', 'editou', 'excluiu')),
  autor_comentario text not null default '',  -- quem escreveu
  feito_por        text not null default '',  -- quem fez esta ação
  feito_por_nome   text not null default '',
  texto_antes      text not null default '',
  texto_depois     text not null default '',
  em               timestamptz not null default now()
);

create index if not exists auditoria_comentarios_em
  on public.auditoria_comentarios (em desc);

alter table public.auditoria_comentarios enable row level security;

-- Só admin lê. Ninguém escreve, edita ou apaga pela API — nem admin:
-- uma auditoria que o próprio admin pode reescrever não audita nada.
-- Quem escreve é o gatilho abaixo, com security definer.
drop policy if exists auditoria_le on public.auditoria_comentarios;
create policy auditoria_le on public.auditoria_comentarios
  for select using (public.sou_admin());

-- ---------------------------------------------------------------
-- 3. Editar mexe só no texto
-- ---------------------------------------------------------------
--
-- A política de UPDATE abaixo deixa o autor alterar a linha do próprio
-- comentário — e uma política não sabe dizer "só a coluna texto". Este
-- gatilho garante isso: qualquer outra coluna volta ao que era. Sem ele,
-- dava para trocar o autor de um comentário e atribuí-lo a outra pessoa.

create or replace function public.trava_comentario()
returns trigger
language plpgsql
as $$
begin
  if old.tipo = 'comentou' then
    new.id            := old.id;
    new.quadro_id     := old.quadro_id;
    new.cartao_id     := old.cartao_id;
    new.cartao_titulo := old.cartao_titulo;
    new.tipo          := old.tipo;
    new.de_lista      := old.de_lista;
    new.para_lista    := old.para_lista;
    new.autor         := old.autor;
    new.autor_nome    := old.autor_nome;
    new.criado_em     := old.criado_em;
    if new.texto is distinct from old.texto then
      new.editado_em := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cartoes_eventos_trava on public.cartoes_eventos;
create trigger cartoes_eventos_trava
  before update on public.cartoes_eventos
  for each row execute function public.trava_comentario();

-- ---------------------------------------------------------------
-- 4. Cada versão vai para a auditoria
-- ---------------------------------------------------------------

create or replace function public.audita_comentario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linha public.cartoes_eventos;
  marca text;
begin
  -- NEW não existe num DELETE e OLD não existe num INSERT: escolhe
  -- explicitamente em vez de confiar em coalesce de registro.
  if tg_op = 'DELETE' then
    linha := old;
  else
    linha := new;
  end if;
  -- gatilho AFTER: o valor devolvido é ignorado, então null basta
  if linha.tipo <> 'comentou' then
    return null;
  end if;
  -- editar sem mudar o texto não é versão nova
  if tg_op = 'UPDATE' and new.texto is not distinct from old.texto then
    return null;
  end if;

  select m.nome into marca
    from public.quadros q join public.marcas m on m.id = q.marca_id
   where q.id = linha.quadro_id;

  insert into public.auditoria_comentarios
    (comentario_id, quadro_id, marca_nome, cartao_id, cartao_titulo, acao,
     autor_comentario, feito_por, feito_por_nome, texto_antes, texto_depois)
  values
    (linha.id, linha.quadro_id, coalesce(marca, ''), linha.cartao_id, linha.cartao_titulo,
     case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'editou' else 'excluiu' end,
     linha.autor, public.email_da_sessao(), public.nome_da_sessao(),
     case when tg_op = 'INSERT' then '' else old.texto end,
     case when tg_op = 'DELETE' then '' else new.texto end);

  return null;
end;
$$;

drop trigger if exists cartoes_eventos_audita on public.cartoes_eventos;
create trigger cartoes_eventos_audita
  after insert or update or delete on public.cartoes_eventos
  for each row execute function public.audita_comentario();

-- ---------------------------------------------------------------
-- 5. Quem pode editar e excluir
-- ---------------------------------------------------------------
--
-- Só comentário. Os outros eventos (criou, moveu, editou, excluiu)
-- continuam imutáveis: são o registro do que aconteceu com o cartão.

drop policy if exists eventos_edita_comentario on public.cartoes_eventos;
create policy eventos_edita_comentario on public.cartoes_eventos
  for update
  using (tipo = 'comentou' and autor = public.email_da_sessao())
  with check (tipo = 'comentou' and autor = public.email_da_sessao());

drop policy if exists eventos_exclui_comentario on public.cartoes_eventos;
create policy eventos_exclui_comentario on public.cartoes_eventos
  for delete
  using (tipo = 'comentou' and (autor = public.email_da_sessao() or public.sou_admin()));

-- ---------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------

select 'auditoria existe' as item,
       (select count(*)::text from information_schema.tables
         where table_schema = 'public' and table_name = 'auditoria_comentarios') as valor
union all
select 'gatilhos de comentario',
       (select count(*)::text from pg_trigger
         where tgname in ('cartoes_eventos_trava', 'cartoes_eventos_audita'))
union all
select 'politicas de comentario',
       (select count(*)::text from pg_policies
         where tablename = 'cartoes_eventos'
           and policyname in ('eventos_edita_comentario', 'eventos_exclui_comentario'))
union all
select 'leitura da auditoria',
       (select string_agg(policyname, ', ') from pg_policies
         where tablename = 'auditoria_comentarios');
