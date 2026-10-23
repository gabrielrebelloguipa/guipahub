-- GuipaHub — telefone no perfil de cada pessoa
--
-- Rodar UMA VEZ no SQL Editor, depois do 12. Seguro rodar de novo.
--
-- O cabeçalho da proposta (Calculadora) mostra quem atende: nome e
-- e-mail vêm da conta Google do login e não se editam; o telefone cada
-- um preenche em Configurações › Meu perfil. Fica no banco, e não no
-- navegador, para valer em qualquer computador que a pessoa usar.
--
-- A política perfis_toca_no_proprio (06) já deixa cada um alterar a
-- própria linha, desde que admin, abas e permissões não mudem — então
-- o telefone não precisa de regra nova.

alter table public.perfis
  add column if not exists telefone text not null default '';

-- Conferência
select 'coluna telefone' as item,
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'perfis' and column_name = 'telefone') as valor;
