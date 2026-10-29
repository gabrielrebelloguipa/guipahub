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

let estado = { materiais: [], guias: [], imagens: [], minis: new Set(), carregando: true, erro: "" };
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
  const [rm, rg, ri, rmini] = await Promise.all([
    todas(() => supabase.from("central_materiais").select("*").order("nome").order("id")),
    todas(() => supabase.from("central_guias").select("*").order("titulo").order("id")),
    todas(() => supabase.from("central_imagens").select("*").order("criado_em", { ascending: false }).order("id")),
    supabase.storage.from(BUCKET).list("mini", { limit: 1000 }),
  ]);
  const err = rm.error || rg.error || ri.error;
  if (err) {
    definir({ carregando: false, erro: explicarErro(err) });
    return;
  }
  definir({
    materiais: rm.data || [],
    /* Guia é um card com várias medidas (specs). Guia antiga, de um valor
       só, vira uma medida com esse valor. `pendente` não é coluna: é
       "alguma medida sem valor", e derivar evita que as duas discordem. */
    guias: (rg.data || []).map((g) => {
      const specs = Array.isArray(g.specs) && g.specs.length
        ? g.specs
        : g.valor ? [{ k: "", v: g.valor }] : [];
      return { ...g, specs, pendente: !specs.length || specs.some((x) => !String(x.v || "").trim()) };
    }),
    imagens: ri.data || [],
    /* Miniatura que não deu para listar só faz a grade cair no original. */
    minis: new Set((rmini.data || []).map((o) => `mini/${o.name}`)),
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

/* Material pode ter um arquivo (PDF, projeto, zip…) no bucket. Sobe o
   arquivo novo antes de gravar a linha; o antigo só sai depois que a
   linha já aponta para o novo, para nunca ficar apontando para o nada. */
export async function salvarMaterial(m, arquivo) {
  const linha = {
    nome: m.nome.trim(),
    categoria: m.categoria || "",
    url: m.url || "",
    notas: m.notas || "",
  };
  let novoCaminho = "";
  if (arquivo) {
    novoCaminho = `mat/${crypto.randomUUID()}.${extensao(arquivo)}`;
    const up = await supabase.storage.from(BUCKET).upload(novoCaminho, arquivo, {
      contentType: arquivo.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) return { ok: false, erro: explicarErro(up.error) };
    linha.caminho = novoCaminho;
    linha.arquivo_nome = arquivo.name || "arquivo";
    linha.bytes = arquivo.size || 0;
  }
  const r = await feito(
    m.id
      ? supabase.from("central_materiais").update(linha).eq("id", m.id)
      : supabase.from("central_materiais").insert(linha)
  );
  if (!r.ok && novoCaminho) await supabase.storage.from(BUCKET).remove([novoCaminho]);
  if (r.ok && novoCaminho && m.caminho) await supabase.storage.from(BUCKET).remove([m.caminho]);
  return r;
}
export async function excluirMaterial(m) {
  const r = await feito(supabase.from("central_materiais").delete().eq("id", m.id));
  if (r.ok && m.caminho) await supabase.storage.from(BUCKET).remove([m.caminho]);
  return r;
}

/* Baixa com o nome original do arquivo. */
export async function baixarArquivo(caminho, nome) {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
  if (error) throw new Error(explicarErro(error));
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome || caminho.split("/").pop();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- guias ---------- */

export function salvarGuia(g) {
  const linha = {
    grupo: g.grupo || "",
    titulo: g.titulo.trim(),
    specs: (g.specs || [])
      .map((x) => ({ k: String(x.k || "").trim(), v: String(x.v || "").trim() }))
      .filter((x) => x.k || x.v),
    valor: "",
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
  await subirMini(caminho, arquivo);
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
  if (r.ok) await supabase.storage.from(BUCKET).remove([img.caminho, caminhoMini(img.caminho)]);
  liberarLink(img.caminho);
  return r;
}

/* ---------- miniaturas ---------- */

/* A grade mostrava o original, e alguns passam de 20 MB: abrir a aba era
   baixar a Central inteira. Cada imagem ganha uma cópia pequena em
   mini/, com o mesmo nome; o original só desce para Copiar e Baixar. */
const LADO_MINI = 480;

export function caminhoMini(caminho) {
  return caminho.replace(/^img\//, "mini/").replace(/\.[^./]+$/, "") + ".webp";
}

async function gerarMini(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || LADO_MINI;
    const h = img.naturalHeight || LADO_MINI;
    const k = Math.min(1, LADO_MINI / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, "image/webp", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* Falhar aqui não impede nada: sem miniatura, a grade usa o original. */
async function subirMini(caminho, blob) {
  try {
    const mini = await gerarMini(blob);
    if (!mini) return false;
    const destino = caminhoMini(caminho);
    const { error } = await supabase.storage.from(BUCKET).upload(destino, mini, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error && !/exists|duplicate/i.test(error.message || "")) return false;
    definir({ minis: new Set([...estado.minis, destino]) });
    return true;
  } catch {
    return false;
  }
}

/* Imagens que subiram antes das miniaturas: quem pode subir na Central
   gera as que faltam, uma por vez, ao abrir a aba. */
let completando = false;
export async function completarMiniaturas() {
  if (completando) return;
  completando = true;
  try {
    for (const img of estado.imagens) {
      if (estado.minis.has(caminhoMini(img.caminho))) continue;
      const { data, error } = await supabase.storage.from(BUCKET).download(img.caminho);
      if (!error && data) await subirMini(img.caminho, data);
    }
  } finally {
    completando = false;
  }
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
