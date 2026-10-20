/* A Central Guipa compartilhada: materiais, guias e imagens no banco.

   Antes moravam no navegador de cada pessoa (estado.js / IndexedDB), e
   o "material oficial" de um não aparecia para mais ninguém. Mesma forma
   do compartilhado.js: loja observável, sem React, ligada aos
   componentes por useSyncExternalStore, e recarga por tempo real. */

import { useSyncExternalStore } from "react";
import { supabase, temSupabase, explicarErro, todas } from "./supabase.js";

const BUCKET = "central";
/* Link assinado vence em uma hora; pede de novo com folga antes. */
const VIDA_LINK_S = 3600;
const RENOVA_LINK_MS = 50 * 60 * 1000;

let estado = { materiais: [], guias: [], imagens: [], carregando: true, erro: "" };
const ouvintes = new Set();

function definir(patch) {
  estado = { ...estado, ...patch };
  ouvintes.forEach((fn) => fn());
}
function subscrever(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
function pegar() {
  return estado;
}
export function useCentral() {
  return useSyncExternalStore(subscrever, pegar, pegar);
}

/* ---------- carregar ---------- */

async function carregar() {
  if (!temSupabase()) {
    definir({ carregando: false, erro: "Supabase não configurado." });
    return;
  }
  /* Paginado como o resto (ver todas() em supabase.js): a Central não
     deve passar de mil itens tão cedo, mas no dia em que passar, cortar
     em silêncio seria o mesmo bug que sumiu com a coluna Concluído. */
  const [rm, rg, ri] = await Promise.all([
    todas(() => supabase.from("central_materiais").select("*").order("nome").order("id")),
    todas(() => supabase.from("central_guias").select("*").order("titulo").order("id")),
    todas(() => supabase.from("central_imagens").select("*").order("criado_em", { ascending: false }).order("id")),
  ]);
  const err = rm.error || rg.error || ri.error;
  if (err) {
    definir({ carregando: false, erro: explicarErro(err) });
    return;
  }
  definir({
    materiais: rm.data || [],
    /* `pendente` não é coluna: é "ainda sem valor", e derivar evita que
       as duas coisas discordem. */
    guias: (rg.data || []).map((g) => ({ ...g, pendente: !String(g.valor || "").trim() })),
    imagens: ri.data || [],
    carregando: false,
    erro: "",
  });
}

let canal = null;
let iniciado = false;
export function iniciarCentral() {
  if (iniciado) return;
  iniciado = true;
  carregar();
  if (!supabase || canal) return;
  canal = supabase.channel("guipahub-central");
  for (const t of ["central_materiais", "central_guias", "central_imagens"]) {
    canal.on("postgres_changes", { event: "*", schema: "public", table: t }, () => carregar());
  }
  canal.subscribe();
}

async function feito(promessa) {
  const { error } = await promessa;
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregar();
  return { ok: true };
}

/* ---------- materiais ---------- */

export function salvarMaterial(m) {
  const linha = {
    nome: m.nome.trim(),
    categoria: m.categoria || "",
    url: m.url || "",
    notas: m.notas || "",
  };
  return feito(
    m.id
      ? supabase.from("central_materiais").update(linha).eq("id", m.id)
      : supabase.from("central_materiais").insert(linha)
  );
}
export function excluirMaterial(id) {
  return feito(supabase.from("central_materiais").delete().eq("id", id));
}

/* ---------- guias ---------- */

export function salvarGuia(g) {
  const linha = {
    grupo: g.grupo || "",
    titulo: g.titulo.trim(),
    valor: g.valor || "",
    notas: g.notas || "",
  };
  return feito(
    g.id
      ? supabase.from("central_guias").update(linha).eq("id", g.id)
      : supabase.from("central_guias").insert(linha)
  );
}
export function excluirGuia(id) {
  return feito(supabase.from("central_guias").delete().eq("id", id));
}

/* ---------- imagens ---------- */

export const LIMITE_BYTES = 25 * 1024 * 1024;

function extensao(arquivo) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(arquivo.name || "");
  if (m) return m[1].toLowerCase();
  return (arquivo.type || "image/png").split("/")[1] || "png";
}

