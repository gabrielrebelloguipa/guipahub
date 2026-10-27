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
const RENOVOU_KEY = "guipahub_renovou_drive";

/* O Google nao diz quando o token vence junto com ele; o padrao e uma
   hora. Guardamos 55 minutos para nunca usar um token morto achando que
   esta vivo -- o Drive responderia 401 e a pessoa veria erro em vez de
   uma renovacao silenciosa. */
const VIDA_TOKEN_MS = 55 * 60 * 1000;

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


/* localStorage e nao sessionStorage. A escolha anterior era mais segura
   no papel -- o token morria junto com a aba -- e horrivel na pratica:
   fechar o navegador e voltar dez minutos depois exigia login novo,
   mesmo com o token ainda valido. Como ele vence em uma hora de
   qualquer jeito, a janela de exposicao e praticamente a mesma; o que
   muda e nao obrigar a pessoa a reentrar varias vezes por dia.

   Guardado junto com o instante de validade, para saber se ainda serve
   sem ter que perguntar ao Google. */
/* ⚠ O BUG QUE ISTO EVITA.

   O Supabase guarda o token do Google dentro da sessão dele e o devolve
   a cada recarga da página — sempre o MESMO, o da última ida ao Google.
   Ele não renova esse token. A versão anterior regravava o token a cada
   recarga com validade nova de 55 minutos: um token que o Google já
   tinha matado ganhava vida nova no app, e a primeira chamada ao Drive
   voltava "Request had invalid authentication credentials".

   Por isso: a validade conta da PRIMEIRA vez que o token é visto, e um
   token que venceu ou que o Drive recusou fica marcado como morto. O
   Supabase pode devolvê-lo quantas vezes quiser — morto não volta. */
const MORTO_KEY = "guipahub_token_morto";

/* Só o fim do token, como impressão digital. Guardar o token inteiro de
   um token morto seria guardar credencial sem motivo. */
function digital(t) {
  return String(t || "").slice(-24);
}
function marcarMorto(t) {
  if (!t) return;
  try {
    localStorage.setItem(MORTO_KEY, digital(t));
  } catch {
    /* sem localStorage, a proteção vale só nesta aba */
  }
}
function estaMorto(t) {
  try {
    return !!t && localStorage.getItem(MORTO_KEY) === digital(t);
  } catch {
    return false;
  }
}

function lerProviderToken() {
  try {
    const bruto = localStorage.getItem(PROVIDER_TOKEN_KEY);
    if (!bruto) return "";
    const { t, exp } = JSON.parse(bruto);
    if (!t || !exp || Date.now() >= exp || estaMorto(t)) {
      marcarMorto(t);
      localStorage.removeItem(PROVIDER_TOKEN_KEY);
      return "";
    }
    return t;
  } catch {
    return "";
  }
}

/* Devolve true se o token foi aceito como bom. */
function guardarProviderToken(t) {
  if (t && estaMorto(t)) {
    providerToken = "";
    try {
      localStorage.removeItem(PROVIDER_TOKEN_KEY);
    } catch {
      /* nada a limpar */
    }
    return false;
  }
  providerToken = t || "";
  try {
    if (t) {
      /* Mesmo token já guardado: mantém a validade de quando foi visto
         pela primeira vez, não estica. */
      let exp = Date.now() + VIDA_TOKEN_MS;
      const g = JSON.parse(localStorage.getItem(PROVIDER_TOKEN_KEY) || "null");
      if (g && g.t === t && g.exp) exp = g.exp;
      localStorage.setItem(PROVIDER_TOKEN_KEY, JSON.stringify({ t, exp }));
    } else {
      localStorage.removeItem(PROVIDER_TOKEN_KEY);
    }
  } catch {
    /* sem localStorage o token vale só enquanto a página estiver aberta */
  }
  return !!t;
}

/* O Drive recusou o token (401). Vale mais que qualquer relógio nosso:
   marca como morto e vai buscar um novo, sem perguntar nada. */
/* O Drive recusou: o token não serve mais, mas ainda sem decidir como
   renovar (quem chama tenta em silêncio primeiro). */
