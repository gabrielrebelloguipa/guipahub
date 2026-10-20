import { useSyncExternalStore } from "react";

/* Tema: claro, escuro ou o do navegador. Mora fora do React porque mexe
   no <html>, que é território de fora da árvore de componentes. Fica no
   localStorage de cada um: tema é gosto pessoal, não configuração do time. */
const TEMA_KEY = "guipahub_tema";
const escuroNoSistema = window.matchMedia("(prefers-color-scheme: dark)");
const ouvintes = new Set();

let tema = "sistema";
try {
  tema = localStorage.getItem(TEMA_KEY) || "sistema";
} catch {
  /* sem localStorage: segue o navegador */
}

export function aplicarTema() {
  const escuro = tema === "dark" || (tema === "sistema" && escuroNoSistema.matches);
  document.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
}

export function definirTema(novo) {
  tema = novo;
  try {
    localStorage.setItem(TEMA_KEY, novo);
  } catch {
    /* só não lembra na próxima visita */
  }
  aplicarTema();
  ouvintes.forEach((f) => f());
}

escuroNoSistema.addEventListener("change", aplicarTema);

export function useTema() {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => tema
  );
}
