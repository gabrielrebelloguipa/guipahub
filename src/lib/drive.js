/* Leitura do acervo de imagens no Google Drive, com o token de quem está
   logado.

   A REGRA DESTE ARQUIVO: tudo acontece dentro da pasta raiz configurada em
   Configurações › Drive. O app desce a partir dela e nunca sai. Não existe
   busca "no Drive inteiro" aqui — se a raiz não estiver configurada, a aba
   Clientes avisa e não mostra nada, porque sem raiz ela não saberia onde o
   acervo começa.

   A única exceção é buscarPastas(), usada pela própria tela de
   Configurações para ESCOLHER a raiz. Filtrar pela raiz ali seria circular.

   Não guarda arquivo em lugar nenhum: lê o Drive na hora. É o que faz
   vídeo ser possível (não caberia em banco de navegador) e o que mantém a
   permissão sendo a do Drive, sem um segundo sistema de permissão para
   manter.

   Como auth.js, este arquivo não sabe que existe React. */

import { CONFIG } from "../config.js";
import {
  pegarToken,
  comToken,
  marcarVerificando,
  marcarAcessoDrive,
  tokenRecusado,
  renovarEmSilencio,
  marcarTokenVencido,
} from "./auth.js";

const API = "https://www.googleapis.com/drive/v3/";

/* Sem estes dois, a busca só enxerga o "Meu Drive" e ignora os drives
   compartilhados — que é justamente onde mora o acervo da empresa. */
const COMUM = { supportsAllDrives: "true", includeItemsFromAllDrives: "true" };

const PASTA = "application/vnd.google-apps.folder";

/* Um acervo grande não pode virar centenas de chamadas. Quando o teto
   bate, a interface avisa em vez de fingir que terminou. */
export const TETO_ARQUIVOS = 1500;
export const TETO_PASTAS = 300;

/* A estrutura real tem 12 níveis de profundidade. Subir a árvore com um
   limite fixo pequeno descartaria arquivo legítimo lá do fundo; este teto
   só existe para um ciclo de pastas não virar laço infinito. */
const TETO_SUBIDA = 20;

/* A raiz mora no banco (config_app), configurada pela aba Configurações.
   O valor em config.js continua valendo como último recurso — serve para
   um ambiente novo antes de alguém configurar. */
let raizDoBanco = { raizId: "", raizNome: "" };

export function definirRaiz(d) {
  const novo = { raizId: d?.raizId || "", raizNome: d?.raizNome || "" };
  /* Raiz nova invalida o índice inteiro: ele é um mapa de dentro da raiz
     antiga, e aproveitá-lo deixaria passar pasta que não é mais acervo.

     Só quando havia uma raiz ANTES. Na carga da página a raiz sempre
     "muda" de vazio para o id real, e tratar isso como troca apagava o
     índice guardado no navegador a cada visita. Índice de outra raiz não
     é risco: lerIndiceGuardado confere de qual raiz ele é. */
  if (raizDoBanco.raizId && novo.raizId !== raizDoBanco.raizId) esquecerArvore();
  raizDoBanco = novo;
}

export function raizConfigurada() {
  return raizDoBanco.raizId || CONFIG.driveRaizId || "";
}

export function nomeDaRaiz() {
  return raizDoBanco.raizNome || "Acervo";
}

/* Aspas e barras invertidas quebram a query do Drive — um cliente com
   apóstrofo no nome ("O'Boticário") derrubaria a busca sem isso. */
