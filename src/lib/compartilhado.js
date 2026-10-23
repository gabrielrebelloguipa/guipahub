/* Dados COMPARTILHADOS: o que uma pessoa cria, todo mundo vê.

   Marcas, a biblioteca de prompts e os quadros de empresa vivem aqui.
   O que é de cada um (kanban pessoal, prompts pessoais, Central) fica em
   estado.js e não se mistura.

   DOIS BACKENDS, uma interface. Se o Supabase estiver configurado, tudo
   vai para o banco e volta em tempo real. Se não estiver, cai no
   localStorage — o app continua funcionando, só que sem ser compartilhado
   de verdade. `estado.remoto` diz qual está valendo, e a interface avisa.

   As telas chamam operações com nome (salvarMarca, publicarPrompt…), não
   "aplique este patch no objeto". Isso é o que torna o backend
   trocável: patch de objeto inteiro não vira SQL sem reescrever tabela
   toda a cada arraste. */

import { useSyncExternalStore } from "react";
import { supabase, temSupabase, explicarErro, todas } from "./supabase.js";

const CHAVE = "guipahub_compartilhado_v1";

/* Sugestões, não lista fechada: o campo aceita nicho novo. Servem para
   evitar que "Alimentação", "Alimentício" e "Alimentos" virem três
   nichos diferentes para a mesma coisa. */
export const NICHOS_BASE = [
  "Alimentação", "Bebidas", "Delivery", "Varejo", "Moda", "Beleza",
  "Educação", "Saúde", "Financeiro", "Tecnologia", "Automotivo",
  "Entretenimento", "Esportes", "Imobiliário", "Telecom", "Serviços",
];

/* As mesmas cinco do 07-kanban-historico.sql, que cria o quadro de toda
   marca no banco, e as mesmas do quadro pessoal. Um nome de coluna
   diferente em cada lugar faria o painel Hoje contar "Fazendo" num
   quadro e "Em andamento" no outro como coisas distintas. */
export const LISTAS_PADRAO = [
  { nome: "Pendentes", cor: "#c78b2b", concluida: false },
  { nome: "Em andamento", cor: "#4f8fdb", concluida: false },
  { nome: "Em validação", cor: "#8a6fc4", concluida: false },
  { nome: "On hold", cor: "#8b8d85", concluida: false },
  { nome: "Concluído", cor: "#5fae5a", concluida: true },
];

export const REMOTO = temSupabase();

/* ---------- loja observável ---------- */

function vazio() {
  return { marcas: [], biblioteca: [], quadros: [], meuQuadroId: "" };
}

let estado = {
  ...vazio(),
  carregando: REMOTO,
  erro: "",
  remoto: REMOTO,
};

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
export function useCompartilhado() {
  return useSyncExternalStore(subscrever, pegar, pegar);
}

export function uid(prefixo) {
  return prefixo + "_" + Math.random().toString(36).slice(2, 9);
}

export function normaliza(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/* ---------- backend local (sem Supabase) ---------- */

function lerLocal() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? { ...vazio(), ...JSON.parse(bruto) } : vazio();
  } catch {
    return vazio();
  }
}

function gravarLocal(patch) {
  const novo = {
    marcas: estado.marcas,
    biblioteca: estado.biblioteca,
    quadros: estado.quadros,
    ...patch,
  };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(novo));
  } catch (e) {
    definir({ erro: "Não consegui salvar: " + (e?.message || "espaço esgotado") });
    return;
  }
  definir({ ...novo, erro: "" });
}

/* ---------- carregar ---------- */

/* Na entrada carrega só o leve: marcas, biblioteca e a lista de quadros
   (sem colunas nem cartões). As colunas e os cartões de cada quadro vêm
   quando ele é aberto (carregarQuadro). Antes tudo vinha de uma vez —
   272 marcas, ~1.360 colunas e todos os cartões — e de novo a cada
   tecla digitada em qualquer cartão, por qualquer pessoa. */
