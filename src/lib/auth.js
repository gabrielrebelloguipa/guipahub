/* Login com conta @guipabrasil.com, via Supabase Auth + provedor Google.

   Por que o Supabase emite a sessão, e não o Google direto: existe banco
   compartilhado agora, e o Postgres precisa saber QUEM está chamando para
   decidir o que cada um lê e escreve. Um token que só o navegador entende
   não serve para isso — as políticas de RLS leem o e-mail de dentro do
   token do Supabase.

   O acesso ao Drive continua sendo do Google: o Supabase devolve o
   `provider_token` junto com a sessão, e é ele que vai no Authorization
   das chamadas ao Drive.

   ⚠ Assimetria que vale saber: o Supabase renova a sessão DELE sozinho,
   mas NÃO renova o provider_token do Google — esse vence em ~1h. Quando
   isso acontece, a aba Clientes pede para entrar de novo. O resto do app
   continua funcionando normalmente, porque só o Drive depende dele.

   A interface deste arquivo é a mesma de antes (pedirToken, comToken,
   sair, useAuth…), de propósito: os cinco arquivos que dependem dele não
   mudaram uma linha. */

import { DOMINIO_OK } from "../config.js";
import { supabase, temSupabase } from "./supabase.js";

const ESCOPOS_DRIVE = "https://www.googleapis.com/auth/drive.readonly";
const PROVIDER_TOKEN_KEY = "guipahub_provider_token";

/* ---------- estado observável ---------- */

let estado = {
  perfil: null,
  entrando: false,
  erro: "",
  /* null = ainda não verificado · true = lê o Drive · false = entrou mas
     o acesso ao Drive não veio junto */
  acessoDrive: null,
  verificando: false,
  /* o token do Google venceu e a renovação não resolveu */
  expirou: false,
};

const ouvintes = new Set();

export function subscrever(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
export function pegarEstado() {
  return estado;
}
function mudar(patch) {
  estado = { ...estado, ...patch };
  ouvintes.forEach((fn) => fn());
}

/* ---------- token do Google (fora do estado de tela) ---------- */

/* Fica fora do estado observável: muda sozinho e não tem nada a ver com
   o que é desenhado. Se entrasse lá, cada renovação redesenharia o app. */
let providerToken = lerProviderToken();

function lerProviderToken() {
  try {
    return sessionStorage.getItem(PROVIDER_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

/* sessionStorage e não localStorage: o token do Drive morre quando a aba
   fecha, que é o comportamento certo para credencial de curta duração. */
function guardarProviderToken(t) {
  providerToken = t || "";
  try {
    if (t) sessionStorage.setItem(PROVIDER_TOKEN_KEY, t);
    else sessionStorage.removeItem(PROVIDER_TOKEN_KEY);
  } catch {
    /* sem sessionStorage o token vale só enquanto a página estiver aberta */
  }
}

export function pegarToken() {
  return providerToken;
}
export function temSessao() {
  return !!estado.perfil;
}
export function tokenValido() {
  return !!providerToken;
}

export function marcarVerificando(v) {
  mudar({ verificando: v });
}
export function marcarAcessoDrive(v) {
  mudar({ acessoDrive: v });
}

function iniciaisDe(nome, email) {
  const base = String(nome || email || "?").trim();
  const p = base.split(/\s+/);
  const a = (p[0] || "?")[0] || "?";
  const b = p.length > 1 ? (p[p.length - 1] || "")[0] || "" : "";
  return (a + b).toUpperCase();
}

function perfilDaSessao(sessao) {
  const u = sessao?.user;
  if (!u) return null;
  const email = String(u.email || "").toLowerCase();
  const nome = u.user_metadata?.full_name || u.user_metadata?.name || email;
  return {
    nome,
    email,
    foto: u.user_metadata?.avatar_url || "",
    iniciais: iniciaisDe(nome, email),
  };
}

/* ---------- entrar e sair ---------- */

export async function pedirToken(silencioso, depois) {
  if (!temSupabase()) {
    mudar({ erro: "Supabase não configurado. Preencha src/config.js." });
    return;
  }

  /* No silencioso não se abre janela nenhuma: só se olha se já existe
     sessão. É o caminho de quem reabre o site já logado. */
  if (silencioso) {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      aplicarSessao(data.session);
      if (depois) depois();
    } else if (estado.perfil) {
      mudar({ expirou: true });
    }
    return;
  }

  mudar({ entrando: true, erro: "" });

  /* `hd` restringe o seletor de contas ao domínio, e `prompt: consent`
     garante que a autorização do Drive seja pedida de novo quando o
     provider_token tiver vencido. */
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: ESCOPOS_DRIVE,
      queryParams: { hd: DOMINIO_OK, prompt: "consent", access_type: "offline" },
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    mudar({ entrando: false, erro: "Não consegui abrir o login: " + error.message });
  }
  /* Sem erro, o navegador sai da página para o Google e volta depois —
     quem trata a volta é o onAuthStateChange lá embaixo. */
}

export function comToken(fn) {
  if (tokenValido()) {
    if (estado.expirou) mudar({ expirou: false });
    fn();
    return;
  }
  /* Sem token do Drive não adianta tentar renovar em silêncio: o Supabase
     não renova provider_token. Marca como expirado e deixa a interface
     oferecer o botão de entrar de novo. */
  mudar({ expirou: true });
}

export async function sair() {
  guardarProviderToken("");
  try {
    await supabase?.auth.signOut();
  } catch {
    /* mesmo falhando o signOut remoto, a sessão local já foi embora */
  }
  mudar({
    perfil: null,
    erro: "",
    acessoDrive: null,
    verificando: false,
    expirou: false,
  });
}

/* ---------- a volta do Google ---------- */

/* O domínio é conferido aqui, depois de saber quem entrou de fato — o
   `hd` do Google é dica para o seletor de contas, não garantia. A trava
   dura é a tela de consentimento estar como "Interno"; isto aqui existe
   para dar uma mensagem clara em vez de um erro de banco. */
function aplicarSessao(sessao) {
  const perfil = perfilDaSessao(sessao);
  if (!perfil) return;

  if (!perfil.email.endsWith("@" + DOMINIO_OK)) {
    supabase.auth.signOut();
    guardarProviderToken("");
    mudar({
      perfil: null,
      entrando: false,
      erro:
        `A conta ${perfil.email} não é do domínio @${DOMINIO_OK}. ` +
        "Entre com o seu e-mail da GUIPA.",
    });
    return;
  }

  if (sessao.provider_token) guardarProviderToken(sessao.provider_token);

  mudar({
    perfil,
    entrando: false,
    erro: "",
    expirou: !providerToken,
  });
}

export function restaurarSessao() {
  if (!temSupabase()) return;

  supabase.auth.getSession().then(({ data }) => {
    if (data?.session) aplicarSessao(data.session);
  });

  /* Dispara na volta do Google (SIGNED_IN), na renovação da sessão e no
     logout. É por aqui que a sessão entra depois do redirecionamento. */
  supabase.auth.onAuthStateChange((evento, sessao) => {
    if (evento === "SIGNED_OUT") {
      guardarProviderToken("");
      mudar({ perfil: null, acessoDrive: null, expirou: false });
      return;
    }
    if (sessao) aplicarSessao(sessao);
  });
}
