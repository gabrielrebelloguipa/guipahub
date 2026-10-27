-- GuipaHub — medidas físicas do baú (passadas pelo Gabriel em 2026-10-27)
--
-- Rodar UMA VEZ no SQL Editor, depois do 20. Seguro rodar de novo.

update public.central_guias
   set specs = '[{"k":"Largura","v":"56 cm"},{"k":"Altura","v":"78 cm"},{"k":"Profundidade","v":"50 cm"},{"k":"Capacidade","v":"150 litros"}]'::jsonb
 where lower(titulo) = lower('Medidas físicas do baú');

select titulo, specs::text as medidas from public.central_guias where lower(titulo) = lower('Medidas físicas do baú');