export function marcarTokenVencido() {
  marcarMorto(providerToken);
  guardarProviderToken("");
}

export function tokenRecusado() {
  marcarMorto(providerToken);
  guardarProviderToken("");
  renovarEmSilencio().then((ok) => {
    if (ok) return mudar({ expirou: false });
    mudar({ expirou: true });
    renovarAcessoDrive();
  });
}

/* ---------- renovação sem ida ao Google ---------- */

/* A função drive-token (supabase/functions) guarda o refresh token de
   cada pessoa e troca por um acesso novo com o segredo do cliente Google,
   que não pode morar aqui. Sem piscar: é uma chamada comum.

   Falhando (pessoa sem refresh token guardado, acesso retirado no
   Google, função fora do ar), o caminho antigo continua valendo: uma ida
   ao Google. Se o motivo foi não ter refresh token, essa ida pede o
   consentimento, que é o que faz o Google entregar um — uma vez só. */
const REFRESH_ENVIADO_KEY = "guipahub_refresh_enviado";
let pedirConsentimento = false;
let renovando = null;

export function renovarEmSilencio() {
  if (!supabase || !temSessao()) return Promise.resolve(false);
  if (renovando) return renovando;
  renovando = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("drive-token", { body: {} });
      if (error || !data?.access_token) {
        let motivo = "";
        try {
          motivo = (await error?.context?.json())?.erro || "";
        } catch {
          /* resposta sem corpo: motivo desconhecido */
        }
        pedirConsentimento = motivo === "sem_token" || motivo === "invalid_grant";
        return false;
      }
      return guardarProviderToken(data.access_token);
    } catch {
      return false;
    } finally {
      setTimeout(() => (renovando = null), 0);
    }
  })();
  return renovando;
}

/* O refresh token só vem na volta do Google, e só quando a pessoa
   consente. Vai direto para a função e não fica no navegador. */
function guardarRefresh(rt) {
  try {
    if (localStorage.getItem(REFRESH_ENVIADO_KEY) === digital(rt)) return;
  } catch {
    /* sem localStorage: manda de novo, não faz mal */
  }
  supabase.functions.invoke("drive-token", { body: { guardar: rt } }).then(({ error }) => {
    if (error) return;
    try {
      localStorage.setItem(REFRESH_ENVIADO_KEY, digital(rt));
    } catch {
      /* idem */
    }
  });
}

/* Fica fora do estado observável: muda sozinho e não tem nada a ver com
   o que é desenhado. Se entrasse lá, cada renovação redesenharia o app.

   Lido AQUI, e não no topo: lerProviderToken usa MORTO_KEY, que é const
   e só existe a partir da linha em que é declarada. Ler antes disso
   derrubava o módulo inteiro na carga. */
let providerToken = lerProviderToken();