let primeiraCarga = true;
async function carregarRemoto() {
  if (primeiraCarga) definir({ carregando: true, erro: "" });
  try {
    /* A ordem por id no fim de cada consulta é o desempate: paginar sem
       ordem estável pode repetir uma linha numa página e pular outra. */
    const [rm, rb, rq] = await Promise.all([
      todas(() => supabase.from("marcas").select("*").order("nome").order("id")),
      todas(() => supabase.from("biblioteca_prompts").select("*").order("criado_em", { ascending: false }).order("id")),
      todas(() => supabase.from("quadros").select("*").order("id")),
    ]);
    const primeiro = [rm, rb, rq].find((r) => r.error);
    if (primeiro) throw primeiro.error;

    /* Quadro já aberto mantém colunas e cartões que já estão na tela. */
    const antes = new Map((estado.quadros || []).map((q) => [q.id, q]));
    const quadros = (rq.data || []).map((q) => {
      const a = antes.get(q.id);
      return a?.carregado
        ? { ...deQuadro(q), listas: a.listas, demandas: a.demandas, carregado: true }
        : { ...deQuadro(q), listas: [], demandas: [], carregado: false };
    });

    definir({
      marcas: (rm.data || []).map(deMarca),
      biblioteca: (rb.data || []).map(dePrompt),
      quadros,
      carregando: false,
      erro: "",
    });
    primeiraCarga = false;
  } catch (e) {
    definir({ carregando: false, erro: explicarErro(e) });
  }
}

/* Colunas e cartões de UM quadro. Chamado quando o quadro é aberto. */
const lendoQuadro = new Set();
export async function carregarQuadro(id, forcar = false) {
  if (!REMOTO || !id || lendoQuadro.has(id)) return;
  const q = (estado.quadros || []).find((x) => x.id === id);
  if (q?.carregado && !forcar) return;
  lendoQuadro.add(id);
  const [rl, rc] = await Promise.all([
    todas(() => supabase.from("listas").select("*").eq("quadro_id", id).order("ordem").order("id")),
    todas(() => supabase.from("cartoes").select("*").eq("quadro_id", id).order("ordem").order("id")),
  ]);
  lendoQuadro.delete(id);
  const err = rl.error || rc.error;
  if (err) return definir({ erro: explicarErro(err) });
  mexerQuadro(id, (x) => ({
    ...x,
    listas: (rl.data || []).map(deLista),
    demandas: (rc.data || []).map(deCartao),
    carregado: true,
  }));
}

/* O quadro pessoal de quem está logado (o banco cria na primeira vez). */
async function iniciarMeuQuadro() {
  const { data, error } = await supabase.rpc("meu_quadro_pessoal");
  if (error || !data) return;
  if (!(estado.quadros || []).some((q) => q.id === data)) {
    definir({ quadros: [...(estado.quadros || []), { id: data, marcaId: null, dono: "", listas: [], demandas: [], carregado: false }] });
  }
  definir({ meuQuadroId: data });
  carregarQuadro(data);
}

const porOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.id).localeCompare(String(b.id));

/* Aplica uma mudança num quadro e mantém colunas e cartões na ordem. */
function mexerQuadro(id, fn) {
  const existe = (estado.quadros || []).some((q) => q.id === id);
  const base = existe
    ? estado.quadros
    : [...(estado.quadros || []), { id, marcaId: null, dono: "", listas: [], demandas: [], carregado: false }];
  definir({
    quadros: base.map((q) => {
      if (q.id !== id) return q;
      const n = fn(q);
      return { ...n, listas: [...n.listas].sort(porOrdem), demandas: [...n.demandas].sort(porOrdem) };
    }),
  });
}

/* Uma linha (coluna ou cartão) que chegou do banco: entra no quadro dela,
   ou sai de onde estava. `campo` é "listas" ou "demandas". */
function aplicarFilho(campo, linha, de) {
  const item = de(linha);
  const qid = linha.quadro_id;
  definir({
    quadros: (estado.quadros || []).map((q) => {
      if (q.id === qid) {
        if (!q.carregado) return q;
        const sem = q[campo].filter((x) => x.id !== item.id);
        return { ...q, [campo]: [...sem, item].sort(porOrdem) };
      }
      /* mudou de quadro: some do antigo */
      return q[campo].some((x) => x.id === item.id)
        ? { ...q, [campo]: q[campo].filter((x) => x.id !== item.id) }
        : q;
    }),
  });
}
function removerFilho(campo, id) {
  definir({
    quadros: (estado.quadros || []).map((q) =>
      q[campo].some((x) => x.id === id) ? { ...q, [campo]: q[campo].filter((x) => x.id !== id) } : q
    ),
  });
}
function aplicarLinha(chave, linha, de) {
  const item = de(linha);
  const sem = (estado[chave] || []).filter((x) => x.id !== item.id);
  definir({ [chave]: chave === "marcas"
    ? [...sem, item].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    : [item, ...sem] });
}

/* Tradução banco → app. O app usa `status` para o id da coluna desde o
   arquivo único; manter o nome evitou reescrever as telas todas. */
