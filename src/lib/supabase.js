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

/* O Supabase devolve no máximo 1000 linhas por consulta — é um teto do
   SERVIDOR, então pedir .range(0, 4999) ainda volta mil — e corta o resto
   sem avisar. Com 272 quadros de 5 colunas são 1360 colunas: as primeiras
   mil, ordenadas por posição, cobriam Pendentes, Em andamento e Em
   validação de todos os quadros, On hold de parte e Concluído de NENHUM.

   Toda tabela que pode passar de mil linhas é lida por aqui, página por
   página, até a última vir incompleta. `montar` precisa devolver uma
   consulta com ordem estável (terminar em .order("id")): sem isso uma
   linha pode se repetir numa página e outra sumir entre duas. */
const PAGINA_BANCO = 1000;
export async function todas(montar) {
  const linhas = [];
  for (let de = 0; ; de += PAGINA_BANCO) {
    const { data, error } = await montar().range(de, de + PAGINA_BANCO - 1);
    if (error) return { data: null, error };
    linhas.push(...(data || []));
    if (!data || data.length < PAGINA_BANCO) return { data: linhas, error: null };
  }
}
