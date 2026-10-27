/* Calendário Comercial: os itens de cada mês, no banco
   (23-calendario-comercial.sql). Mesma forma da central.js: loja
   observável ligada aos componentes por useSyncExternalStore, recarga
   por tempo real. Só carrega quando a aba é aberta pela primeira vez. */

import { useSyncExternalStore } from "react";
import { supabase, temSupabase, explicarErro, todas } from "./supabase.js";

/* As linhas do calendário, na ordem do PPT do comercial. */
export const CATEGORIAS = [
  { key: "foco", label: "Foco do mês" },
  { key: "sazonal", label: "Datas sazonais" },
  { key: "feira", label: "Feiras & eventos" },
  { key: "show", label: "Shows & esporte" },
  { key: "mkt", label: "Marketing GUIPA" },
  { key: "pr", label: "PR / Mídia" },
];

let estado = { itens: [], carregando: true, erro: "" };
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
export function useCalendario() {
  return useSyncExternalStore(subscrever, pegar, pegar);
}

async function carregar() {
  if (!temSupabase()) {
    definir({ carregando: false, erro: "Supabase não configurado." });
    return;
  }
  const r = await todas(() =>
    supabase
      .from("calendario_itens")
      .select("*")
      .order("mes")
      .order("ordem")
      .order("criado_em")
      .order("id")
  );
  if (r.error) {
    definir({ carregando: false, erro: explicarErro(r.error) });
    return;
  }
  definir({ itens: r.data || [], carregando: false, erro: "" });
}

let iniciado = false;
export function iniciarCalendario() {
  if (iniciado) return;
  iniciado = true;
  carregar();
  if (!supabase) return;
  supabase
    .channel("guipahub-calendario")
    .on("postgres_changes", { event: "*", schema: "public", table: "calendario_itens" }, () =>
      carregar()
    )
    .subscribe();
}

async function feito(promessa) {
  const { error } = await promessa;
  if (error) return { ok: false, erro: explicarErro(error) };
  await carregar();
  return { ok: true };
}

/* Item novo entra no fim da célula (mês + categoria). Mudar de célula
   também leva para o fim da nova. */
function proximaOrdem(mes, categoria, semId) {
  const da = estado.itens.filter((i) => i.mes === mes && i.categoria === categoria && i.id !== semId);
  return da.length ? Math.max(...da.map((i) => i.ordem)) + 1 : 0;
}

export function salvarItem(item) {
  const linha = {
    mes: item.mes,
    categoria: item.categoria,
    titulo: item.titulo.trim(),
    atualizado_em: new Date().toISOString(),
  };
  if (!item.id) {
    return feito(
      supabase
        .from("calendario_itens")
        .insert({ ...linha, ordem: proximaOrdem(item.mes, item.categoria) })
    );
  }
  const antes = estado.itens.find((i) => i.id === item.id);
  if (antes && (antes.mes !== item.mes || antes.categoria !== item.categoria)) {
    linha.ordem = proximaOrdem(item.mes, item.categoria, item.id);
  }
  return feito(supabase.from("calendario_itens").update(linha).eq("id", item.id));
}

export function excluirItem(id) {
  return feito(supabase.from("calendario_itens").delete().eq("id", id));
}