function deQuadro(q) {
  return { id: q.id, marcaId: q.marca_id, dono: q.dono || "", criadoPor: q.criado_por };
}
function deLista(l) {
  return { id: l.id, nome: l.nome, cor: l.cor, concluida: l.concluida, ordem: l.ordem };
}
function deCartao(c) {
  return {
    id: c.id, titulo: c.titulo, solicitante: c.solicitante || "",
    prazo: c.prazo || "", prioridade: c.prioridade || "normal",
    notas: c.notas || "", status: c.lista_id, ordem: c.ordem,
    criadoEm: (c.criado_em || "").slice(0, 10),
    criadoPor: c.criado_por || "",
  };
}
function deMarca(m) {
  return {
    id: m.id, nome: m.nome, nicho: m.nicho, site: m.site,
    resumo: m.resumo, descricao: m.descricao, logo: m.logo || "",
    responsavel: m.responsavel || "",
    criadoPor: m.criado_por, criadoEm: (m.criado_em || "").slice(0, 10),
  };
}
function dePrompt(p) {
  return {
    id: p.id, titulo: p.titulo, texto: p.texto, tags: p.tags || [],
    categoria: p.categoria, ferramenta: p.ferramenta, modelo: p.modelo,
    criadoPor: p.criado_por, criadoEm: (p.criado_em || "").slice(0, 10),
  };
}

let canal = null;
const ouvintesHistorico = new Set();

/* O cartao aberto se inscreve aqui para ver comentario e movimento de
   outra pessoa aparecer sem recarregar. */
export function ouvirHistorico(fn) {
  ouvintesHistorico.add(fn);
  return () => ouvintesHistorico.delete(fn);
}

/* Tempo real linha a linha: chega a linha que mudou e só ela é aplicada.
   (Antes cada evento recarregava as cinco tabelas inteiras.) As regras
   do banco valem aqui também: ninguém recebe linha do quadro pessoal de
   outra pessoa. */
function ouvirRemoto() {
  if (!supabase || canal) return;
  canal = supabase
    .channel("guipahub-compartilhado")
    .on("postgres_changes", { event: "*", schema: "public" }, (msg) => {
      const t = msg.table;
      const apagou = msg.eventType === "DELETE";
      const linha = apagou ? msg.old : msg.new;
      if (!linha) return;
      if (t === "cartoes_eventos") {
        ouvintesHistorico.forEach((fn) => fn(msg.new || msg.old));
        return;
      }
      if (t === "cartoes") return apagou ? removerFilho("demandas", linha.id) : aplicarFilho("demandas", linha, deCartao);
      if (t === "listas") return apagou ? removerFilho("listas", linha.id) : aplicarFilho("listas", linha, deLista);
      if (t === "marcas") {
        if (apagou) return definir({ marcas: estado.marcas.filter((m) => m.id !== linha.id) });
        return aplicarLinha("marcas", linha, deMarca);
      }
      if (t === "biblioteca_prompts") {
        if (apagou) return definir({ biblioteca: estado.biblioteca.filter((p) => p.id !== linha.id) });
        return aplicarLinha("biblioteca", linha, dePrompt);
      }
      if (t === "quadros") {
        if (apagou) return definir({ quadros: estado.quadros.filter((q) => q.id !== linha.id) });
        const a = estado.quadros.find((q) => q.id === linha.id);
        return definir({
          quadros: a
            ? estado.quadros.map((q) => (q.id === linha.id ? { ...q, ...deQuadro(linha) } : q))
            : [...estado.quadros, { ...deQuadro(linha), listas: [], demandas: [], carregado: false }],
        });
      }
      /* demais tabelas (perfis, Central, prompts…) têm o próprio canal */
    })
    .subscribe();
}

export function iniciar() {
  if (REMOTO) {
    carregarRemoto();
    ouvirRemoto();
    iniciarMeuQuadro();
  } else {
    definir({ ...lerLocal(), carregando: false });
  }
}

export function recarregar() {
  if (REMOTO) carregarRemoto();
}

/* ---------- marcas ---------- */

export const CAMPOS_MARCA = [
  { key: "nome", label: "Nome", obrigatorio: true },
  { key: "nicho", label: "Nicho", obrigatorio: true },
  { key: "site", label: "Site", obrigatorio: true },
  { key: "resumo", label: "Resumo", obrigatorio: true },
  { key: "descricao", label: "Descrição completa", obrigatorio: true },
  { key: "logo", label: "Logo", obrigatorio: false },
];

