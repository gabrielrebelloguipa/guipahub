/* Cliente do Supabase.

   Fica atrás de um "está configurado?" de propósito: enquanto o projeto
   não existir, o app continua funcionando com localStorage em vez de
   quebrar. Isso deixa dá para desenvolver e demonstrar sem depender de
   conta nenhuma, e a troca acontece só preenchendo o config. */

import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config.js";

export function temSupabase() {
  return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
}

/* A anon key vai dentro do JavaScript do site — qualquer pessoa consegue
   lê-la, e isso é por design. O que protege o banco NÃO é ela ser
   secreta: são as políticas de acesso (RLS) do schema.sql, que exigem
   sessão com e-mail @guipabrasil.com. Se o RLS não estiver ligado, o
   banco está aberto para a internet. */
export const supabase = temSupabase()
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/* Erro do Postgres vem com código e mensagem técnica. Traduzir os poucos
   que a pessoa pode causar evita "violates row-level security policy"
   na cara de quem só queria salvar uma marca. */
export function explicarErro(e) {
  if (!e) return "";
  const cod = e.code || "";
  const msg = e.message || "erro desconhecido";

  if (cod === "23505" || /duplicate key/i.test(msg)) {
    if (/marcas_nome_unico/.test(msg))
      return "Já existe uma marca com esse nome.";
    if (/biblioteca_titulo_unico/.test(msg))
      return "Já existe um prompt com esse título na biblioteca.";
    return "Esse registro já existe.";
  }
  if (cod === "42501" || /row-level security/i.test(msg)) {
    return (
      "O banco recusou a operação. Confira se você entrou com a conta " +
      "@guipabrasil.com — o acesso é liberado por domínio."
    );
  }
  if (/JWT|not authenticated/i.test(msg)) {
    return "Sua sessão caiu. Entre de novo.";
  }
  return msg;
}
