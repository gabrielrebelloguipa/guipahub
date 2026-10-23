import { useSyncExternalStore } from "react";
import { useAuth } from "./useAuth.js";
import { usePermissoes, ABAS, abasDe } from "./permissoes.js";

/* O menu da barra lateral de cada pessoa: as abas que ela pode ver, na
   ordem que ela escolheu em Configurações › Ordem do menu. A ordem é
   gosto pessoal, como o tema, então fica no navegador de cada um, por
   e-mail (dois logins no mesmo computador não brigam pela ordem).

   Configurações fica sempre por último e fora da ordenação: é onde se
   muda a ordem, e não pode sumir lá para o meio. */

export const ABA_CONFIG = { key: "config", label: "Configurações", ico: "⚙" };

const CHAVE = "guipahub_ordem_menu:";
const ouvintes = new Set();

function bruto(email) {
  try {
    return localStorage.getItem(CHAVE + (email || "")) || "";
  } catch {
    return "";
  }
}

function lerOrdem(txt) {
  try {
    const v = JSON.parse(txt || "null");
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/* `null` volta para a ordem padrão. */
export function salvarOrdem(email, chaves) {
  try {
    if (chaves) localStorage.setItem(CHAVE + email, JSON.stringify(chaves));
    else localStorage.removeItem(CHAVE + email);
  } catch {
    /* sem localStorage: a ordem vale só até recarregar */
  }
  ouvintes.forEach((f) => f());
}

/* Aba que não está na ordem salva (nova, ou liberada depois) entra no
   fim, na posição relativa que tem na ordem padrão. */
export function ordenar(lista, ordem) {
  if (!ordem) return lista;
  const pos = (k) => {
    const i = ordem.indexOf(k);
    return i >= 0 ? i : 1000 + lista.findIndex((a) => a.key === k);
  };
  return [...lista].sort((a, b) => pos(a.key) - pos(b.key));
}

/* Lista pronta para desenhar: permitidas, ordenadas, Configurações no fim. */
export function useMenu() {
  const auth = useAuth();
  const email = auth.perfil?.email || "";
  const { eu, abasPadrao, permissoesPadrao } = usePermissoes();
  const txt = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => bruto(email)
  );
  const visiveis = abasDe(eu, abasPadrao, permissoesPadrao);
  const abas = ordenar(
    ABAS.filter((a) => visiveis.includes(a.key)),
    lerOrdem(txt)
  );
  return { abas, todas: [...abas, ABA_CONFIG], personalizada: !!lerOrdem(txt), email };
}
