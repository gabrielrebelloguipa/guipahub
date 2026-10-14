-- GuipaHub — fecha a leitura da lista de pessoas
--
-- Rodar UMA VEZ no SQL Editor, depois do 02-configuracoes.sql.
-- Seguro rodar de novo.
--
-- O QUE MUDA
--
-- Antes: qualquer pessoa da GUIPA conseguia LER a tabela de perfis — quem
-- existe, quais abas cada um tem, quem é admin. Não dava para ALTERAR nada
-- (isso sempre exigiu admin), mas dava para ver abrindo o console.
--
-- Agora: cada pessoa lê só a própria linha. Admin continua lendo todas,
-- porque a tela de permissões precisa da lista para existir.
--
-- Por que isso não quebra nada: a lista completa de perfis só é usada em
-- Configurações, que só admin abre. O resto do app precisa apenas da
-- própria linha, para saber quais abas mostrar.

drop policy if exists perfis_le on public.perfis;
create policy perfis_le on public.perfis
  for select using (
    id = auth.uid() or public.sou_admin()
  );

-- config_app continua legível por todo mundo da GUIPA, e tem que ser:
-- é de lá que sai `abas_padrao` (a sidebar de cada um) e o id da pasta
-- raiz do Drive. O id de pasta não abre nada sozinho — quem manda no
-- acesso é a permissão do Drive, não esse valor.
--
-- Escrever em config_app segue sendo só de admin (policy config_escreve
-- no 02-configuracoes.sql). Nada a fazer aqui.

-- ---------------------------------------------------------------
-- Conferência: quem é admin hoje
-- ---------------------------------------------------------------
-- Roda junto e mostra o resultado. Tem que aparecer só você.

select email, nome, admin, criado_em
from public.perfis
order by admin desc, email;