export function validarMarca(m) {
  return CAMPOS_MARCA
    .filter((c) => c.obrigatorio && !String(m[c.key] || "").trim())
    .map((c) => c.label);
}

export function marcaPorId(comp, id) {
  return (comp.marcas || []).find((m) => m.id === id) || null;
}

export async function salvarMarca(m, quem) {
  if (!REMOTO) {
    const alvo = {
      ...m,
      id: m.id || uid("m"),
      criadoPor: m.criadoPor || quem || "",
      criadoEm: m.criadoEm || hoje(),
    };
    gravarLocal({
      marcas: m.id
        ? estado.marcas.map((x) => (x.id === alvo.id ? alvo : x))
        : [alvo, ...estado.marcas],
    });
    return { ok: true };
  }

  const linha = {
    nome: m.nome, nicho: m.nicho, site: m.site,
    resumo: m.resumo, descricao: m.descricao, logo: m.logo || null,
    responsavel: m.responsavel || "",
  };
  const q = m.id
    ? supabase.from("marcas").update(linha).eq("id", m.id)
    : supabase.from("marcas").insert(linha);
  const { data, error } = await q.select().single();
  if (error) return { ok: false, erro: explicarErro(error) };
  aplicarLinha("marcas", data, deMarca);
  return { ok: true };
}

/* Trocar so o responsavel, sem passar pelo formulario inteiro. As 272
   marcas do cadastro inicial vieram sem descricao completa, que e
   obrigatoria no formulario: sem este atalho, montar a carteira de cada
   pessoa do comercial exigiria escrever 272 descricoes antes. */
export async function definirResponsavel(id, nome) {
  /* Nome como está na lista, sem baixar a caixa: "William", não
     "william". (Quando isto guardava e-mail, baixar fazia sentido.) */
  const responsavel = String(nome || "").trim();
  if (!REMOTO) {
    gravarLocal({
      marcas: estado.marcas.map((x) => (x.id === id ? { ...x, responsavel } : x)),
    });
    return { ok: true };
  }
  const { data, error } = await supabase.from("marcas").update({ responsavel }).eq("id", id).select().single();
  if (error) return { ok: false, erro: explicarErro(error) };
  aplicarLinha("marcas", data, deMarca);
  return { ok: true };
}

export async function excluirMarca(id) {
  if (!REMOTO) {
    gravarLocal({
      marcas: estado.marcas.filter((x) => x.id !== id),
      /* espelha o `on delete cascade` do banco: quadro sem marca é lixo */
      quadros: estado.quadros.filter((q) => q.marcaId !== id),
    });
    return { ok: true };
  }
  const { error } = await supabase.from("marcas").delete().eq("id", id);
  if (error) return { ok: false, erro: explicarErro(error) };
  definir({
    marcas: estado.marcas.filter((m) => m.id !== id),
    quadros: estado.quadros.filter((q) => q.marcaId !== id),
  });
  return { ok: true };
}

/* ---------- historico do kanban ---------- */

/* A linha do tempo de um cartao: criou, moveu, editou, comentou. Quem
   escreve isto e o gatilho do banco, nao o app -- por isso aqui so ha
   leitura e comentario. */
export async function historicoDoCartao(cartaoId) {
  if (!REMOTO || !cartaoId) return { ok: true, eventos: [] };
  const { data, error } = await supabase
    .from("cartoes_eventos")
    .select("*")
    .eq("cartao_id", cartaoId)
    .order("criado_em", { ascending: true });
  if (error) return { ok: false, erro: explicarErro(error), eventos: [] };
  return { ok: true, eventos: (data || []).map(deEvento) };
}

/* O historico do quadro inteiro, mais recente primeiro -- inclusive dos
   cartoes ja excluidos, que so existem mais aqui. */
export async function historicoDoQuadro(quadroId, limite = 80) {
  if (!REMOTO || !quadroId) return { ok: true, eventos: [] };
  const { data, error } = await supabase
    .from("cartoes_eventos")
    .select("*")
    .eq("quadro_id", quadroId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) return { ok: false, erro: explicarErro(error), eventos: [] };
  return { ok: true, eventos: (data || []).map(deEvento) };
}

function deEvento(e) {
  return {
    id: e.id, tipo: e.tipo, cartaoId: e.cartao_id, titulo: e.cartao_titulo,
    de: e.de_lista, para: e.para_lista, texto: e.texto,
    autor: e.autor, autorNome: e.autor_nome || e.autor, em: e.criado_em,
    editadoEm: e.editado_em || null,
  };
}

