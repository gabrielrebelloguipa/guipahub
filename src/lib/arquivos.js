/* Arquivos binários no IndexedDB.

   Por que não localStorage: um PDF de brandbook não cabe lá (poucos MB no
   total, e ainda inflado ~33% por ser texto). IndexedDB guarda o Blob como
   binário, sem inflar.

   Consequência que a interface precisa dizer em voz alta: isto fica NESTE
   navegador, nesta máquina. O "Exportar dados (JSON)" não leva o conteúdo
   binário junto. */

const DB = "guipahub_arquivos";
const STORE = "arquivos";
const VERSAO = 1;

function abrir() {
  return new Promise((ok, falha) => {
    const req = indexedDB.open(DB, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

export async function guardarArquivo(chave, blob) {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, chave);
    tx.oncomplete = () => ok(chave);
    tx.onerror = () => falha(tx.error);
  });
}

export async function buscarArquivo(chave) {
  const db = await abrir();
  return new Promise((ok) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(chave);
    req.onsuccess = () => ok(req.result || null);
    req.onerror = () => ok(null);
  });
}

export async function apagarArquivo(chave) {
  const db = await abrir();
  return new Promise((ok) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(chave);
    tx.oncomplete = () => ok();
    tx.onerror = () => ok();
  });
}

/* URLs de objeto vazam memória se não forem revogadas. O cache evita
   criar uma nova a cada renderização — que era o que aconteceria numa
   árvore React que redesenha com frequência. */
const cacheUrl = new Map();

export async function urlDoArquivo(chave) {
  if (cacheUrl.has(chave)) return cacheUrl.get(chave);
  const blob = await buscarArquivo(chave);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  cacheUrl.set(chave, url);
  return url;
}

export function liberarUrl(chave) {
  const url = cacheUrl.get(chave);
  if (url) {
    URL.revokeObjectURL(url);
    cacheUrl.delete(chave);
  }
}

/* Rasteriza qualquer imagem para PNG antes de copiar. Converter sempre,
   em vez de tentar o mime original, evita depender do que cada navegador
   aceita caso a caso — e SVG não é copiável como imagem sem isso. */
export function rasterizarParaPng(blob) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth || 1;
      cv.height = img.naturalHeight || 1;
      cv.getContext("2d").drawImage(img, 0, 0);
      cv.toBlob((png) => {
        URL.revokeObjectURL(url);
        png ? ok(png) : falha(new Error("não consegui converter a imagem"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falha(new Error("arquivo não é uma imagem válida"));
    };
    img.src = url;
  });
}

/* Copia a imagem para a área de transferência. O write sai já no clique,
   com o PNG ainda por vir: esperar o download antes de chamar deixa o
   clique "vencer", e o navegador recusa (Document is not focused). */
export function copiarImagem(obterBlob) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    return Promise.reject(new Error("este navegador não copia imagem"));
  }
  const png = Promise.resolve()
    .then(obterBlob)
    .then((b) => (b.type === "image/png" ? b : rasterizarParaPng(b)));
  return navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export const LIMITE_BYTES = 25 * 1024 * 1024;
