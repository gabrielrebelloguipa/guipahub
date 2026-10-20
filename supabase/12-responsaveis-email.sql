-- GuipaHub — responsáveis com nome completo e e-mail
--
-- Rodar UMA VEZ no SQL Editor, depois do 10. Seguro rodar de novo.
--
-- O 10 guardava só o primeiro nome. Agora cada responsável tem nome e
-- e-mail, e a marca guarda o E-MAIL: é o que não muda, não tem grafia
-- ambígua ("Adriano" ou "adriano"?) e é o que o login conhece — então
-- "Minha carteira" acha a pessoa pela conta, e não pelo primeiro nome.

update public.config_app
   set valor = '[
     {"nome": "Adriano Ferri",   "email": "adriano.ferri@guipabrasil.com"},
     {"nome": "Anete Fonseca",   "email": "anete.fonseca@guipabrasil.com"},
     {"nome": "Rafael Napoli",   "email": "rafael@guipabrasil.com"},
     {"nome": "William Freitas", "email": "william.freitas@guipabrasil.com"}
   ]'::jsonb,
       alterado_em = now(),
       alterado_por = 'script 12'
 where chave = 'responsaveis';

-- Marca que tenha ficado com o primeiro nome (formato do 10) passa para
-- o e-mail de quem tem esse primeiro nome na lista nova.
update public.marcas m
   set responsavel = r.email
  from (
    select lower(split_part(x ->> 'nome', ' ', 1)) as primeiro, x ->> 'email' as email
      from public.config_app c, jsonb_array_elements(c.valor) x
     where c.chave = 'responsaveis'
  ) r
 where m.responsavel <> ''
   and position('@' in m.responsavel) = 0
   and lower(m.responsavel) = r.primeiro;

select 'lista' as item, valor::text from public.config_app where chave = 'responsaveis'
union all
select 'marcas com nome solto (deve ser 0)',
       count(*)::text from public.marcas
 where responsavel <> '' and position('@' in responsavel) = 0;