/* Editar e excluir comentario. O banco confere quem pode (11): editar
   so o proprio, excluir o proprio ou, sendo admin, qualquer um. A versao
   anterior vai para a auditoria pelo gatilho, nao por aqui. */
export async function editarComentario(id, texto) {
  const t = String(texto || "").trim();
  if (!t) return { ok: false, erro: "Comentario vazio. Para apagar, use Excluir." };
  const { data, error } = await supabase
    .from("cartoes_eventos").update({ texto: t }).eq("id", id).select("id");
  if (error) return { ok: false, erro: explicarErro(error) };
  /* Sem erro e sem linha devolvida = a politica barrou em silencio
     (comentario de outra pessoa). Dizer isso, em vez de fingir que foi. */
  if (!data || !data.length) return { ok: false, erro: "Só quem escreveu pode editar este comentário." };
  return { ok: true };
}

export async function excluirComentario(id) {
  const { data, error } = await supabase
    .from("cartoes_eventos").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: explicarErro(error) };
  if (!data || !data.length) return { ok: false, erro: "Só quem escreveu, ou um admin, pode excluir este comentário." };
  return { ok: true };
}

/* Toda versao de todo comentario -- criado, editado, excluido. So admin
   le (a politica devolve vazio para os outros). */
export async function auditoriaComentarios(limite = 300) {
  const { data, error } = await supabase
    .from("auditoria_comentarios").select("*").order("em", { ascending: false }).limit(limite);
  if (error) return { ok: false, erro: explicarErro(error), linhas: [] };
  return { ok: true, linhas: data || [] };
}

/* O autor vai preenchido, mas o banco confere: a politica so aceita
   comentario cujo autor seja quem esta logado. Mandar o nome junto e so
   para o historico continuar legivel se a pessoa sair da empresa. */
export async function comentar(quadroId, cartao, texto, perfil) {
  const t = String(texto || "").trim();
  if (!t) return { ok: false, erro: "Comentario vazio." };
  const { error } = await supabase.from("cartoes_eventos").insert({
    quadro_id: quadroId,
    cartao_id: cartao.id,
    cartao_titulo: cartao.titulo,
    tipo: "comentou",
    texto: t,
    autor: perfil?.email || "",
    autor_nome: perfil?.nome || perfil?.email || "",
  });
  if (error) return { ok: false, erro: explicarErro(error) };
  return { ok: true };
}

/* Nome e e-mail de quem ja entrou no GuipaHub, para escolher o
   responsavel de uma conta e mostrar nome em vez de e-mail. Vem de uma
   funcao do banco que devolve so isso -- a tabela de perfis em si
   (quem e admin, que permissao tem) segue fechada para nao-admins. */
/* Guardada por um minuto só: quem entrou no GuipaHub pela primeira vez
   aparece na lista sem ninguém precisar recarregar a página. */
let cachePessoas = null;
let cachePessoasEm = 0;
export async function pessoas() {
  if (!REMOTO) return [];
  if (cachePessoas && Date.now() - cachePessoasEm < 60000) return cachePessoas;
  const { data, error } = await supabase.rpc("pessoas_da_guipa");
  if (error) return cachePessoas || [];
  cachePessoas = data || [];
  cachePessoasEm = Date.now();
  return cachePessoas;
}

export function nomeDe(email, lista) {
  if (!email) return "";
  if (email === "sistema") return "Sistema";
  /* Responsável é guardado pelo nome, não pelo e-mail: aí já é o nome. */
  if (!email.includes("@")) return email;
  const p = (lista || []).find((x) => x.email?.toLowerCase() === email.toLowerCase());
  return (p && p.nome) || email.split("@")[0];
}

/* ---------- nichos ---------- */