export function pegarToken() {
  return providerToken;
}
export function temSessao() {
  return !!estado.perfil;
}
export function tokenValido() {
  /* Rele do armazenamento em vez de confiar na variavel: com a aba
     aberta por mais de uma hora, a variavel segue preenchida e o token
     ja morreu. */
  if (providerToken && !lerProviderToken()) providerToken = "";
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

/* O projeto Supabase do plano gratuito hiberna depois de semanas parado,
   e volta devolvendo 503 por alguns minutos enquanto sobe. Nesse estado
   o cliente não devolve erro: ele fica tentando renovar a sessão e a
   promessa nunca resolve. Sem prazo, o botão de entrar simplesmente não
   reage — nada acontece, nada é dito, e quem está na frente da tela
   conclui que o site quebrou.

   Daí este prazo. Ele não conserta o servidor; conserta o silêncio. */
const PRAZO_MS = 12000;

function comPrazo(promessa) {
  return Promise.race([
    promessa,
    new Promise((_, falha) =>
      setTimeout(() => falha(new Error("sem resposta")), PRAZO_MS)
    ),
  ]);
}

const FORA_DO_AR =
  "O servidor não respondeu. Isso costuma ser o banco de dados saindo de " +
  "hibernação, o que leva alguns minutos. Tente de novo daqui a pouco — se " +
  "insistir, avise quem administra o GuipaHub.";

export async function pedirToken(silencioso, depois) {
  if (!temSupabase()) {
    mudar({ erro: "Supabase não configurado. Preencha src/config.js." });
    return;
  }

  /* No silencioso não se abre janela nenhuma: só se olha se já existe
     sessão. É o caminho de quem reabre o site já logado. */
  if (silencioso) {
    try {
      const { data } = await comPrazo(supabase.auth.getSession());
      if (data?.session) {
        aplicarSessao(data.session);
        if (depois) depois();
      } else if (estado.perfil) {
        mudar({ expirou: true });
      }
    } catch {
      /* Silencioso que falha não vira alarme: a pessoa ainda nem pediu
         para entrar. Mas a tela de login passa a ter o que dizer caso
         ela tente. */
      mudar({ erro: FORA_DO_AR });
    }
    return;
  }

  mudar({ entrando: true, erro: "" });

  /* `hd` restringe o seletor de contas ao dominio da GUIPA.
     NAO pedimos `prompt: consent`. Ela estava aqui com a justificativa de
     "renovar a autorizacao do Drive quando o token vencer", o que e
     falso: um login normal ja devolve token novo. O que ela fazia de
     fato era OBRIGAR a tela de aprovacao do Google a aparecer em toda
     entrada -- varias vezes por dia, para a mesma pessoa, aprovando
     exatamente o que ja tinha aprovado.
     `access_type: offline` sai junto: so serve para receber um refresh
     token, que exige o segredo do cliente para ser trocado. Segredo nao
     pode viver no JavaScript do site, entao esse token nunca teve uso. */
  try {
    const { error } = await comPrazo(
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: ESCOPOS_DRIVE,
          queryParams: {
            hd: DOMINIO_OK,
            access_type: "offline",
            ...(pedirConsentimento ? { prompt: "consent" } : {}),
          },
          redirectTo: window.location.origin,
        },
      })
    );
    if (error) {
      mudar({ entrando: false, erro: "Não consegui abrir o login: " + error.message });
    }
    /* Sem erro, o navegador sai da página para o Google e volta depois —
       quem trata a volta é o onAuthStateChange lá embaixo. */
  } catch {
    mudar({ entrando: false, erro: FORA_DO_AR });
  }
}

export function comToken(fn) {
  if (tokenValido()) {
    if (estado.expirou) mudar({ expirou: false });
    fn();
    return;
  }
  /* Primeiro em silêncio, pela função drive-token. Só se ela não
     resolver é que se vai ao Google (o piscar). */
  renovarEmSilencio().then((ok) => {
    if (ok) {
      if (estado.expirou) mudar({ expirou: false });
      fn();
      return;
    }
    if (renovarAcessoDrive()) return;
    mudar({ expirou: true });
  });
}

/* Uma ida ao Google para buscar token novo do Drive, sem perguntar nada.
   Devolve true se foi tentada.

   O trinco de uma tentativa por sessao e o que impede laco infinito: se
   a pessoa tirou a permissao do Drive na tela do Google, a volta vem sem
   provider_token, e sem o trinco o app sairia renovando para sempre.
   Falhando uma vez, a interface passa a mostrar o botao e explicar. */
export function renovarAcessoDrive() {
  if (!temSessao()) return false;
  try {
    if (sessionStorage.getItem(RENOVOU_KEY) === "1") return false;
    sessionStorage.setItem(RENOVOU_KEY, "1");
  } catch {
    return false;
  }
  pedirToken(false, null);
  return true;
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

  /* So destranca a renovacao automatica quando chegou token BOM. Se o
     Supabase devolveu o token velho de sempre (morto), o trinco fica
     como esta -- senao uma volta do Google sem token novo viraria laco. */
  if (sessao.provider_refresh_token) guardarRefresh(sessao.provider_refresh_token);
  if (sessao.provider_token && guardarProviderToken(sessao.provider_token)) {
    try {
      sessionStorage.removeItem(RENOVOU_KEY);
    } catch {
      /* sem sessionStorage a renovacao automatica so nao acontece */
    }
  }

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
