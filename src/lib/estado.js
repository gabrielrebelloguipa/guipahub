/* Estado da aplicação que mora no navegador de cada pessoa.

   Atenção ao alcance: isto é localStorage, por navegador. O que cada um
   cadastra aqui não aparece para mais ninguém. Só a aba Clientes é
   compartilhada de verdade, porque ela não guarda nada — lê o Drive.

   Mesma forma do auth.js: uma loja observável, sem React, ligada aos
   componentes por useSyncExternalStore. */

import { useSyncExternalStore } from "react";

const CHAVE = "guipahub_v1";

/* Colunas iniciais = o fluxo de trabalho padrão do time de design.
   São só o ponto de partida: dá para renomear, reordenar, apagar e criar
   outras direto no quadro. As colunas são dados, não código — o campo
   `status` de cada cartão guarda o id da coluna em que ele está. */
const LISTAS_PADRAO = [
  { id: "l_pend", nome: "Pendentes", cor: "#c78b2b", concluida: false },
  { id: "l_faz", nome: "Em andamento", cor: "#4f8fdb", concluida: false },
  { id: "l_agu", nome: "Em validação", cor: "#8a6fc4", concluida: false },
  { id: "l_hold", nome: "On hold", cor: "#8b8d85", concluida: false },
  { id: "l_fim", nome: "Concluído", cor: "#5fae5a", concluida: true },
];

/* Nomes antigos das colunas padrão. Quem já usava o app tem as colunas
   gravadas no próprio navegador, então trocar o padrão acima só valeria
   para quem chegasse agora. Renomeia na carga — mas só a coluna que
   ainda tem o id E o nome antigos: se a pessoa já tinha renomeado por
   conta própria, o nome dela fica. */
const NOMES_ANTIGOS = {
  l_faz: "Fazendo",
  l_agu: "Aguardando resposta",
  l_hold: "On Hold",
  l_fim: "Finalizadas",
};
function atualizarNomesDeColuna(listas) {
  if (!Array.isArray(listas)) return listas;
  return listas.map((L) => {
    if (NOMES_ANTIGOS[L.id] && L.nome === NOMES_ANTIGOS[L.id]) {
      const novo = LISTAS_PADRAO.find((x) => x.id === L.id);
      return novo ? { ...L, nome: novo.nome } : L;
    }
    return L;
  });
}

const ATALHOS_PADRAO = [
  { id: "a_drive", nome: "Google Drive", url: "https://drive.google.com", grupo: "Trabalho" },
  { id: "a_gmail", nome: "Gmail", url: "https://mail.google.com", grupo: "Trabalho" },
  { id: "a_wa", nome: "WhatsApp Web", url: "https://web.whatsapp.com", grupo: "Trabalho" },
  { id: "a_gpt", nome: "ChatGPT", url: "https://chatgpt.com", grupo: "IA" },
  { id: "a_claude", nome: "Claude", url: "https://claude.ai", grupo: "IA" },
  { id: "a_pin", nome: "Pinterest", url: "https://pinterest.com", grupo: "Referência" },
  { id: "a_be", nome: "Behance", url: "https://behance.net", grupo: "Referência" },
];

/* Nasce sem tarefa nenhuma. O GuipaHub é multiusuário: semear o quadro
   com as tarefas de uma pessoa entregaria o trabalho dela (e os clientes
   citados) para todo mundo que fizesse login. */
export function semente() {
  return {
    demandas: [],
    listas: LISTAS_PADRAO,
    prompts: [],
    atalhos: ATALHOS_PADRAO,
    central: [],
    guias: [],
    imagensGuipa: [],
    filtroStatus: [],
    filtroCat: "",
    filtroPromptCat: "",
    demandaVista: "quadro",
    /* "pessoal" = o quadro de quem usa · "empresas" = o quadro de uma
       marca, que e compartilhado. A escolha e preferencia de tela, entao
       fica no estado pessoal mesmo quando o quadro olhado e do time. */
    kanbanModo: "pessoal",
    kanbanMarcaId: "",
    hojeOrdem: ["panorama", "prazos", "atalhos", "prompts"],
    centralAba: "materiais",
  };
}

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const base = semente();
    if (!bruto) return base;
    const salvo = JSON.parse(bruto);
    /* Chave nova numa versão posterior entra com o conteúdo semeado, não
       vazia — senão quem já usava o app abriria a aba nova em branco. */
    const juntos = { ...base, ...salvo };
    return { ...juntos, listas: atualizarNomesDeColuna(juntos.listas) };
  } catch {
    return semente();
  }
}

let estado = carregar();
const ouvintes = new Set();

function avisar() {
  ouvintes.forEach((fn) => fn());
}

export function subscrever(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
export function pegarEstado() {
  return estado;
}

let avisouEstouro = false;

/* Falha ao salvar tem que aparecer. O limite do localStorage é de poucos
   megabytes, e engolir o erro faria perder trabalho sem avisar. */
export function alterar(patch) {
  estado = { ...estado, ...(typeof patch === "function" ? patch(estado) : patch) };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
    avisouEstouro = false;
  } catch (e) {
    const cheio =
      e?.name === "QuotaExceededError" ||
      e?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      e?.code === 22;
    if (!avisouEstouro) {
      avisouEstouro = true;
      alert(
        cheio
          ? "NÃO FOI POSSÍVEL SALVAR: o armazenamento do navegador encheu.\n\n" +
              "Exporte os dados pelo menu do usuário e remova anexos grandes.\n\n" +
              "Até lá, nada novo está sendo gravado."
          : "NÃO FOI POSSÍVEL SALVAR: " + (e?.message || "erro desconhecido")
      );
    }
  }
  avisar();
}

export function limparTudo() {
  estado = semente();
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    /* se não salvou, ao menos a sessão atual já está limpa */
  }
  avisar();
}

export function useEstado() {
  return useSyncExternalStore(subscrever, pegarEstado, pegarEstado);
}

export function uid(prefixo) {
  return prefixo + "_" + Math.random().toString(36).slice(2, 9);
}

export function statusInfo(estadoAtual, id) {
  const L = (estadoAtual.listas || []).find((x) => x.id === id);
  if (!L)
    return { key: "", label: "sem lista", color: "var(--border)", concluida: false };
  return { key: L.id, label: L.nome, color: L.cor, concluida: !!L.concluida };
}