export function nichosConhecidos(comp) {
  const usados = (comp.marcas || []).map((m) => (m.nicho || "").trim()).filter(Boolean);
  const vistos = new Map();
  for (const n of [...NICHOS_BASE, ...usados]) {
    const c = normaliza(n);
    if (!vistos.has(c)) vistos.set(c, n);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/* ---------- biblioteca de prompts ---------- */

export async function publicarPrompt(p, quem) {
  void quem; // usado só no modo sem banco
  const existente = (estado.biblioteca || []).find(
    (x) => normaliza(x.titulo) === normaliza(p.titulo)
  );

  if (!REMOTO) {
    const alvo = {
      id: existente?.id || uid("bp"),
      titulo: p.titulo, texto: p.texto, tags: [...(p.tags || [])],
      categoria: p.categoria || "outro",
      ferramenta: p.ferramenta || "", modelo: p.modelo || "",
      criadoPor: quem || "", criadoEm: hoje(),
    };
    gravarLocal({
      biblioteca: existente
        ? estado.biblioteca.map((x) => (x.id === alvo.id ? alvo : x))
        : [alvo, ...estado.biblioteca],
    });
    return { ok: true };
  }

  const linha = {
    titulo: p.titulo, texto: p.texto, tags: p.tags || [],
    categoria: p.categoria || "outro",
    ferramenta: p.ferramenta || "", modelo: p.modelo || "",
  };
  /* Republicar atualiza em vez de duplicar — mesma regra do índice único
     por título que existe no banco. O autor quem põe é o banco (19): é
     sempre quem publicou, e não muda depois. */
  const q = existente
    ? supabase.from("biblioteca_prompts").update(linha).eq("id", existente.id)
    : supabase.from("biblioteca_prompts").insert(linha);
  const { data, error } = await q.select().single();
  if (error) return { ok: false, erro: explicarErro(error) };
  aplicarLinha("biblioteca", data, dePrompt);
  return { ok: true };
}

/* ---------- quadros por empresa ---------- */

export function quadroDaMarca(comp, marcaId) {
  return (comp.quadros || []).find((q) => q.marcaId === marcaId) || null;
}

export async function criarQuadro(marcaId, quem) {
  if (!REMOTO) {
    gravarLocal({
      quadros: [
        ...estado.quadros,
        {
          id: uid("q"), marcaId, criadoPor: quem || "",
          listas: LISTAS_PADRAO.map((l, i) => ({ ...l, id: uid("l"), ordem: i })),
          demandas: [],
        },
      ],
    });
    return { ok: true };
  }

  const { data, error } = await supabase
    .from("quadros")
    .insert({ marca_id: marcaId, criado_por: quem || "" })
    .select()
    .single();
  if (error) return { ok: false, erro: explicarErro(error) };

  const { error: e2 } = await supabase.from("listas").insert(
    LISTAS_PADRAO.map((l, i) => ({
      quadro_id: data.id, nome: l.nome, cor: l.cor,
      concluida: l.concluida, ordem: i,
    }))
  );
  if (e2) return { ok: false, erro: explicarErro(e2) };
  await carregarRemoto();
  return { ok: true };
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/* Ordem entre dois vizinhos = a média das duas. É o que permite mover um
   cartão com um UPDATE só, em vez de renumerar a coluna inteira — e o
   que evita duas pessoas se atropelarem arrastando ao mesmo tempo. */
function ordemEntre(anterior, proximo) {
  const a = anterior?.ordem;
  const b = proximo?.ordem;
  if (a == null && b == null) return 0;
  if (a == null) return b - 1;
  if (b == null) return a + 1;
  return (a + b) / 2;
}

/* As operações do quadro de empresa, no formato que Quadro.jsx espera.
   Mesma interface do `criarApi` do kanban pessoal — por isso o
   componente do quadro não sabe em qual dos dois está mexendo. */
export function apiQuadroEmpresa(quadroId) {
  function atual() {
    return (estado.quadros || []).find((q) => q.id === quadroId) || { listas: [], demandas: [] };
  }

  function local(patch) {
    gravarLocal({
      quadros: estado.quadros.map((q) => (q.id === quadroId ? { ...q, ...patch } : q)),
    });
  }

  /* Deu erro: avisa e relê o quadro, para a tela não ficar mostrando uma
     mudança que o banco não aceitou. */
  function falhou(error) {
    definir({ erro: explicarErro(error) });
    carregarQuadro(quadroId, true);
  }

  return {
    async criarTarefa(listaId, titulo) {
      const q = atual();
      const naLista = q.demandas.filter((d) => d.status === listaId);
      const ordem = ordemEntre(null, naLista[0]);
      if (!REMOTO) {
        local({
          demandas: [
            { id: uid("d"), titulo, solicitante: "", prazo: "", prioridade: "normal",
              notas: "", status: listaId, ordem, criadoEm: hoje() },
            ...q.demandas,
          ],
        });
        return;
      }
      const { data, error } = await supabase
        .from("cartoes")
        .insert({ quadro_id: quadroId, lista_id: listaId, titulo, ordem })
        .select()
        .single();
      if (error) falhou(error);
      else aplicarFilho("demandas", data, deCartao);
    },

    /* Chamado quando o cartão é SALVO (ao fechar a janela), não a cada
       tecla. Mostra na hora e grava só este cartão. */
    async atualizarTarefa(t) {
      if (!REMOTO) {
        local({ demandas: atual().demandas.map((x) => (x.id === t.id ? t : x)) });
        return;
      }
      mexerQuadro(quadroId, (q) => ({ ...q, demandas: q.demandas.map((x) => (x.id === t.id ? { ...x, ...t } : x)) }));
      const { error } = await supabase
        .from("cartoes")
        .update({
          titulo: t.titulo, solicitante: t.solicitante || "",
          prazo: t.prazo || null, prioridade: t.prioridade || "normal",
          notas: t.notas || "", lista_id: t.status,
        })
        .eq("id", t.id);
      if (error) falhou(error);
    },

    async excluirTarefa(id) {
      if (!REMOTO) {
        local({ demandas: atual().demandas.filter((x) => x.id !== id) });
        return;
      }
      const { data, error } = await supabase.from("cartoes").delete().eq("id", id).select("id");
      if (error) return falhou(error);
      /* Sem erro e sem linha = a regra do banco não deixou (cartão de outra
         pessoa). Dizer, em vez de fingir que apagou. */
      if (!data || !data.length) return definir({ erro: "Você só pode excluir os cartões que criou." });
      removerFilho("demandas", id);
    },

    async moverTarefa(id, listaId, indice) {
      if (!listaId) return;
      const q = atual();
      const naLista = q.demandas
        .filter((d) => d.status === listaId && d.id !== id)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const ordem = ordemEntre(naLista[indice - 1], naLista[indice]);

      if (!REMOTO) {
        local({
          demandas: q.demandas.map((d) =>
            d.id === id ? { ...d, status: listaId, ordem } : d
          ),
        });
        return;
      }
      /* Move na tela antes da resposta: arrastar não pode ficar esperando
         a rede para o cartão "cair" no lugar. */
      mexerQuadro(quadroId, (x) => ({
        ...x,
        demandas: x.demandas.map((d) => (d.id === id ? { ...d, status: listaId, ordem } : d)),
      }));
      const { error } = await supabase
        .from("cartoes")
        .update({ lista_id: listaId, ordem })
        .eq("id", id);
      if (error) falhou(error);
    },

    async criarLista() {
      const q = atual();
      const ordem = (q.listas[q.listas.length - 1]?.ordem ?? -1) + 1;
      const cores = ["#c78b2b", "#4f8fdb", "#8a6fc4", "#8b8d85", "#5fae5a", "#c2678d", "#3f9c96", "#b3452f"];
      const cor = cores[q.listas.length % cores.length];
      if (!REMOTO) {
        local({ listas: [...q.listas, { id: uid("l"), nome: "Nova lista", cor, concluida: false, ordem }] });
        return;
      }
      const { data, error } = await supabase
        .from("listas")
        .insert({ quadro_id: quadroId, nome: "Nova lista", cor, concluida: false, ordem })
        .select()
        .single();
      if (error) falhou(error);
      else aplicarFilho("listas", data, deLista);
    },

    async atualizarLista(id, patch) {
      if (!REMOTO) {
        local({ listas: atual().listas.map((L) => (L.id === id ? { ...L, ...patch } : L)) });
        return;
      }
      mexerQuadro(quadroId, (q) => ({ ...q, listas: q.listas.map((L) => (L.id === id ? { ...L, ...patch } : L)) }));
      const { error } = await supabase.from("listas").update(patch).eq("id", id);
      if (error) falhou(error);
    },

    async moverLista(id, delta) {
      const q = atual();
      const arr = [...q.listas].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const i = arr.findIndex((L) => L.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= arr.length) return;
      /* Troca só as duas ordens envolvidas — nunca renumera a fila. */
      const a = arr[i].ordem ?? i;
      const b = arr[j].ordem ?? j;
      if (!REMOTO) {
        local({
          listas: q.listas.map((L) =>
            L.id === arr[i].id ? { ...L, ordem: b } : L.id === arr[j].id ? { ...L, ordem: a } : L
          ),
        });
        return;
      }
      mexerQuadro(quadroId, (x) => ({
        ...x,
        listas: x.listas.map((L) =>
          L.id === arr[i].id ? { ...L, ordem: b } : L.id === arr[j].id ? { ...L, ordem: a } : L
        ),
      }));
      const [r1, r2] = await Promise.all([
        supabase.from("listas").update({ ordem: b }).eq("id", arr[i].id),
        supabase.from("listas").update({ ordem: a }).eq("id", arr[j].id),
      ]);
      const err = r1.error || r2.error;
      if (err) falhou(err);
    },

    /* Arrastar solta a coluna numa POSIÇÃO, não um passo para o lado.
       Mesma ideia do `ordem` fracionário dos cartões: a nova ordem é a
       média entre os dois vizinhos do destino, então mover é um UPDATE
       só e duas pessoas arrastando ao mesmo tempo não se atropelam.

       `indice` conta a fila JÁ SEM a coluna arrastada — é o que a tela
       mostra enquanto ela está em voo, e evita o erro de meio item que
       aparece quando se tenta converter de uma contagem para a outra. */
    async reordenarLista(id, indice) {
      const q = atual();
      const arr = [...q.listas].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const semEla = arr.filter((L) => L.id !== id);
      if (semEla.length === arr.length) return;

      const antes = semEla[indice - 1];
      const depois = semEla[indice];
      const oA = antes ? antes.ordem ?? 0 : null;
      const oD = depois ? depois.ordem ?? 0 : null;

      let nova;
      if (oA === null && oD === null) nova = 0;
      else if (oA === null) nova = oD - 1;
      else if (oD === null) nova = oA + 1;
      else nova = (oA + oD) / 2;

      /* Vizinhos com a mesma ordem (quadro antigo, antes do fracionário)
         fazem a média cair em cima de um deles e o arraste não sai do
         lugar. Aí não tem jeito: renumera a fila inteira uma vez. */
      if (oA !== null && oD !== null && oA === oD) {
        const fila = [...semEla];
        fila.splice(indice, 0, arr.find((L) => L.id === id));
        if (!REMOTO) {
          local({ listas: fila.map((L, k) => ({ ...L, ordem: k })) });
          return;
        }
        mexerQuadro(quadroId, (x) => ({ ...x, listas: fila.map((L, k) => ({ ...L, ordem: k })) }));
        const rs = await Promise.all(
          fila.map((L, k) => supabase.from("listas").update({ ordem: k }).eq("id", L.id))
        );
        const e = rs.find((r) => r.error);
        if (e) falhou(e.error);
        return;
      }

      if (!REMOTO) {
        local({ listas: q.listas.map((L) => (L.id === id ? { ...L, ordem: nova } : L)) });
        return;
      }
      mexerQuadro(quadroId, (x) => ({ ...x, listas: x.listas.map((L) => (L.id === id ? { ...L, ordem: nova } : L)) }));
      const { error } = await supabase.from("listas").update({ ordem: nova }).eq("id", id);
      if (error) falhou(error);
    },

    async excluirLista(id) {
      const q = atual();
      const restantes = q.listas.filter((L) => L.id !== id);
      if (!restantes.length) return;
      if (!REMOTO) {
        /* Cartões da coluna apagada vão para a primeira que sobrou —
           perder tarefa por apagar coluna seria destruição silenciosa. */
        local({
          listas: restantes,
          demandas: q.demandas.map((d) =>
            d.status === id ? { ...d, status: restantes[0].id } : d
          ),
        });
        return;
      }
      /* No banco a FK é `on delete cascade`, então apagar a lista levaria
         os cartões junto. Mover antes é o que preserva o trabalho. */
      const { error: e1 } = await supabase
        .from("cartoes").update({ lista_id: restantes[0].id }).eq("lista_id", id);
      if (e1) return falhou(e1);
      const { error: e2 } = await supabase.from("listas").delete().eq("id", id);
      if (e2) return falhou(e2);
      carregarQuadro(quadroId, true);
    },
  };
}

/* O mesmo conjunto de operações serve o quadro pessoal: ele é um quadro
   como os de marca, só que com dono (20-quadro-pessoal-em-linhas). */
export const apiQuadro = apiQuadroEmpresa;

/* Coluna de um cartão, para cor e "está concluído?". */
export function infoDaLista(quadro, id) {
  const L = (quadro?.listas || []).find((x) => x.id === id);
  if (!L) return { key: "", label: "sem lista", color: "var(--border)", concluida: false };
  return { key: L.id, label: L.nome, color: L.cor, concluida: !!L.concluida };
}

/* O quadro pessoal de quem está logado, já na forma { listas, demandas }. */
export function meuQuadro(comp) {
  return (comp.quadros || []).find((q) => q.id === comp.meuQuadroId) || null;
}
