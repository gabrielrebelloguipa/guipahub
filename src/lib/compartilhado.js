/* Dados COMPARTILHADOS: o que uma pessoa cria, todo mundo vê.

   Marcas, a biblioteca de prompts e os quadros de empresa vivem aqui.
   O que é de cada um (kanban pessoal, prompts pessoais, Central) fica em
   estado.js e não se mistura.

   ⚠ HOJE ISTO AINDA É localStorage — ou seja, ainda NÃO é compartilhado
   de verdade. localStorage é por navegador: o que você cria aqui não
   aparece na máquina de mais ninguém.

   Isto é um degrau, não o destino. O arquivo existe separado justamente
   para que a troca por Supabase mexa só aqui: as telas leem por
   useCompartilhado() e não sabem de onde vem. Quando o backend existir,
   `carregar` vira um SELECT e `alterar` vira INSERT/UPDATE — nenhuma aba
   precisa ser reescrita.

   Enquanto isso, a interface avisa que é local, para ninguém cadastrar
   trinta marcas achando que o time está vendo. */

import { useSyncExternalStore } from "react";

const CHAVE = "guipahub_compartilhado_v1";

/* Sugestões, não lista fechada: o campo aceita nicho novo. Servem para
   evitar que "Alimentação", "Alimentício" e "Alimentos" virem três
   nichos diferentes para a mesma coisa. */
export const NICHOS_BASE = [
  "Alimentação", "Bebidas", "Delivery", "Varejo", "Moda", "Beleza",
  "Educação", "Saúde", "Financeiro", "Tecnologia", "Automotivo",
  "Entretenimento", "Esportes", "Imobiliário", "Telecom", "Serviços",
];

function semente() {
  return {
    /* { id, nome, nicho, site, resumo, descricao, logo, criadoPor, criadoEm } */
    marcas: [],
    /* prompts que qualquer um pode importar para a área pessoal */
    biblioteca: [],
    /* { id, marcaId, listas: [], demandas: [] } — um quadro por empresa */
    quadros: [],
  };
}

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const base = semente();
    if (!bruto) return base;
    return { ...base, ...JSON.parse(bruto) };
  } catch {
    return semente();
  }
}

let estado = carregar();
const ouvintes = new Set();

export function subscrever(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
export function pegar() {
  return estado;
}

export function alterar(patch) {
  estado = { ...estado, ...(typeof patch === "function" ? patch(estado) : patch) };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch (e) {
    alert(
      "NÃO FOI POSSÍVEL SALVAR: " +
        (e?.message || "armazenamento cheio") +
        "\n\nO mais provável é logo de marca grande demais."
    );
  }
  ouvintes.forEach((fn) => fn());
}

export function useCompartilhado() {
  return useSyncExternalStore(subscrever, pegar, pegar);
}

export function uid(prefixo) {
  return prefixo + "_" + Math.random().toString(36).slice(2, 9);
}

/* ---------- nichos ---------- */

/* A lista viva = as sugestões de fábrica + tudo que já foi cadastrado.
   Assim o nicho que alguém inventou hoje vira sugestão para o próximo,
   que é o que impede a duplicação de sinônimos ao longo do tempo. */
export function nichosConhecidos(compartilhado) {
  const usados = (compartilhado.marcas || [])
    .map((m) => (m.nicho || "").trim())
    .filter(Boolean);
  const vistos = new Map();
  for (const n of [...NICHOS_BASE, ...usados]) {
    const chave = normaliza(n);
    if (!vistos.has(chave)) vistos.set(chave, n);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function normaliza(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/* ---------- marcas ---------- */

/* Todos obrigatórios menos a logo — foi o pedido, e faz sentido: marca
   sem resumo e sem descrição não serve para quem chega depois e precisa
   entender o cliente sem perguntar a ninguém. */
export const CAMPOS_MARCA = [
  { key: "nome", label: "Nome", obrigatorio: true },
  { key: "nicho", label: "Nicho", obrigatorio: true },
  { key: "site", label: "Site", obrigatorio: true },
  { key: "resumo", label: "Resumo", obrigatorio: true },
  { key: "descricao", label: "Descrição completa", obrigatorio: true },
  { key: "logo", label: "Logo", obrigatorio: false },
];

export function validarMarca(m) {
  const faltando = CAMPOS_MARCA.filter(
    (c) => c.obrigatorio && !String(m[c.key] || "").trim()
  ).map((c) => c.label);
  return faltando;
}

export function marcaPorId(compartilhado, id) {
  return (compartilhado.marcas || []).find((m) => m.id === id) || null;
}

/* ---------- quadros de empresa ---------- */

export const LISTAS_PADRAO = [
  { id: "l_pend", nome: "Pendentes", cor: "#c78b2b", concluida: false },
  { id: "l_faz", nome: "Fazendo", cor: "#4f8fdb", concluida: false },
  { id: "l_agu", nome: "Aguardando resposta", cor: "#8a6fc4", concluida: false },
  { id: "l_hold", nome: "On Hold", cor: "#8b8d85", concluida: false },
  { id: "l_fim", nome: "Finalizadas", cor: "#5fae5a", concluida: true },
];

export function quadroDaMarca(compartilhado, marcaId) {
  return (compartilhado.quadros || []).find((q) => q.marcaId === marcaId) || null;
}

/* Quadro novo nasce com as mesmas colunas do pessoal — ponto de partida
   conhecido, e cada empresa edita as suas depois. */
export function criarQuadro(marcaId, quem) {
  alterar((e) => ({
    quadros: [
      ...e.quadros,
      {
        id: uid("q"),
        marcaId,
        listas: LISTAS_PADRAO.map((l) => ({ ...l })),
        demandas: [],
        criadoPor: quem || "",
        criadoEm: new Date().toISOString().slice(0, 10),
      },
    ],
  }));
}

/* Toda escrita num quadro passa por aqui: recebe o quadro atual e devolve
   o novo. Centralizar evita que cada tela reimplemente o "achar o quadro
   certo dentro do array" — que é onde se erra e se sobrescreve o quadro
   de outra empresa. */
export function alterarQuadro(quadroId, fn) {
  alterar((e) => ({
    quadros: e.quadros.map((q) => (q.id === quadroId ? { ...q, ...fn(q) } : q)),
  }));
}
