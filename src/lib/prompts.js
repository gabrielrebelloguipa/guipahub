import { useSyncExternalStore } from "react";
import { supabase, explicarErro } from "./supabase.js";

/* Prompts de cada pessoa, no banco (14-prompts-pessoais.sql).

   · meus: os prompts de quem está logado — os que ela criou e os que
     colegas mandaram (enviadoPor). O banco só devolve os do dono.
   · favoritos: ids dos prompts da biblioteca do time marcados com ★.
     Aparecem na aba da pessoa junto com os dela.

   Até a versão anterior o prompt pessoal morava no localStorage; quem
   ainda tiver prompts lá tem eles enviados para cá uma vez (migrarLocais). */

let st = { carregando: true, meus: [], favoritos: [], erro: "" };
const ouvintes = new Set();
function definir(patch) {
  st = { ...st, ...patch };
  ouvintes.forEach((f) => f());
}

export function usePrompts() {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => st
  );
}

function dePrompt(r) {
  return {
    id: r.id,
    titulo: r.titulo,
    texto: r.texto,
    tags: r.tags || [],
    categoria: r.categoria || "outro",
    ferramenta: r.ferramenta || "",
    modelo: r.modelo || "",
    favorito: !!r.favorito,
    criadoPor: r.criado_por || "",
    enviadoPor: r.enviado_por || "",
    daBiblioteca: r.da_biblioteca || null,
    criadoEm: r.criado_em,
  };
}

function paraLinha(p) {
  return {
    titulo: (p.titulo || "").trim(),
    texto: p.texto || "",
    tags: p.tags || [],
    categoria: p.categoria || "outro",
    ferramenta: p.ferramenta || "",
    modelo: p.modelo || "",
    favorito: !!p.favorito,
  };
}

export async function carregarPrompts() {
  if (!supabase) return definir({ carregando: false });
  const [a, b] = await Promise.all([
    supabase.from("prompts").select("*").order("criado_em", { ascending: false }).order("id"),
    supabase.from("prompts_favoritos").select("prompt_id"),
  ]);
  if (a.error) return definir({ carregando: false, erro: explicarErro(a.error) });
  definir({
    carregando: false,
    erro: "",
    meus: (a.data || []).map(dePrompt),
    favoritos: b.error ? [] : (b.data || []).map((x) => x.prompt_id),
  });
}

/* Prompt que um colega manda aparece sem recarregar. O banco só entrega
   pelo tempo real as linhas que a pessoa pode ler — as dela. */
let canal = null;
export function iniciarPrompts() {
  carregarPrompts();
  if (!supabase || canal) return;
  canal = supabase
    .channel("guipahub-prompts")
    .on("postgres_changes", { event: "*", schema: "public", table: "prompts" }, () => carregarPrompts())
    .on("postgres_changes", { event: "*", schema: "public", table: "prompts_favoritos" }, () => carregarPrompts())
    .subscribe();
}

async function feito(q) {
  const { error } = await q;
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregarPrompts();
  return { ok: true };
}

export function salvarPrompt(p, email) {
  return p.id
    ? feito(supabase.from("prompts").update(paraLinha(p)).eq("id", p.id))
    : feito(supabase.from("prompts").insert({ ...paraLinha(p), dono: email }));
}

export function excluirPrompt(id) {
  return feito(supabase.from("prompts").delete().eq("id", id));
}

export function alternarFavorito(p) {
  return feito(supabase.from("prompts").update({ favorito: !p.favorito }).eq("id", p.id));
}

/* ★ num prompt da biblioteca do time: ele passa a aparecer na aba. */
export function favoritarDoTime(promptId, email, ligar) {
  return ligar
    ? feito(supabase.from("prompts_favoritos").insert({ email, prompt_id: promptId }))
    : feito(supabase.from("prompts_favoritos").delete().eq("prompt_id", promptId).eq("email", email));
}

/* Manda uma cópia para o colega. Quem criou continua sendo quem
   escreveu; quem enviou o banco carimba sozinho. */
export async function enviarPrompt(p, para, meuEmail) {
  const { error } = await supabase.from("prompts").insert({
    ...paraLinha(p),
    favorito: false,
    dono: para,
    criado_por: p.criadoPor || meuEmail,
    da_biblioteca: p.daBiblioteca || null,
  });
  if (error) return { ok: false, erro: explicarErro(error) };
  return { ok: true };
}

/* Uma vez só: o que estava no localStorage vai para o banco. Devolve
   quantos subiram; quem chama limpa o local se deu certo. */
export async function migrarLocais(locais, email) {
  if (!supabase || !locais?.length || !email) return { ok: true, n: 0 };
  const linhas = locais
    .filter((p) => (p.titulo || "").trim())
    .map((p) => ({ ...paraLinha(p), dono: email }));
  if (!linhas.length) return { ok: true, n: 0 };
  const { error } = await supabase.from("prompts").insert(linhas);
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregarPrompts();
  return { ok: true, n: linhas.length };
}
