-- GuipaHub — aba Calculadora visível no padrão
--
-- Rodar UMA VEZ no SQL Editor. Seguro rodar de novo.
--
-- Área nova não configurada é negada (é a regra do pode()), então sem
-- isto a calculadora apareceria só para admin. Ela não grava nada no
-- banco — a proposta fica no navegador de quem monta —, então liberar
-- para todo mundo não expõe dado nenhum.

update public.config_app
   set valor = jsonb_set(valor, '{calculadora}', '{"ver": true}'::jsonb, true)
 where chave = 'permissoes_padrao'
   and not (valor ? 'calculadora');

update public.config_app
   set valor = valor || '["calculadora"]'::jsonb
 where chave = 'abas_padrao'
   and not (valor ? 'calculadora');

select chave, valor::text from public.config_app
 where chave in ('permissoes_padrao', 'abas_padrao');
