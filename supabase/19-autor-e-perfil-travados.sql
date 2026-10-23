-- GuipaHub — "criado por" nunca muda, perfil não se edita, autor carimbado
--
-- Rodar UMA VEZ no SQL Editor, depois do 18. Seguro rodar de novo.
--
-- O app fala com o banco direto do navegador, com o login da pessoa. O
-- que limita cada um são as regras do banco (RLS) — não a tela. Então
-- tudo que a tela não deixa fazer, o banco também tem que recusar, senão
-- dá para fazer pelo console do navegador com o próprio login.
--
-- 1. criado_por não muda numa edição, em nenhuma tabela (marcas,
--    Central, biblioteca, quadros; cartões já era o 18). Quem criou
--    aparece e ponto.
-- 2. Biblioteca do time: o autor é quem publicou, carimbado pelo banco.
-- 3. Prompt próprio: o autor é sempre quem está logado. Enviar para um
--    colega passa a ser uma função do banco que copia um prompt SEU,
--    mantendo o autor original — ninguém insere prompt na conta de
--    outro com autor inventado.
-- 4. Perfil: nome e e-mail vêm do login Google e ninguém muda — nem a
--    própria pessoa, nem admin. A pessoa só mexe no telefone.

-- ---------------------------------------------------------------
-- 1. criado_por imutável
-- ---------------------------------------------------------------

create or replace function public.trava_criado_por()
returns trigger
language plpgsql
as $$
begin
  new.criado_por := old.criado_por;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['marcas', 'central_materiais', 'central_guias',
                           'central_imagens', 'biblioteca_prompts', 'quadros'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_trava_autor', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.trava_criado_por()',
                   t || '_trava_autor', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 2. Biblioteca: autor = quem publicou
-- ---------------------------------------------------------------

drop trigger if exists biblioteca_carimba on public.biblioteca_prompts;
create trigger biblioteca_carimba
  before insert on public.biblioteca_prompts
  for each row execute function public.carimba_criador();

-- ---------------------------------------------------------------
-- 3. Prompts próprios e envio
-- ---------------------------------------------------------------

create or replace function public.carimba_prompt()
returns trigger
language plpgsql
as $$
declare
  eu text := lower(public.email_da_sessao());
begin
  if tg_op = 'INSERT' then
    new.dono := lower(new.dono);
    if new.dono = eu or eu = '' then
      -- prompt próprio: autor é quem está logado, sempre
      if eu <> '' then new.criado_por := eu; end if;
      new.enviado_por := '';
    else
      -- só chega aqui pela função enviar_prompt (a política barra o resto)
      new.enviado_por := eu;
    end if;
  else
    new.dono          := old.dono;
    new.criado_por    := old.criado_por;
    new.enviado_por   := old.enviado_por;
    new.criado_em     := old.criado_em;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

-- Inserir pela API: só na própria conta.
drop policy if exists prompts_cria on public.prompts;
create policy prompts_cria on public.prompts for insert
  with check (lower(dono) = lower(public.email_da_sessao()));

-- Enviar: copia um prompt que é SEU para um colega que já entrou no
-- GuipaHub. security definer para poder gravar na conta do outro; a
-- conferência de dono e destinatário está aqui dentro.
create or replace function public.enviar_prompt(p_prompt uuid, p_para text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  eu text := lower(public.email_da_sessao());
  orig public.prompts;
  novo uuid;
begin
  if not public.eh_da_guipa() then raise exception 'sem acesso'; end if;
  select * into orig from public.prompts where id = p_prompt and lower(dono) = eu;
  if not found then raise exception 'Só dá para enviar um prompt seu.'; end if;
  if not exists (select 1 from public.perfis where lower(email) = lower(p_para)) then
    raise exception 'Essa pessoa ainda não entrou no GuipaHub.';
  end if;
  if lower(p_para) = eu then raise exception 'Esse prompt já é seu.'; end if;

  insert into public.prompts
    (dono, titulo, texto, tags, categoria, ferramenta, modelo, favorito,
     criado_por, da_biblioteca)
  values
    (lower(p_para), orig.titulo, orig.texto, orig.tags, orig.categoria,
     orig.ferramenta, orig.modelo, false, orig.criado_por, orig.da_biblioteca)
  returning id into novo;
  return novo;
end;
$$;

grant execute on function public.enviar_prompt(uuid, text) to authenticated;

-- ---------------------------------------------------------------
-- 4. Perfil: nome e e-mail travados
-- ---------------------------------------------------------------

create or replace function public.trava_perfil()
returns trigger
language plpgsql
as $$
begin
  new.id        := old.id;
  new.email     := old.email;
  new.nome      := old.nome;
  new.criado_em := old.criado_em;
  return new;
end;
$$;

drop trigger if exists perfis_trava on public.perfis;
create trigger perfis_trava
  before update on public.perfis
  for each row execute function public.trava_perfil();

-- Conferência
select 'gatilhos de autor' as item,
       (select count(*)::text from pg_trigger where tgname like '%\_trava\_autor') as valor
union all
select 'biblioteca carimba', (select count(*)::text from pg_trigger where tgname = 'biblioteca_carimba')
union all
select 'perfil travado', (select count(*)::text from pg_trigger where tgname = 'perfis_trava')
union all
select 'funcao enviar', (select count(*)::text from pg_proc where proname = 'enviar_prompt');
