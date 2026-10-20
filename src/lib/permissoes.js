/* Perfis, permissões de aba e configuração global.

   ⚠ O QUE ISTO É E O QUE NÃO É.

   Esconder uma aba organiza a tela. NÃO protege dado: quem souber abrir o
   console do navegador continua alcançando o que a aba mostraria. A
   proteção de verdade está em dois lugares — o Drive, que só devolve o
   que a pessoa já pode ver, e as políticas de RLS do banco.

   O que É protegido aqui: só admin escreve em perfil alheio e em
   config_app. Isso vale porque está no banco, não na tela — a política
   confere `sou_admin()` no Postgres. Alguém que force a interface a
   mostrar a aba Configurações não consegue gravar nada. */

import { useSyncExternalStore } from "react";
import { supabase, temSupabase, explicarErro } from "./supabase.js";

/* A lista canônica de abas. A sidebar e a tela de permissões leem daqui,
   então acrescentar aba nova é mexer num lugar só. */
export const ABAS = [
  { key: "hoje", label: "Hoje", ico: "◉" },
  { key: "demandas", label: "Kanban", ico: "≡" },
  { key: "central", label: "Central Guipa", ico: "◆" },
  { key: "marcas", label: "Marcas", ico: "◑" },
  /* A chave continua "clientes" de proposito: ela esta gravada nas
     permissoes de cada pessoa no banco. Trocar a chave apagaria a
     permissao de quem ja a tinha. So o rotulo mudou. */
  { key: "clientes", label: "Imagens", ico: "▧" },
  { key: "prompts", label: "Prompts", ico: "✦" },
  { key: "calculadora", label: "Calculadora", ico: "＄" },
];

export const TODAS_AS_CHAVES = ABAS.map((a) => a.key);

/* ---------- permissões por ação ---------- */

/* O catálogo precisa casar com o 06-permissoes.sql: a tela esconde a
   partir daqui, o banco recusa a partir de lá. Divergir faz aparecer
   botão que sempre dá erro, ou sumir botão que funcionaria. */
export const AREAS = [
  { key: "hoje", label: "Hoje", acoes: ["ver"] },
  {
    key: "demandas",
    label: "Kanban",
    acoes: ["ver", "criar", "editar", "mover", "comentar", "excluir", "colunas"],
  },
  { key: "central", label: "Central Guipa", acoes: ["ver", "criar", "editar", "excluir"] },
  { key: "marcas", label: "Marcas", acoes: ["ver", "criar", "editar", "excluir"] },
  { key: "clientes", label: "Imagens", acoes: ["ver", "baixar"] },
  { key: "prompts", label: "Prompts", acoes: ["ver", "publicar", "editar", "excluir"] },
  /* Só "ver": a calculadora não grava nada no banco. A proposta fica no
     navegador de quem monta, e exportar é baixar um arquivo. */
  { key: "calculadora", label: "Calculadora", acoes: ["ver"] },
];

export const ROTULO_ACAO = {
  ver: "Ver a aba",
  criar: "Criar",
  editar: "Editar",
  mover: "Mover",
  excluir: "Excluir",
  colunas: "Criar e excluir colunas",
  comentar: "Comentar",
  baixar: "Baixar e copiar",
  publicar: "Publicar na biblioteca",
};

/* Para o banco, mover e editar um cartão são o mesmo UPDATE — ele não
   sabe que trocar de coluna é "mover". A separação existe só na tela, e
   isto está escrito aqui para ninguém prometer na interface uma divisão
   que o banco não sustenta. */
export const ACOES_SEM_TRANCA = { demandas: ["mover"] };

/* Mesmo conjunto que o 04-pendentes.sql grava no banco. O valor do
   banco manda; este aqui so aparece no piscar antes da resposta, e
   discordar dele faria a sidebar trocar de tamanho na frente da
   pessoa. Marcas e Prompts ficam de fora ate estarem prontas. */
const ABAS_PADRAO_INICIAL = ["hoje", "demandas", "central", "clientes", "calculadora"];

const PERMISSOES_PADRAO_INICIAL = {
  hoje: { ver: true },
  demandas: { ver: true, criar: true, editar: true, mover: true, comentar: true, excluir: false, colunas: false },
  central: { ver: true, criar: false, editar: false, excluir: false },
  marcas: { ver: false, criar: false, editar: false, excluir: false },
  clientes: { ver: true, baixar: true },
  prompts: { ver: false, publicar: false, editar: false, excluir: false },
  calculadora: { ver: true },
};

const vazio = () => ({
  perfis: [],
  eu: null,
  abasPadrao: ABAS_PADRAO_INICIAL,
  permissoesPadrao: PERMISSOES_PADRAO_INICIAL,
  /* Quem do comercial pode ser responsável por uma conta. Lista do
     banco (10-responsaveis.sql), editável em Configurações. */
  responsaveis: [],
  drive: { raizId: "", raizNome: "" },
  carregando: temSupabase(),
  erro: "",
});

let estado = vazio();
const ouvintes = new Set();

