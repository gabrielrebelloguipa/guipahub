import { useSyncExternalStore } from "react";
import { subscrever, pegarEstado } from "./auth.js";

/* Ponte entre a loja de auth (que não sabe o que é React) e os
   componentes. Fica num arquivo à parte para o auth.js continuar
   importável por qualquer coisa, inclusive um teste sem React. */
export function useAuth() {
  return useSyncExternalStore(subscrever, pegarEstado, pegarEstado);
}
