/* Login com conta @guipabrasil.com, sem servidor.

   Por que sem backend: o Workspace já é a fonte de verdade. Cada pessoa
   entra com a conta dela, o site recebe um token DAQUELA pessoa e lê o
   Drive como ela. Não existe conta de serviço, senha guardada nem login
   de ninguém embutido no código — se quem montou o site sair da empresa,
   o site continua de pé.

   Consequência boa e deliberada: a permissão é a do Drive. Quem não
   enxerga a pasta de um cliente lá não enxerga aqui.

   Este arquivo não sabe que existe React. Ele mantém um estado e avisa
   quem estiver ouvindo — o componente se conecta por useSyncExternalStore.
   Foi feito assim de propósito: é a camada que menos deve mudar se um dia
   a interface for reescrita de novo. */

import { CONFIG, DOMINIO_OK } from "../config.js";

const GSI_SRC = "https://accounts.google.com/gsi/client";
const ESCOPO =
  "openid email profile https://www.googleapis.com/auth/drive.readonly";
const SESSAO_KEY = "guipahub_sessao";
const CLIENT_ID_KEY = "guipahub_client_id";
/* A biblioteca do Google nem sempre chama o callback de volta quando o
   pedido silencioso falha (Client ID inválido, consentimento revogado).
   Sem um limite, a pessoa ficaria clicando sem entender por que nada
   acontece. */
const LIMITE_SILENCIOSO = 8000;

/* ---------- estado observável ---------- */

let estado = {
  perfil: null,
  entrando: false,
  erro: "",
  /* null = ainda não verificado · true = lê o Drive · false = entrou mas
     não autorizou o Drive (dá para negar só esse acesso na tela do Google) */
  acessoDrive: null,
  verificando: false,
  /* a sessão caiu no meio do uso e a renovação silenciosa não resolveu */
  expirou: false,
  clientId: CONFIG.clientId || lerClientIdLocal(),
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

/* ---------- o que não é estado de tela ---------- */

/* Token e temporizador ficam fora do estado observável: mudam sozinhos e
   não têm nada a ver com o que é desenhado. Se entrassem lá, cada
   renovação de token redesenharia a aplicação inteira à toa. */
let token = "";
let expiraEm = 0;
let tokenClient = null;
let aoAutenticar = null;
let limite = 0;

export function temSessao() {
  return !!estado.perfil;
}
export function tokenValido() {
  return !!token && Date.now() < expiraEm - 60000;
}
export function pegarToken() {
  return token;
}

function lerClientIdLocal() {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) || "";
  } catch {
    return "";
  }
}
export function definirClientId(valor) {
  const v = String(valor || "").trim();
  try {
    localStorage.setItem(CLIENT_ID_KEY, v);
  } catch {
    /* navegador sem localStorage: vale só nesta sessão */
  }
  tokenClient = null; /* client id novo exige cliente novo */
  mudar({ clientId: v, erro: "" });
}

function iniciaisDe(nome, email) {
  const base = String(nome || email || "?").trim();
  const p = base.split(/\s+/);
  const a = (p[0] || "?")[0] || "?";
  const b = p.length > 1 ? (p[p.length - 1] || "")[0] || "" : "";
  return (a + b).toUpperCase();
}

/* Só o perfil é persistido, nunca o token: token de acesso vale 1h e
   guardar credencial em localStorage é pedir para vazar. Na volta, o
   Google devolve um token novo sem popup se o consentimento ainda vale —
   é isso que faz o "deixar logado" acontecer. */
function salvarSessao(perfil) {
  try {
    localStorage.setItem(SESSAO_KEY, JSON.stringify(perfil));
  } catch {
    /* sem persistência: a sessão vale só até fechar a aba */
  }
}
export function restaurarSessao() {
  try {
    const p = JSON.parse(localStorage.getItem(SESSAO_KEY) || "null");
    if (p && p.email) mudar({ perfil: p });
  } catch {
    /* json corrompido: começa deslogado, sem drama */
  }
}

export function sair() {
  if (token) {
    try {
      window.google?.accounts?.oauth2?.revoke(token, () => {});
    } catch {
      /* revogar é cortesia; o que importa é esquecer o token aqui */
    }
  }
  token = "";
  expiraEm = 0;
  clearTimeout(limite);
  try {
    localStorage.removeItem(SESSAO_KEY);
  } catch {
    /* nada a fazer */
  }
  mudar({
    perfil: null,
    erro: "",
    acessoDrive: null,
    verificando: false,
    expirou: false,
  });
}

/* ---------- biblioteca do Google ---------- */

