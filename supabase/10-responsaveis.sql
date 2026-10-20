-- GuipaHub — lista de responsáveis do comercial
--
-- Rodar UMA VEZ no SQL Editor. Seguro rodar de novo.
--
-- O responsável pela conta passa a ser escolhido numa lista fixa, em vez
-- de digitado. A lista mora aqui, e não no código, para entrar ou sair
-- alguém do comercial sem precisar de deploy: edita-se em
-- Configurações › Responsáveis.
--
-- Guarda o NOME, não o e-mail: parte do comercial ainda não entrou no
-- GuipaHub, e a carteira precisa poder ser montada antes disso.

insert into public.config_app (chave, valor) values
  ('responsaveis', '["Adriano", "Anete", "Rafael", "William"]'::jsonb)
on conflict (chave) do nothing;

select chave, valor::text from public.config_app where chave = 'responsaveis';
