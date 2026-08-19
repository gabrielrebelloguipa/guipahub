/* Leitura do Google Drive com o token de quem está logado.

   Não guarda arquivo em lugar nenhum: lê o Drive na hora. É o que faz
   vídeo ser possível (não caberia em banco de navegador) e o que faz o
   espaço não acabar. Também é o que mantém a permissão sendo a do Drive,
   sem um segundo sistema de permissão para manter.

   Como auth.js, este arquivo não sabe que existe React. */

import { CONFIG } from "../config.js";
import {
  pegarToken,
  comToken,
  marcarVerificando,
  marcarAcessoDrive,
} from "./auth.js";

const API = "https://www.googleapis.com/drive/v3/";

/* Sem estes dois, a busca só enxerga o "Meu Drive" e ignora os drives
   compartilhados — que é justamente onde mora o acervo da empresa. */
const COMUM = { supportsAllDrives: "true", includeItemsFromAllDrives: "true" };

/* Um acervo grande não pode virar centenas de chamadas. Quando o teto
   bate, a interface avisa em vez de fingir que terminou. */
export const TETO_ARQUIVOS = 1500;
export const TETO_PASTAS = 200;

const PASTA = "application/vnd.google-apps.folder";

export function raizConfigurada() {
  let local = "";
  try {
    local = localStorage.getItem("guipahub_drive_raiz") || "";
  } catch {
    /* sem localStorage: vale só o que está no config */
  }
  return CONFIG.driveRaizId || local;
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

async function pedir(recurso, params) {
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
    const e = new Error(j?.error?.message || "HTTP " + r.status);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

/* Uma pergunta barata ao Drive logo depois de entrar, só para saber se o
   acesso foi mesmo concedido. Sem isso a pessoa só descobriria o problema
   na primeira busca, e leria "HTTP 403" sem ideia do que fazer.
   pageSize=1 e fields mínimo: a menor pergunta possível. */
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

/* ---------- pastas ---------- */

const cachePasta = new Map();

async function pastaPorId(id) {
  if (cachePasta.has(id)) return cachePasta.get(id);
  try {
    const f = await pedir("files/" + id, { fields: "id,name,parents" });
    cachePasta.set(id, f);
    return f;
  } catch {
    return null;
  }
}

/* Sobe até 3 níveis para montar "Setor › Subsetor › Cliente". Três é de
   propósito: é a profundidade da estrutura combinada, e subir sem limite
   transformaria cada resultado numa fila de chamadas à API. */
async function caminhoDe(f) {
  const partes = [];
  const ancestrais = [];
  let pais = f.parents;
  for (let nivel = 0; nivel < 3 && pais?.length; nivel++) {
    const p = await pastaPorId(pais[0]);
    if (!p) break;
    partes.unshift(p.name);
    ancestrais.push(p.id);
    pais = p.parents;
  }
  return { texto: partes.join(" › "), ancestrais };
}

export function buscarClientes(termo) {
  return comTokenAsync(async () => {
    const r = await pedir("files", {
      q:
        `mimeType='${PASTA}' and trashed=false and name contains '` +
        escapaQ(termo) +
        "'",
      fields: "files(id,name,parents)",
      pageSize: 40,
      orderBy: "name",
    });
    const lista = r.files || [];
    const caminhos = await Promise.all(lista.map(caminhoDe));
    const raiz = raizConfigurada();
    return lista
      .map((f, i) => ({
        id: f.id,
        nome: f.name,
        caminho: caminhos[i].texto,
        ancestrais: caminhos[i].ancestrais,
      }))
      /* Raiz configurada = só vale pasta que desce dela. Sem raiz, vale
         tudo que a pessoa enxerga no Drive. */
      .filter((c) => !raiz || c.ancestrais.includes(raiz));
  });
}

/* Varre a pasta do cliente e tudo abaixo dela. O Drive não tem busca
   recursiva: é um nível por chamada, então isto é uma fila de pastas a
   visitar. */
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
          q: `'${id}' in parents and trashed=false`,
          fields:
            "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,size,modifiedTime)",
          pageSize: 200,
          orderBy: "folder,name",
          pageToken,
        });
        for (const f of r.files || []) {
          if (f.mimeType === PASTA) fila.push(f.id);
          else if (/^image\/|^video\//.test(f.mimeType)) achados.push(f);
        }
        pageToken = r.nextPageToken;
      } while (pageToken && achados.length < TETO_ARQUIVOS);
    }

    return {
      arquivos: achados,
      truncado: fila.length > 0,
    };
  });
}

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