function carregarGsi() {
  return new Promise((ok, falha) => {
    if (window.google?.accounts?.oauth2) return ok();
    const existente = document.getElementById("gsiScript");
    if (existente) {
      existente.addEventListener("load", () => ok());
      existente.addEventListener("error", () => falha(new Error("gsi")));
      return;
    }
    const s = document.createElement("script");
    s.id = "gsiScript";
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => ok();
    s.onerror = () => falha(new Error("gsi"));
    document.head.appendChild(s);
  });
}

/* Um pedido de token por vez. Sem isto, o StrictMode do React (que
   monta o efeito duas vezes em desenvolvimento) dispararia dois pedidos
   ao Google e abriria dois popups. */
let pedidoEmVoo = false;

/* silencioso = tenta sem popup, para reabrir o site já logado. */
export async function pedirToken(silencioso, depois) {
  const cid = estado.clientId;
  if (!cid) {
    mudar({ erro: "Falta o Client ID do Google." });
    return;
  }
  if (pedidoEmVoo) return;
  pedidoEmVoo = true;
  aoAutenticar = depois || null;

  try {
    await carregarGsi();
  } catch {
    pedidoEmVoo = false;
    mudar({
      entrando: false,
      erro: "Não consegui carregar o login do Google. Verifique a conexão.",
    });
    return;
  }

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: ESCOPO,
      /* hd é dica para o seletor de contas, não garantia: dá para ignorar
         e escolher outra conta. O domínio é conferido de novo depois. */
      hd: DOMINIO_OK,
      callback: (resp) => {
        pedidoEmVoo = false;
        clearTimeout(limite);
        if (resp.error) {
          /* Falhar em silêncio é esperado quando o consentimento venceu.
             Quem já tinha perfil precisa saber que caiu. */
          if (silencioso) mudar({ entrando: false, expirou: !!estado.perfil });
          else
            mudar({
              entrando: false,
              erro: "Login cancelado ou negado pelo Google.",
            });
          return;
        }
        token = resp.access_token;
        expiraEm = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
        mudar({ entrando: false, expirou: false });
        confirmarConta();
      },
    });
  }

  if (!silencioso) mudar({ entrando: true, erro: "" });

  const pedido = { prompt: silencioso ? "" : "consent" };
  if (estado.perfil) pedido.hint = estado.perfil.email;

  if (silencioso) {
    clearTimeout(limite);
    limite = setTimeout(() => {
      pedidoEmVoo = false;
      if (!tokenValido() && estado.perfil) mudar({ expirou: true });
    }, LIMITE_SILENCIOSO);
  }

  tokenClient.requestAccessToken(pedido);
}

/* O domínio é conferido aqui, depois de saber quem entrou de fato — e não
   pelo hd, que é só uma dica para o seletor de contas do Google. */
async function confirmarConta() {
  let u;
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    u = await r.json();
  } catch (e) {
    mudar({ entrando: false, erro: "Não consegui confirmar a conta: " + e.message });
    return;
  }

  const email = String(u.email || "").toLowerCase();
  if (!email.endsWith("@" + DOMINIO_OK)) {
    try {
      window.google?.accounts?.oauth2?.revoke(token, () => {});
    } catch {
      /* idem */
    }
    token = "";
    expiraEm = 0;
    try {
      localStorage.removeItem(SESSAO_KEY);
    } catch {
      /* nada a fazer */
    }
    mudar({
      perfil: null,
      entrando: false,
      erro:
        (email ? `A conta ${email} não é` : "Essa conta não é") +
        ` do domínio @${DOMINIO_OK}. Entre com o seu e-mail da GUIPA.`,
    });
    return;
  }

  const perfil = {
    nome: u.name || email,
    email,
    foto: u.picture || "",
    iniciais: iniciaisDe(u.name, email),
  };
  salvarSessao(perfil);
  mudar({ perfil, erro: "", expirou: false });

  const seguir = aoAutenticar;
  aoAutenticar = null;
  if (seguir) seguir();
}

/* Garante um token válido antes de qualquer chamada ao Drive. */
export function comToken(fn) {
  if (tokenValido()) {
    if (estado.expirou) mudar({ expirou: false });
    fn();
    return;
  }
  pedirToken(true, fn);
}

/* auth NÃO importa drive: drive já importa auth, e o par circular só se
   sustentava com import dinâmico — que o bundler avisa que não consegue
   separar. Em vez disso, auth expõe onde anotar o resultado, e quem sabe
   falar com o Drive (drive.js) faz a pergunta e anota aqui. */
export function marcarVerificando(v) {
  mudar({ verificando: v });
}
export function marcarAcessoDrive(v) {
  mudar({ acessoDrive: v });
}
