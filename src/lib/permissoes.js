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
];

export const TODAS_AS_CHAVES = ABAS.map((a) => a.key);

/* Mesmo conjunto que o 04-pendentes.sql grava no banco. O valor do
   banco manda; este aqui so aparece no piscar antes da resposta, e
   discordar dele faria a sidebar trocar de tamanho na frente da
   pessoa. Marcas e Prompts ficam de fora ate estarem prontas. */
const ABAS_PADRAO_INICIAL = ["hoje", "demandas", "central", "clientes"];

const vazio = () => ({
  perfis: [],
  eu: null,
  abasPadrao: ABAS_PADRAO_INICIAL,
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

/* As abas de quem está logado. `abas` null quer dizer "nunca foi
   personalizado", e aí vale o padrão global — é o que faz mudar o padrão
   valer para todo mundo que não tem exceção. */
export function abasDe(perfil, abasPadrao) {
  const lista = perfil?.abas ?? abasPadrao ?? TODAS_AS_CHAVES;
  /* Filtra chave que não existe mais: aba removida do código não pode
     quebrar a sidebar de quem a tinha marcada. */
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
