-- GuipaHub — Calendário Comercial (aba nova)
--
-- Rodar UMA VEZ no SQL Editor, depois do 22. Seguro rodar de novo.
--
-- Cada item é uma linha: mês + categoria (as linhas do PPT do comercial)
-- + título. Todo mundo da GUIPA lê; criar, editar e excluir seguem as
-- permissões da área "calendario" — no padrão, só o admin.

create table if not exists public.calendario_itens (
  id            uuid primary key default gen_random_uuid(),
  mes           date not null check (extract(day from mes) = 1),
  categoria     text not null check (categoria in ('foco','sazonal','feira','show','mkt','pr')),
  titulo        text not null check (length(trim(titulo)) > 0),
  ordem         integer not null default 0,
  criado_por    text not null default '',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists calendario_itens_mes on public.calendario_itens (mes);

alter table public.calendario_itens enable row level security;

drop policy if exists calendario_le on public.calendario_itens;
drop policy if exists calendario_cria on public.calendario_itens;
drop policy if exists calendario_edita on public.calendario_itens;
drop policy if exists calendario_exclui on public.calendario_itens;
create policy calendario_le on public.calendario_itens for select
  using (public.eh_da_guipa() and public.pode_ou_admin('calendario', 'ver'));
create policy calendario_cria on public.calendario_itens for insert
  with check (public.pode_ou_admin('calendario', 'criar'));
create policy calendario_edita on public.calendario_itens for update
  using (public.pode_ou_admin('calendario', 'editar'))
  with check (public.pode_ou_admin('calendario', 'editar'));
create policy calendario_exclui on public.calendario_itens for delete
  using (public.pode_ou_admin('calendario', 'excluir'));

-- Autor carimbado na criação e imutável depois (mesma regra do 19).
drop trigger if exists calendario_carimba on public.calendario_itens;
create trigger calendario_carimba
  before insert on public.calendario_itens
  for each row execute function public.carimba_criador();
drop trigger if exists calendario_itens_trava_autor on public.calendario_itens;
create trigger calendario_itens_trava_autor
  before update on public.calendario_itens
  for each row execute function public.trava_criado_por();

do $$
begin
  alter publication supabase_realtime add table public.calendario_itens;
exception when duplicate_object then null;
end $$;

-- Padrão: todo mundo vê, ninguém mexe (o admin passa por cima).
update public.config_app
   set valor = jsonb_set(valor, '{calendario}',
                         '{"ver": true, "criar": false, "editar": false, "excluir": false}'::jsonb, true)
 where chave = 'permissoes_padrao'
   and not (valor ? 'calendario');

update public.config_app
   set valor = valor || '["calendario"]'::jsonb
 where chave = 'abas_padrao'
   and not (valor ? 'calendario');

-- Conteúdo do PPT "Calendário Comercial Guipa 26-27" (jul/26 a ago/27).
-- Só entra com a tabela vazia, para rodar de novo não duplicar.
insert into public.calendario_itens (mes, categoria, titulo, ordem)
select v.mes::date, v.categoria, v.titulo, v.ordem
  from (values
  ('2026-07-01', 'foco', 'Copa', 0),
  ('2026-07-01', 'foco', 'Volta às aulas', 1),
  ('2026-08-01', 'foco', 'Festival Interlagos Motos', 0),
  ('2026-08-01', 'foco', 'FEBRABAN Tech', 1),
  ('2026-09-01', 'foco', 'Rock in Rio + iFood Move + Beauty Fair + CONAREC', 0),
  ('2026-10-01', 'foco', 'Superminas BH', 0),
  ('2026-11-01', 'foco', 'F1 Interlagos', 0),
  ('2026-11-01', 'foco', 'Black Friday', 1),
  ('2026-12-01', 'foco', 'Campanha de Natal', 0),
  ('2026-12-01', 'foco', 'Reveillon', 1),
  ('2026-07-01', 'sazonal', 'Copa do Mundo', 0),
  ('2026-08-01', 'sazonal', 'Dia dos Pais', 0),
  ('2026-09-01', 'sazonal', 'Setembro Amarelo', 0),
  ('2026-09-01', 'sazonal', 'Semana Nac. do Trânsito', 1),
  ('2026-09-01', 'sazonal', 'Dia do Sorvete', 2),
  ('2026-10-01', 'sazonal', 'Outubro Rosa', 0),
  ('2026-10-01', 'sazonal', 'Dia das Crianças', 1),
  ('2026-10-01', 'sazonal', 'Halloween', 2),
  ('2026-11-01', 'sazonal', 'Novembro Azul', 0),
  ('2026-11-01', 'sazonal', 'Proclamação', 1),
  ('2026-11-01', 'sazonal', 'Consciência Negra', 2),
  ('2026-12-01', 'sazonal', 'Natal', 0),
  ('2026-12-01', 'sazonal', 'Reveillon', 1),
  ('2026-07-01', 'feira', 'FIPAN', 0),
  ('2026-07-01', 'feira', 'Fórum E-Commerce', 1),
  ('2026-07-01', 'feira', 'SuperBahia', 2),
  ('2026-08-01', 'feira', 'Brazil Promotion', 0),
  ('2026-08-01', 'feira', 'Pet South America', 1),
  ('2026-08-01', 'feira', 'Festival Interlagos', 2),
  ('2026-09-01', 'feira', 'iFood Move', 0),
  ('2026-09-01', 'feira', 'Beauty Fair', 1),
  ('2026-09-01', 'feira', 'CONAREC', 2),
  ('2026-09-01', 'feira', 'Maximidia', 3),
  ('2026-10-01', 'feira', 'Superminas Food Show', 0),
  ('2026-10-01', 'feira', 'Supervendas Sergipe', 1),
  ('2026-11-01', 'feira', 'FENATRAN', 0),
  ('2026-11-01', 'feira', 'Super Mix', 1),
  ('2026-07-01', 'show', 'Copa do Mundo', 0),
  ('2026-07-01', 'show', 'Brasileirão', 1),
  ('2026-07-01', 'show', 'Libertadores', 2),
  ('2026-08-01', 'show', 'Sorry Experience', 0),
  ('2026-08-01', 'show', 'Brasileirão', 1),
  ('2026-09-01', 'show', 'Rock in Rio', 0),
  ('2026-09-01', 'show', 'NFL São Paulo', 1),
  ('2026-09-01', 'show', 'Brasileirão', 2),
  ('2026-10-01', 'show', 'BTS', 0),
  ('2026-10-01', 'show', 'Brasileirão', 1),
  ('2026-11-01', 'show', 'F1 GP São Paulo', 0),
  ('2026-11-01', 'show', 'Finais Brasileirão', 1),
  ('2026-12-01', 'show', 'Reveillon RJ', 0),
  ('2026-08-01', 'mkt', 'Foco Rock in Rio/Black Friday', 0),
  ('2026-08-01', 'mkt', 'F1/ Natal', 1),
  ('2026-09-01', 'mkt', 'Foco Rock in Rio/Black Friday', 0),
  ('2026-09-01', 'mkt', 'F1/ Natal', 1),
  ('2026-09-01', 'mkt', 'JBP 2027: 50 principais clientes', 2),
  ('2026-10-01', 'mkt', 'JBP 2027: 20 principais clientes', 0),
  ('2026-11-01', 'mkt', 'Plano Verão', 0),
  ('2026-11-01', 'mkt', 'Guipa no black Friday /Segunda quinzena Natal', 1),
  ('2026-12-01', 'mkt', 'Plano Verão', 0),
  ('2026-08-01', 'pr', 'Awareness e divulgação Baú', 0),
  ('2026-08-01', 'pr', 'Divulgação mídia OOH móvel', 1),
  ('2026-08-01', 'pr', 'Ação da Disney Commebal 21 a 25 de agosto SP', 2),
  ('2026-08-01', 'pr', 'Ação famosa agrícola SP Guerilha 29/08', 3),
  ('2026-09-01', 'pr', 'Awareness e divulgação Baú', 0),
  ('2026-09-01', 'pr', 'Divulgação mídia OOH móvel', 1),
  ('2026-09-01', 'pr', 'Divulgação da Campanha NFL', 2),
  ('2026-09-01', 'pr', 'Blitz Vick Cidade do RJ 6 Dias - 04 a 07/08 sampling', 3),
  ('2026-09-01', 'pr', 'Lavolho colírio : 4 Semanas - 31/08 a 27/09 RJ', 4),
  ('2026-10-01', 'pr', 'Divulgação do Maximidia', 0),
  ('2026-10-01', 'pr', 'Divulgação Tecnologia e dados', 1),
  ('2026-10-01', 'pr', 'Video divulgação NFL', 2),
  ('2026-10-01', 'pr', 'Ação Guerilha Maturatta Super Minas BH 27 a 29/10', 3),
  ('2026-10-01', 'pr', 'Ação Plano e Plano guerrilha e circuito', 4),
  ('2026-11-01', 'pr', 'Divulgação Black Friday', 0),
  ('2026-11-01', 'pr', 'Divulgação Ação clientes', 1),
  ('2026-11-01', 'pr', 'Ação Cruzeiro do Sul Circuito 2 a 15/11', 2),
  ('2026-12-01', 'pr', 'Divulgação Sazonais', 0),
  ('2027-01-01', 'foco', 'Projeto Verão', 0),
  ('2027-01-01', 'foco', 'Volta as aulas', 1),
  ('2027-01-01', 'foco', 'Telecom', 2),
  ('2027-02-01', 'foco', 'Carnaval', 0),
  ('2027-03-01', 'foco', 'Páscoa', 0),
  ('2027-03-01', 'foco', 'Super Rio', 1),
  ('2027-03-01', 'foco', 'Expofood', 2),
  ('2027-03-01', 'foco', 'Farma (pico ANS)', 3),
  ('2027-04-01', 'foco', 'QSR/Delivery em platô Smart Market ABRAS', 0),
  ('2027-05-01', 'foco', 'APAS Show', 0),
  ('2027-05-01', 'foco', 'Dia das Mães', 1),
  ('2027-05-01', 'foco', 'Plano Inverno', 2),
  ('2027-06-01', 'foco', 'Educação · Namorados', 0),
  ('2027-06-01', 'foco', 'Juninas', 1),
  ('2027-06-01', 'foco', 'Plano Inverno', 2),
  ('2027-07-01', 'foco', 'Educação = 2º pico', 0),
  ('2027-07-01', 'foco', 'Plano Inverno', 1),
  ('2027-08-01', 'foco', 'Dia dos Pais', 0),
  ('2027-01-01', 'sazonal', 'Ano Novo / Réveillon', 0),
  ('2027-01-01', 'sazonal', 'Matrícula 1º sem', 1),
  ('2027-02-01', 'sazonal', 'Carnaval', 0),
  ('2027-04-01', 'sazonal', 'Páscoa', 0),
  ('2027-04-01', 'sazonal', 'Semana Nac. do Trânsito', 1),
  ('2027-05-01', 'sazonal', 'Dia das Mães', 0),
  ('2027-06-01', 'sazonal', 'Dia dos Namorados', 0),
  ('2027-06-01', 'sazonal', 'Festas Juninas', 1),
  ('2027-07-01', 'sazonal', 'Férias de inverno', 0),
  ('2027-08-01', 'sazonal', 'Dia dos Pais', 0),
  ('2027-02-01', 'feira', 'Convenção Brasileira de OOH', 0),
  ('2027-03-01', 'feira', 'SRE Super Rio Expofood', 0),
  ('2027-04-01', 'feira', 'Smart Market ABRAS', 0),
  ('2027-05-01', 'feira', 'APAS SHOW 2027', 0),
  ('2027-06-01', 'feira', 'ExpoSuper ACATS', 0),
  ('2027-06-01', 'feira', 'Convenção ABAD', 1),
  ('2027-08-01', 'feira', 'ExpoAgas 50ª', 0),
  ('2027-08-01', 'feira', 'SuperBahia 2027', 1),
  ('2027-02-01', 'show', 'Carnaval · blocos SP + RJ', 0),
  ('2027-03-01', 'show', 'Lollapalooza', 0),
  ('2027-03-01', 'show', 'Stock Car 2027', 1),
  ('2027-04-01', 'show', 'The Weekend + Anitta', 0),
  ('2027-05-01', 'show', 'MegaShow Copacabana', 0),
  ('2027-06-01', 'show', 'Copa Futebol Feminina', 0),
  ('2027-01-01', 'mkt', 'Plano Verão Litoral', 0),
  ('2027-02-01', 'mkt', 'Volta as aulas', 0),
  ('2027-03-01', 'mkt', 'Páscoa', 0),
  ('2027-04-01', 'mkt', 'Plano Inverno', 0),
  ('2027-06-01', 'mkt', 'Plano Inverno', 0),
  ('2027-06-01', 'mkt', 'Copa', 1),
  ('2027-07-01', 'mkt', 'Plano Inverno', 0),
  ('2027-07-01', 'mkt', 'Copa', 1),
  ('2027-07-01', 'mkt', 'Volta as aulas', 2),
  ('2027-02-01', 'mkt', 'Brasileirão 2027', 1)
  ) as v(mes, categoria, titulo, ordem)
 where not exists (select 1 from public.calendario_itens);

-- Conferência
select 'itens' as item, count(*)::text as valor from public.calendario_itens
union all
select 'padrão', (valor -> 'calendario')::text from public.config_app where chave = 'permissoes_padrao';