/* Sobe o arquivo primeiro e só depois grava a linha que aponta para
   ele. Na ordem contrária, uma falha no envio deixaria na tela uma
   imagem que não existe. E se a linha falhar, o arquivo é apagado —
   senão ficaria ocupando espaço sem ninguém conseguir vê-lo. */
export async function subirImagem(arquivo, nome) {
  const caminho = `img/${crypto.randomUUID()}.${extensao(arquivo)}`;
  const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || "application/octet-stream",
    upsert: false,
  });
  if (up.error) return { ok: false, erro: explicarErro(up.error) };
  const { error } = await supabase.from("central_imagens").insert({
    nome: (nome || arquivo.name || "imagem").replace(/\.[^.]+$/, ""),
    caminho,
    tipo: arquivo.type || "",
    bytes: arquivo.size || 0,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    return { ok: false, erro: explicarErro(error) };
  }
  await carregar();
  return { ok: true };
}

export function renomearImagem(id, nome) {
  return feito(supabase.from("central_imagens").update({ nome }).eq("id", id));
}

/* Apaga a linha e depois o arquivo. Se o arquivo não sair (permissão,
   rede), a imagem já some da tela e fica só o arquivo órfão — o
   contrário deixaria na tela uma imagem quebrada. */
export async function excluirImagem(img) {
  const r = await feito(supabase.from("central_imagens").delete().eq("id", img.id));
  if (r.ok) await supabase.storage.from(BUCKET).remove([img.caminho]);
  liberarLink(img.caminho);
  return r;
}

/* Link assinado por caminho, guardado até perto de vencer: a grade de
   imagens redesenha muito, e pedir um link novo a cada desenho seria
   uma chamada por imagem por segundo. */
const links = new Map(); // caminho -> { url, em }
export async function linkDaImagem(caminho) {
  const g = links.get(caminho);
  if (g && Date.now() - g.em < RENOVA_LINK_MS) return g.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, VIDA_LINK_S);
  if (error || !data?.signedUrl) return "";
  links.set(caminho, { url: data.signedUrl, em: Date.now() });
  return data.signedUrl;
}
function liberarLink(caminho) {
  links.delete(caminho);
}

export async function baixarImagem(caminho) {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
  if (error) throw new Error(explicarErro(error));
  return data;
}

/* ---------- trazer o que estava no navegador ---------- */

/* Para quem montou a Central quando ela ainda era local. Não roda
   sozinho: a pessoa escolhe enviar, porque o que vai para cá passa a
   ser visto pelo time inteiro. Pula o que já existe com o mesmo nome,
   para enviar duas vezes não duplicar. */
export async function enviarDoNavegador({ materiais, guias, imagens, lerArquivo }) {
  const atual = estado;
  const mesmo = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const rel = { materiais: 0, guias: 0, imagens: 0, pulados: 0, erros: [] };

  for (const m of materiais || []) {
    if (atual.materiais.some((x) => mesmo(x.nome, m.nome))) { rel.pulados++; continue; }
    const r = await salvarMaterial({ ...m, id: undefined });
    r.ok ? rel.materiais++ : rel.erros.push(`${m.nome}: ${r.erro}`);
  }
  for (const g of guias || []) {
    if (atual.guias.some((x) => mesmo(x.titulo, g.titulo))) { rel.pulados++; continue; }
    const r = await salvarGuia({ ...g, id: undefined });
    r.ok ? rel.guias++ : rel.erros.push(`${g.titulo}: ${r.erro}`);
  }
  for (const i of imagens || []) {
    if (atual.imagens.some((x) => mesmo(x.nome, i.nome))) { rel.pulados++; continue; }
    const blob = await lerArquivo(i.arquivoChave);
    if (!blob) { rel.erros.push(`${i.nome}: arquivo não está neste navegador`); continue; }
    const arquivo = new File([blob], i.nome, { type: blob.type || "image/png" });
    const r = await subirImagem(arquivo, i.nome);
    r.ok ? rel.imagens++ : rel.erros.push(`${i.nome}: ${r.erro}`);
  }
  return rel;
}