export function subscrever(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
export function pegar() {
  return estado;
}
function definir(patch) {
  estado = { ...estado, ...patch };
  ouvintes.forEach((fn) => fn());
}
export function usePermissoes() {
  return useSyncExternalStore(subscrever, pegar, pegar);
}

export function souAdmin() {
  return !!estado.eu?.admin;
}

/* A resposta para "fulano pode X em Y?".

   Ordem: exceção da pessoa > padrão global > false. O false no fim é de
   propósito — ação que ninguém configurou é negada. Um sistema de
   permissão que erra para o lado do "sim" não é sistema de permissão.

   Admin passa por cima: sem isso, um admin que se recortasse sem querer
   não teria como desfazer. Mesma regra do `pode_ou_admin` no banco. */
export function podeNoPerfil(perfil, padrao, area, acao) {
  if (perfil?.admin) return true;
  const minha = perfil?.permissoes?.[area]?.[acao];
  if (typeof minha === "boolean") return minha;
  const geral = padrao?.[area]?.[acao];
  return typeof geral === "boolean" ? geral : false;
}

/* O mesmo, para quem está logado agora. É isto que os componentes
   chamam. */
export function pode(area, acao) {
  return podeNoPerfil(estado.eu, estado.permissoesPadrao, area, acao);
}

/* Gancho para a tela redesenhar quando a permissão mudar em tempo real
   — admin tirando um direito tem que sumir o botão sem recarregar. */
export function usePode() {
  const { eu, permissoesPadrao } = usePermissoes();
  return (area, acao) => podeNoPerfil(eu, permissoesPadrao, area, acao);
}

/* As abas visíveis deixam de ser uma lista própria: aba visível é aba
   em que a pessoa pode "ver". Duas fontes para a mesma pergunta davam
   respostas diferentes — a sidebar mostrava Marcas e a tela recusava.

   `abas` (a coluna antiga) ainda é respeitada para quem nunca foi
   migrado, senão ligar o sistema novo zeraria o ajuste já feito. */
export function abasDe(perfil, abasPadrao, permissoesPadrao) {
  if (perfil?.permissoes || permissoesPadrao) {
    return TODAS_AS_CHAVES.filter((k) =>
      podeNoPerfil(perfil, permissoesPadrao, k, "ver")
    );
  }
  const lista = perfil?.abas ?? abasPadrao ?? TODAS_AS_CHAVES;
  return TODAS_AS_CHAVES.filter((k) => lista.includes(k));
}

export function minhasAbas() {
  const l = abasDe(estado.eu, estado.abasPadrao);
  /* Admin nunca fica sem Configurações, mesmo que se exclua sem querer de
     todas as abas — senão não haveria como desfazer. */
  return l;
}

export async function carregar(meuEmail) {
  if (!temSupabase()) {
    definir({ carregando: false });
    return;
  }
  definir({ carregando: true, erro: "" });
  try {
    const [rp, rc] = await Promise.all([
      supabase.from("perfis").select("*").order("email"),
      supabase.from("config_app").select("*"),
    ]);
    if (rp.error) throw rp.error;
    if (rc.error) throw rc.error;

    const perfis = rp.data || [];
    const porChave = Object.fromEntries((rc.data || []).map((r) => [r.chave, r.valor]));

    definir({
      perfis,
      eu: perfis.find((p) => p.email?.toLowerCase() === String(meuEmail).toLowerCase()) || null,
      abasPadrao: porChave.abas_padrao || ABAS_PADRAO_INICIAL,
      permissoesPadrao: porChave.permissoes_padrao || PERMISSOES_PADRAO_INICIAL,
      responsaveis: Array.isArray(porChave.responsaveis) ? porChave.responsaveis : [],
      drive: { ...vazio().drive, ...(porChave.drive || {}) },
      carregando: false,
      erro: "",
    });
  } catch (e) {
    definir({ carregando: false, erro: explicarErro(e) });
  }
}

let canal = null;
export function ouvir(meuEmail) {
  if (!supabase || canal) return;
  canal = supabase
    .channel("guipahub-permissoes")
    .on("postgres_changes", { event: "*", schema: "public", table: "perfis" }, () =>
      carregar(meuEmail)
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "config_app" }, () =>
      carregar(meuEmail)
    )
    .subscribe();
}

/* ---------- escritas (só passam se o banco disser que é admin) ---------- */

export async function salvarAbasDe(perfilId, abas) {
  const { error } = await supabase
    .from("perfis")
    .update({ abas })
    .eq("id", perfilId);
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregar(estado.eu?.email);
  return { ok: true };
}

export async function salvarPermissoesDe(perfilId, permissoes) {
  const { error } = await supabase
    .from("perfis")
    .update({ permissoes })
    .eq("id", perfilId);
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregar(estado.eu?.email);
  return { ok: true };
}

export function salvarResponsaveis(lista, quem) {
  /* Ordem alfabética e sem repetido: a lista aparece num seletor, e
     "Rafael" duas vezes seria a mesma pessoa em duas carteiras. */
  const limpa = [...new Set(lista.map((n) => String(n || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return gravarConfig("responsaveis", limpa, quem);
}

export function salvarPermissoesPadrao(permissoes, quem) {
  return gravarConfig("permissoes_padrao", permissoes, quem);
}

export async function definirAdmin(perfilId, admin) {
  const { error } = await supabase.from("perfis").update({ admin }).eq("id", perfilId);
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregar(estado.eu?.email);
  return { ok: true };
}

async function gravarConfig(chave, valor, quem) {
  const { error } = await supabase
    .from("config_app")
    .update({ valor, alterado_em: new Date().toISOString(), alterado_por: quem || "" })
    .eq("chave", chave);
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregar(estado.eu?.email);
  return { ok: true };
}

export function salvarAbasPadrao(abas, quem) {
  return gravarConfig("abas_padrao", abas, quem);
}

export function salvarDrive(drive, quem) {
  return gravarConfig("drive", drive, quem);
}