function escapaQ(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function qs(params) {
  return Object.entries({ ...COMUM, ...params })
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function pedir(recurso, params, segunda = false) {
  const r = await fetch(API + recurso + "?" + qs(params), {
    headers: { Authorization: "Bearer " + pegarToken() },
  });
  if (!r.ok) {
    /* 401 e 403 são coisas diferentes e pedem respostas diferentes:
       401 = o token venceu, dá para renovar sem incomodar ninguém.
       403 = o Google entendeu quem é você e disse não — ou o acesso ao
       Drive não foi autorizado, ou a pessoa não tem permissão ali.
       Tratar os dois como "erro" mandava a pessoa relogar à toa. */
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) {
      /* Token vencido: renova em silêncio e tenta de novo, uma vez. */
      if (!segunda) {
        marcarTokenVencido();
        if (await renovarEmSilencio()) return pedir(recurso, params, true);
      }
      /* Não deu: mesmo caminho de antes, uma ida ao Google. */
      tokenRecusado();
      const e = new Error("Sua sessão do Google venceu. Renovando o acesso — a página volta em instantes.");
      e.status = 401;
      throw e;
    }
    const e = new Error(j?.error?.message || "HTTP " + r.status);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

/* Uma pergunta barata ao Drive logo depois de entrar, só para saber se o
   acesso foi mesmo concedido. Sem isso a pessoa só descobriria o problema
   na primeira busca, e leria "HTTP 403" sem ideia do que fazer. */
export async function verificarAcesso() {
  marcarVerificando(true);
  try {
    await pedir("files", { pageSize: 1, fields: "files(id)" });
    marcarAcessoDrive(true);
  } catch (e) {
    /* 403 = o Google entendeu quem é você e disse não. Qualquer outra
       falha pode ser rede, e não vale acusar o usuário por isso. */
    marcarAcessoDrive(e?.status === 403 ? false : null);
  } finally {
    marcarVerificando(false);
  }
}

function comTokenAsync(fn) {
  return new Promise((ok, falha) => {
    comToken(() => fn().then(ok, falha));
  });
}

const CAMPOS_ARQ =
  "id,name,mimeType,thumbnailLink,webViewLink,size,modifiedTime,parents";

/* ---------- o drive compartilhado da raiz ---------- */

/* O acervo mora num drive compartilhado. Perguntar ao Drive "dentro
   deste drive" (corpora=drive) em vez de "em tudo que a pessoa enxerga"
   tira das consultas tudo o que não é desse drive, e mediu 45% mais
   rápido na busca: 0,45 s contra 0,83 s para "stan".

   Sem drive compartilhado (raiz no "Meu Drive" de alguém) o id vem
   vazio, e as consultas seguem do jeito antigo. */
let driveDaRaiz = null; // null = ainda não perguntado; "" = Meu Drive

async function escopo() {
  if (driveDaRaiz === null) {
    const raiz = raizConfigurada();
    try {
      const f = raiz ? await pedir("files/" + raiz, { fields: "id,driveId" }) : null;
      driveDaRaiz = f?.driveId || "";
    } catch {
      driveDaRaiz = "";
    }
  }
  return driveDaRaiz ? { corpora: "drive", driveId: driveDaRaiz } : {};
}

/* ---------- cache de pastas ---------- */

/* id → {id, name, parents}. Setor e subsetor se repetem em todo
   resultado de busca e são lidos uma vez só.

   Guarda também o PEDIDO em andamento, não só a resposta: sem isso, dez
   resultados da mesma pasta, conferidos em paralelo, disparavam dez
   pedidos iguais pelo mesmo pai antes do primeiro voltar. */
const cachePasta = new Map();
const pedindoPasta = new Map();

async function pastaPorId(id) {
  if (cachePasta.has(id)) return cachePasta.get(id);
  if (pedindoPasta.has(id)) return pedindoPasta.get(id);
  const p = pedir("files/" + id, { fields: "id,name,parents" })
    .then((f) => {
      cachePasta.set(id, f);
      return f;
    })
    .catch(() => {
      cachePasta.set(id, null);
      return null;
    })
    .finally(() => pedindoPasta.delete(id));
  pedindoPasta.set(id, p);
  return p;
}

/* ---------- índice da árvore ---------- */

/* O Drive não sabe responder "é descendente de X?" — só "é filho direto
   de X?". O índice é o mapa pasta → pai de tudo que fica abaixo da raiz,
   e é ele que diz se um resultado de busca é do acervo.

   Três coisas o deixam rápido, e cada uma foi medida:

   1. Lotes de 50 pais por pergunta: ~30 chamadas para as 1265 pastas,
      em vez de 1265.
   2. Os lotes de um mesmo nível saem em PARALELO. Antes iam em fila, um
      por vez, e a árvore inteira levava uns 8 segundos.
   3. Ele fica guardado no navegador por um dia. A estrutura do acervo
      muda pouco; remontar a cada visita era pagar os 8 segundos toda
      vez. Pasta criada hoje entra na próxima remontagem — e enquanto
      isso, a conferência por subida pela API cobre a diferença.

   Só entram aqui ids de pastas de DENTRO da raiz: nada acima dela nem
   ao lado é lido, nem para indexar. */
const LOTE_PAIS = 50;
const LOTES_SIMULTANEOS = 4;
const TETO_ARVORE = 5000;
const PROFUNDIDADE_MAX = 15;
const VALIDADE_INDICE_MS = 24 * 60 * 60 * 1000;
const CHAVE_INDICE = "guipahub_indice_acervo";

const arvore = new Map(); // id da pasta -> id do pai
let arvoreCompleta = false;
let arvorePromessa = null;

function fatiar(lista, n) {
  const fatias = [];
  for (let i = 0; i < lista.length; i += n) fatias.push(lista.slice(i, i + n));
  return fatias;
}

function lerIndiceGuardado(raiz) {
  try {
    const bruto = localStorage.getItem(CHAVE_INDICE);
    if (!bruto) return false;
    const g = JSON.parse(bruto);
    if (g.raiz !== raiz || Date.now() - g.em > VALIDADE_INDICE_MS) return false;
    arvore.clear();
    for (const [id, pai] of g.pares) arvore.set(id, pai);
    arvoreCompleta = !!g.completa;
    return true;
  } catch {
    return false;
  }
}

function guardarIndice(raiz) {
  try {
    localStorage.setItem(
      CHAVE_INDICE,
      JSON.stringify({ raiz, em: Date.now(), completa: arvoreCompleta, pares: [...arvore] })
    );
  } catch {
    /* sem espaço: o índice vale só nesta visita, e tudo bem */
  }
}

/* Um lote de pais, com todas as páginas dele. */
async function filhosDoLote(lote, esc) {
  const q = lote.map((id) => `'${escapaQ(id)}' in parents`).join(" or ");
  const achados = [];
  let pageToken;
  do {
    const r = await pedir("files", {
      ...esc,
      q: `(${q}) and mimeType='${PASTA}' and trashed=false`,
      fields: "nextPageToken,files(id,name,parents)",
      pageSize: 1000,
      pageToken,
    });
    achados.push(...(r.files || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return achados;
}

async function montarArvore(raiz) {
  const esc = await escopo();
  const nova = new Map([[raiz, null]]);
  let nivel = [raiz];
  let estourou = false;

  for (let p = 0; p < PROFUNDIDADE_MAX && nivel.length && !estourou; p++) {
    const proximo = [];
    const lotes = fatiar(nivel, LOTE_PAIS);
    /* Paralelo, mas com teto: o Google corta quem dispara dezenas de
       pedidos ao mesmo tempo, e aí tudo fica mais lento, não menos. */
    for (const grupo of fatiar(lotes, LOTES_SIMULTANEOS)) {
      const respostas = await Promise.all(grupo.map((l) => filhosDoLote(l, esc)));
      for (const f of respostas.flat()) {
        if (nova.has(f.id)) continue;
        nova.set(f.id, f.parents?.[0] || null);
        cachePasta.set(f.id, f);
        proximo.push(f.id);
      }
      if (nova.size >= TETO_ARVORE) {
        estourou = true;
        break;
      }
    }
    nivel = proximo;
  }

  /* Troca o índice de uma vez só no fim: quem consulta no meio da
     remontagem continua vendo o anterior inteiro, nunca um pela metade. */
  arvore.clear();
  for (const [id, pai] of nova) arvore.set(id, pai);
  /* Só vale afirmar "está fora da raiz" com a árvore varrida inteira.
     Truncada, um id ausente pode ser pasta que ficou de fora. */
  arvoreCompleta = !estourou;
  guardarIndice(raiz);
  return arvoreCompleta;
}

/* Carrega o índice guardado na hora, se houver, e remonta em segundo
   plano só se ele estiver velho. Quem chama nunca espera a remontagem. */
export function aquecerArvore() {
  const raiz = raizConfigurada();
  if (!raiz) return Promise.resolve(false);
  if (!arvorePromessa) {
    if (lerIndiceGuardado(raiz)) {
      arvorePromessa = Promise.resolve(arvoreCompleta);
    } else {
      arvorePromessa = comTokenAsync(() => montarArvore(raiz)).catch(() => false);
    }
  }
  return arvorePromessa;
}

/* Trocar a raiz invalida o índice inteiro, inclusive o guardado. */
export function esquecerArvore() {
  arvore.clear();
  arvoreCompleta = false;
  arvorePromessa = null;
  driveDaRaiz = null;
  cachePasta.clear();
  cacheFilhos.clear();
  try {
    localStorage.removeItem(CHAVE_INDICE);
  } catch {
    /* nada guardado, nada a apagar */
  }
}

export function tamanhoDoIndice() {
  return arvore.size;
}

/* ---------- navegar ---------- */

/* O conteúdo de cada pasta já aberta fica na memória por alguns minutos:
   fechar e reabrir, ou voltar da busca para a pasta, não vai de novo ao
   Drive. Curto de propósito — arquivo novo tem que aparecer logo. */
const cacheFilhos = new Map(); // id -> { em, valor }
const VALIDADE_FILHOS_MS = 5 * 60 * 1000;

/* Um nível só: o que tem dentro desta pasta. É assim que a tela navega —
   clicou, pede o andar de baixo. */
export function listarFilhos(pastaId) {
  const guardado = cacheFilhos.get(pastaId);
  if (guardado && Date.now() - guardado.em < VALIDADE_FILHOS_MS) {
    return Promise.resolve(guardado.valor);
  }
  return comTokenAsync(async () => {
    const esc = await escopo();
    const pastas = [];
    const arquivos = [];
    let pageToken;
    do {
      const r = await pedir("files", {
        ...esc,
        q: `'${escapaQ(pastaId)}' in parents and trashed=false`,
        fields: `nextPageToken,files(${CAMPOS_ARQ})`,
        pageSize: 200,
        pageToken,
      });
      for (const f of r.files || []) {
        if (f.mimeType === PASTA) {
          cachePasta.set(f.id, { id: f.id, name: f.name, parents: f.parents });
          pastas.push({ id: f.id, nome: f.name });
        } else {
          /* Todo arquivo, nao so imagem e video: o acervo tem PSD, AI,
             prproj e PDF, e esconder isso fazia a pasta parecer vazia
             quando nao estava. Quem filtra e a tela. */
          arquivos.push(f);
        }
      }
      pageToken = r.nextPageToken;
    } while (pageToken);
    /* Ordem feita aqui e não pedida ao Drive: o orderBy custa caro na
       consulta e a lista de uma pasta raramente passa de algumas
       centenas de itens. */
    const porNome = (a, b) =>
      (a.nome || a.name).localeCompare(b.nome || b.name, "pt-BR", { numeric: true });
    const valor = { pastas: pastas.sort(porNome), arquivos: arquivos.sort(porNome) };
    cacheFilhos.set(pastaId, { em: Date.now(), valor });
    return valor;
  });
}

/* A trilha "07. Design › Automóveis › Pneus › Bridgestone", do topo para
   baixo. Para na raiz: o que está acima dela não é assunto do app. */
export function trilhaAteRaiz(pastaId) {
  return comTokenAsync(async () => {
    const raiz = raizConfigurada();
    const trilha = [];
    let id = pastaId;
    for (let i = 0; i < TETO_SUBIDA && id; i++) {
      const p = await pastaPorId(id);
      if (!p) break;
      trilha.unshift({ id: p.id, nome: p.name });
      if (p.id === raiz) break;
      id = p.parents?.[0];
    }
    return trilha;
  });
}

/* ---------- buscar ---------- */

/* "Este arquivo está dentro do acervo?" — com o índice é uma caminhada
   na memória. Sem índice, ou com ele velho, sobe perguntando ao Drive de
   pai em pai, com cache e com o pedido em andamento compartilhado.

   Subir sem limite fixo é o ponto: a estrutura tem 12 níveis. TETO_SUBIDA
   só existe contra ciclo de pastas. */
async function dentroDaRaiz(f, raiz) {
  let id = f.parents?.[0];
  for (let i = 0; i < TETO_SUBIDA && id; i++) {
    if (id === raiz) return true;
    if (arvore.has(id)) {
      id = arvore.get(id);
      continue;
    }
    /* Índice completo na mão e o id não está nele: está fora da raiz.
       Só dá para afirmar isso com a varredura inteira. */
    if (arvoreCompleta) return false;
    const p = await pastaPorId(id);
    if (!p) return false;
    id = p.parents?.[0];
  }
  return false;
}

/* Busca por palavra dentro do acervo: arquivos e também pastas cujo
   nome casa, porque "bridgestone" tanto pode ser o que a pessoa quer
   abrir quanto o nome dos arquivos lá dentro.

   A busca NÃO espera o índice. Esperar era o que fazia "stan" levar 7,9 s
   no app contra 0,8 s no Drive: a primeira busca ficava parada atrás da
   montagem da árvore inteira. Agora a pergunta ao Drive sai na hora; o
   índice, se já estiver pronto (e quase sempre está, guardado do dia),
   filtra na memória; se não, os poucos resultados sobem pela API. */
export function buscarNoAcervo(termo) {
  return comTokenAsync(async () => {
    const raiz = raizConfigurada();
    if (!raiz) return { arquivos: [], pastas: [], semRaiz: true };

    aquecerArvore(); // em paralelo, sem esperar
    const esc = await escopo();
    const t = escapaQ(termo);
    const [rArq, rPas] = await Promise.all([
      pedir("files", {
        ...esc,
        q: `name contains '${t}' and trashed=false and mimeType != '${PASTA}'`,
        fields: `files(${CAMPOS_ARQ})`,
        pageSize: 200,
      }),
      pedir("files", {
        ...esc,
        q: `name contains '${t}' and trashed=false and mimeType='${PASTA}'`,
        fields: "files(id,name,parents)",
        pageSize: 60,
      }),
    ]);

    const peneira = async (lista) => {
      const dentro = await Promise.all(lista.map((f) => dentroDaRaiz(f, raiz)));
      return lista.filter((_, i) => dentro[i]);
    };

    const [pastas, arquivos] = await Promise.all([
      peneira(rPas.files || []),
      peneira(rArq.files || []),
    ]);
    for (const p of pastas) {
      cachePasta.set(p.id, { id: p.id, name: p.name, parents: p.parents });
    }

    const porNome = (a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true });
    return {
      arquivos: arquivos.sort(porNome),
      pastas: pastas.sort(porNome).map((p) => ({ id: p.id, nome: p.name })),
      semRaiz: false,
    };
  });
}

/* Mesma busca de pastas, SEM o filtro de raiz — a tela de Configurações
   precisa achar a pasta que VAI virar a raiz, e filtrar por ela aqui
   seria circular. É a única porta deste arquivo que olha fora da raiz. */
export function buscarPastas(termo) {
  return comTokenAsync(async () => {
    const r = await pedir("files", {
      q: `mimeType='${PASTA}' and trashed=false and name contains '${escapaQ(termo)}'`,
      fields: "files(id,name,parents)",
      pageSize: 20,
      orderBy: "name",
    });
    const lista = r.files || [];
    /* Mostra os dois ancestrais mais próximos só para a pessoa distinguir
       pastas de mesmo nome. Não é navegação, é desempate. */
    const caminhos = await Promise.all(
      lista.map(async (f) => {
        const partes = [];
        let id = f.parents?.[0];
        for (let i = 0; i < 2 && id; i++) {
          const p = await pastaPorId(id);
          if (!p) break;
          partes.unshift(p.name);
          id = p.parents?.[0];
        }
        return partes.join(" › ");
      })
    );
    return lista.map((f, i) => ({
      id: f.id,
      nome: f.name,
      caminho: caminhos[i],
    }));
  });
}

/* Pasta do acervo pelo nome, para a Central: "Imagens de Refer" acha
   "0 - Imagens de Referência" com ou sem acento no fim. Só vale pasta de
   dentro da raiz; filha direta da raiz ganha de uma homônima mais funda. */
const pastaPorTrecho = new Map();
export function acharPastaNaRaiz(trecho) {
  if (pastaPorTrecho.has(trecho)) return Promise.resolve(pastaPorTrecho.get(trecho));
  return comTokenAsync(async () => {
    const raiz = raizConfigurada();
    if (!raiz) return null;
    const esc = await escopo();
    const r = await pedir("files", {
      ...esc,
      q: `mimeType='${PASTA}' and trashed=false and name contains '${escapaQ(trecho)}'`,
      fields: "files(id,name,parents)",
      pageSize: 20,
    });
    const lista = r.files || [];
    let achada = lista.find((f) => f.parents?.[0] === raiz) || null;
    if (!achada) {
      for (const f of lista) {
        if (await dentroDaRaiz(f, raiz)) { achada = f; break; }
      }
    }
    const valor = achada ? { id: achada.id, nome: achada.name } : null;
    if (valor) pastaPorTrecho.set(trecho, valor);
    return valor;
  });
}

export function linkDaPasta(id) {
  return `https://drive.google.com/drive/folders/${id}`;
}

/* Download pelo próprio Drive: arquivo grande (vídeo de 200 MB) não
   passa pela memória da página. */
export function linkDeDownload(f) {
  return `https://drive.google.com/uc?export=download&id=${f.id}`;
}

/* ---------- varrer uma pasta inteira ---------- */

/* Tudo que é imagem ou vídeo abaixo desta pasta, em qualquer
   profundidade. É o "ver tudo deste cliente": a pasta do cliente tem
   Photoshop, Renders, Recursos, e ninguém quer clicar em cada uma.

   O Drive não tem busca recursiva: é um nível por chamada, então isto é
   uma fila de pastas a visitar. */
export function listarMidias(pastaId) {
  return comTokenAsync(async () => {
    const achados = [];
    const fila = [pastaId];
    let visitadas = 0;

    while (fila.length && achados.length < TETO_ARQUIVOS && visitadas < TETO_PASTAS) {
      const id = fila.shift();
      visitadas++;
      let pageToken;
      do {
        const r = await pedir("files", {
          q: `'${escapaQ(id)}' in parents and trashed=false`,
          fields: `nextPageToken,files(${CAMPOS_ARQ})`,
          pageSize: 200,
          orderBy: "folder,name",
          pageToken,
        });
        for (const f of r.files || []) {
          if (f.mimeType === PASTA) fila.push(f.id);
          else achados.push(f);
        }
        pageToken = r.nextPageToken;
      } while (pageToken && achados.length < TETO_ARQUIVOS);
    }

    return { arquivos: achados, truncado: fila.length > 0 };
  });
}

/* ---------- arquivo ---------- */

export function baixarBlob(f) {
  return comTokenAsync(async () => {
    const r = await fetch(
      API + "files/" + f.id + "?alt=media&supportsAllDrives=true",
      { headers: { Authorization: "Bearer " + pegarToken() } }
    );
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.blob();
  });
}

export function ehVideo(f) {
  return /^video\//.test(f.mimeType);
}

export function ehImagem(f) {
  return /^image\//.test(f.mimeType);
}

/* Tres baldes, porque e assim que a pessoa pensa ao filtrar: "quero so
   imagem", "quero so video", "quero o arquivo editavel". */
export function tipoDe(f) {
  if (ehImagem(f)) return "imagem";
  if (ehVideo(f)) return "video";
  return "outro";
}

/* Nome curto da extensao, para o cartao de arquivo que nao tem
   miniatura: "PSD" diz mais que um icone generico. */
export function extensaoDe(f) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(f.name || "");
  return m ? m[1].toUpperCase() : "ARQ";
}

/* thumbnailLink vem com sufixo de tamanho (=s220). Trocar por um maior
   evita miniatura borrada na grade. No <img>, referrerPolicy="no-referrer"
   é o que impede o Drive de recusar a imagem com 403. */
export function miniatura(f, tamanho) {
  if (f.thumbnailLink) return f.thumbnailLink.replace(/=s\d+$/, "=s" + tamanho);
  return `https://drive.google.com/thumbnail?id=${f.id}&sz=w${tamanho}`;
}

export function urlPreview(f) {
  return `https://drive.google.com/file/d/${f.id}/preview`;
}

export function fmtBytes(b) {
  const n = Number(b) || 0;
  if (n < 1024) return n + " B";
  if (n < 1048576) return Math.round(n / 1024) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
