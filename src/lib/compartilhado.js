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
  return { marcas: [], biblioteca: [], quadros: [] };
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

/* Uma leitura só na entrada, montando os quadros já aninhados — a
   interface espera { listas, demandas } dentro de cada quadro, e traduzir
   aqui evita que cada tela saiba que no banco isso são três tabelas. */
async function carregarRemoto() {
  definir({ carregando: true, erro: "" });
  try {
    /* A ordem por id no fim de cada consulta é o desempate: paginar sem
       ordem estável pode repetir uma linha numa página e pular outra. */
    const [rm, rb, rq, rl, rc] = await Promise.all([
      todas(() => supabase.from("marcas").select("*").order("nome").order("id")),
      todas(() => supabase.from("biblioteca_prompts").select("*").order("criado_em", { ascending: false }).order("id")),
      todas(() => supabase.from("quadros").select("*").order("id")),
      todas(() => supabase.from("listas").select("*").order("ordem").order("id")),
      todas(() => supabase.from("cartoes").select("*").order("ordem").order("id")),
    ]);
    const primeiro = [rm, rb, rq, rl, rc].find((r) => r.error);
    if (primeiro) throw primeiro.error;

    const quadros = (rq.data || []).map((q) => ({
      id: q.id,
      marcaId: q.marca_id,
      criadoPor: q.criado_por,
      listas: (rl.data || [])
        .filter((l) => l.quadro_id === q.id)
        .map((l) => ({
          id: l.id, nome: l.nome, cor: l.cor,
          concluida: l.concluida, ordem: l.ordem,
        })),
      demandas: (rc.data || [])
        .filter((c) => c.quadro_id === q.id)
        .map(deCartao),
    }));

    definir({
      marcas: (rm.data || []).map(deMarca),
      biblioteca: (rb.data || []).map(dePrompt),
      quadros,
      carregando: false,
      erro: "",
    });
  } catch (e) {
    definir({ carregando: false, erro: explicarErro(e) });
  }
}

/* Tradução banco → app. O app usa `status` para o id da coluna desde o
   arquivo único; manter o nome evitou reescrever as telas todas. */
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

/* Sem tempo real, o time só veria a mudança do colega ao recarregar.
   Recarregar tudo a cada evento é mais chamadas do que o necessário, mas
   é simples e correto — e o volume aqui (dezenas de marcas, centenas de
   cartões) não justifica sincronizar linha a linha. */
function ouvirRemoto() {
  if (!supabase || canal) return;
  canal = supabase
    .channel("guipahub-compartilhado")
    .on("postgres_changes", { event: "*", schema: "public" }, (msg) => {
      /* Um evento de historico nasce a cada cartao salvo -- e o cartao
         salva a cada tecla. Recarregar tudo por causa dele dobraria as
         leituras sem mudar nada que o quadro mostra. Quem precisa do
         historico (o cartao aberto) escuta pelo proprio canal. */
      if (msg.table === "cartoes_eventos") {
        ouvintesHistorico.forEach((fn) => fn(msg.new || msg.old));
        return;
      }
      carregarRemoto();
    })
    .subscribe();
}

export function iniciar() {
  if (REMOTO) {
    carregarRemoto();
    ouvirRemoto();
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
  const { error } = await q;
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregarRemoto();
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
  const { error } = await supabase.from("marcas").update({ responsavel }).eq("id", id);
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregarRemoto();
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
  await carregarRemoto();
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
  };
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
let cachePessoas = null;
export async function pessoas() {
  if (!REMOTO) return [];
  if (cachePessoas) return cachePessoas;
  const { data, error } = await supabase.rpc("pessoas_da_guipa");
  if (error) return [];
  cachePessoas = data || [];
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
     por título que existe no banco. */
  const q = existente
    ? supabase.from("biblioteca_prompts").update(linha).eq("id", existente.id)
    : supabase.from("biblioteca_prompts").insert({ ...linha, criado_por: quem || "" });
  const { error } = await q;
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregarRemoto();
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
      const { error } = await supabase.from("cartoes").insert({
        quadro_id: quadroId, lista_id: listaId, titulo, ordem,
      });
      if (error) definir({ erro: explicarErro(error) });
      else await carregarRemoto();
    },

    async atualizarTarefa(t) {
      if (!REMOTO) {
        local({ demandas: atual().demandas.map((x) => (x.id === t.id ? t : x)) });
        return;
      }
      const { error } = await supabase
        .from("cartoes")
        .update({
          titulo: t.titulo, solicitante: t.solicitante || "",
          prazo: t.prazo || null, prioridade: t.prioridade || "normal",
          notas: t.notas || "", lista_id: t.status,
        })
        .eq("id", t.id);
      if (error) definir({ erro: explicarErro(error) });
      else await carregarRemoto();
    },

    async excluirTarefa(id) {
      if (!REMOTO) {
        local({ demandas: atual().demandas.filter((x) => x.id !== id) });
        return;
      }
      const { error } = await supabase.from("cartoes").delete().eq("id", id);
      if (error) definir({ erro: explicarErro(error) });
      else await carregarRemoto();
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
      const { error } = await supabase
        .from("cartoes")
        .update({ lista_id: listaId, ordem })
        .eq("id", id);
      if (error) definir({ erro: explicarErro(error) });
      else await carregarRemoto();
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
      const { error } = await supabase
        .from("listas")
        .insert({ quadro_id: quadroId, nome: "Nova lista", cor, concluida: false, ordem });
      if (error) definir({ erro: explicarErro(error) });
      else await carregarRemoto();
    },

    async atualizarLista(id, patch) {
      if (!REMOTO) {
        local({ listas: atual().listas.map((L) => (L.id === id ? { ...L, ...patch } : L)) });
        return;
      }
      const { error } = await supabase.from("listas").update(patch).eq("id", id);
      if (error) definir({ erro: explicarErro(error) });
      else await carregarRemoto();
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
      const [r1, r2] = await Promise.all([
        supabase.from("listas").update({ ordem: b }).eq("id", arr[i].id),
        supabase.from("listas").update({ ordem: a }).eq("id", arr[j].id),
      ]);
      const err = r1.error || r2.error;
      if (err) definir({ erro: explicarErro(err) });
      else await carregarRemoto();
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
        const rs = await Promise.all(
          fila.map((L, k) => supabase.from("listas").update({ ordem: k }).eq("id", L.id))
        );
        const e = rs.find((r) => r.error);
        if (e) definir({ erro: explicarErro(e.error) });
        else await carregarRemoto();
        return;
      }

      if (!REMOTO) {
        local({ listas: q.listas.map((L) => (L.id === id ? { ...L, ordem: nova } : L)) });
        return;
      }
      const { error } = await supabase.from("listas").update({ ordem: nova }).eq("id", id);
      if (error) definir({ erro: explicarErro(error) });
      else await carregarRemoto();
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
      if (e1) { definir({ erro: explicarErro(e1) }); return; }
      const { error: e2 } = await supabase.from("listas").delete().eq("id", id);
      if (e2) definir({ erro: explicarErro(e2) });
      else await carregarRemoto();
    },
  };
}
