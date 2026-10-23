-- GuipaHub — guias com lista de medidas, e material com arquivo
--
-- Rodar UMA VEZ no SQL Editor, depois do 14. Seguro rodar de novo.
--
-- 1. Guia vira um card com várias medidas (como no Guipa Manager):
--    specs = [{"k": "Largura", "v": "1088 px"}, ...]. Medida com valor
--    vazio aparece como "a confirmar".
-- 2. Material pode ter um arquivo no bucket "central" (PDF, projeto…),
--    além do link.
-- 3. Cadastra as guias da GUIPA que estavam no protótipo, com as medidas
--    passadas pelo Gabriel em 2026-10-23. Só insere o que ainda não
--    existe pelo título.

alter table public.central_guias
  add column if not exists specs jsonb not null default '[]'::jsonb;

alter table public.central_materiais
  add column if not exists caminho      text not null default '',
  add column if not exists arquivo_nome text not null default '',
  add column if not exists bytes        bigint not null default 0;

insert into public.central_guias (grupo, titulo, specs, notas, criado_por)
select v.grupo, v.titulo, v.specs::jsonb, v.notas, 'sistema'
  from (values
    ('Medidas e arquivos', 'Tela LED do baú',
     '[{"k":"Largura","v":"1088 px"},{"k":"Altura","v":"1632 px"}]', ''),
    ('Medidas e arquivos', 'Medidas da moto',
     '[{"k":"Comprimento","v":"2 m"},{"k":"Largura","v":"1 m"},{"k":"Peso","v":"130 kg"}]', ''),
    ('Medidas e arquivos', 'Medidas físicas do baú',
     '[{"k":"Largura","v":""},{"k":"Altura","v":""},{"k":"Profundidade","v":""}]', ''),
    ('Medidas e arquivos', 'Arquivo do Photoshop',
     '[{"k":"Tamanho","v":"1088 × 1632 px"},{"k":"Proporção","v":"2:3"},{"k":"Resolução (dpi)","v":""},{"k":"Modo de cor","v":"RGB (a tela é emissiva, não impressa)"}]',
     'Monte o documento na proporção exata da face para não distorcer na exportação.'),
    ('Boas práticas', 'Como a mídia é exibida',
     '[{"k":"Modalidade 1:1","v":"criativo 1×/minuto, 10h/dia = 600 inserções por face/dia"},{"k":"Modalidade 1:2","v":"1 a cada 2 minutos = metade das inserções"}]',
     'A moto está em movimento no fluxo urbano e o público vê a peça por poucos segundos, de longe e de lado: pouco texto, contraste alto, marca grande e legível.')
  ) as v(grupo, titulo, specs, notas)
 where not exists (
   select 1 from public.central_guias g where lower(g.titulo) = lower(v.titulo)
 );

-- Conferência
select 'colunas novas' as item,
       (select count(*)::text from information_schema.columns
         where table_schema = 'public'
           and ((table_name = 'central_guias' and column_name = 'specs')
             or (table_name = 'central_materiais' and column_name in ('caminho','arquivo_nome','bytes')))) as valor
union all
select 'guias', (select string_agg(titulo, ' · ' order by grupo, titulo) from public.central_guias);
