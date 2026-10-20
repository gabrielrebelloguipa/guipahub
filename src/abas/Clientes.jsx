import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import { pode } from "../lib/permissoes.js";
import { pedirToken } from "../lib/auth.js";
import {
  aquecerArvore,
  raizConfigurada,
  nomeDaRaiz,
  listarFilhos,
  buscarNoAcervo,
  baixarBlob,
  ehVideo,
  ehImagem,
  tipoDe,
  extensaoDe,
  miniatura,
  urlPreview,
  fmtBytes,
} from "../lib/drive.js";

/* Quantos itens aparecem de uma vez. Uma pasta de cliente pode ter
   centenas de arquivos, e montar tudo de uma vez trava a rolagem no
   celular — some o conteúdo por trás de um segundo de tela branca. */
const PAGINA = 60;

/* Tempo de silêncio antes de ir ao Drive. Buscar a cada tecla seria uma
   chamada por letra: lento para quem digita e desperdício de cota. */
const ESPERA_MS = 400;

/* Rasteriza qualquer imagem para PNG antes de copiar. Converter sempre,
   em vez de tentar o mime original, evita depender do que cada navegador
   aceita caso a caso — e SVG não é copiável como imagem sem isso. */
function rasterizarParaPng(blob) {
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

function AvisoDeAcesso() {
  const auth = useAuth();

  if (auth.expirou)
    return (
      <div className="banner">
        <b>O acesso ao Drive não renovou. </b>
        Ele vale uma hora e o site tenta renovar sozinho, sem perguntar nada.
        Essa tentativa não deu certo — normalmente porque a permissão de
        leitura do Drive foi retirada na conta do Google. Entrar de novo leva
        um clique e não perde nada do que você estava fazendo.
        <div className="chips" style={{ marginTop: 10 }}>
          <button className="btn primary sm" type="button" onClick={() => pedirToken(false, null)}>
            Entrar de novo
          </button>
        </div>
      </div>
    );

  if (auth.acessoDrive === false)
    return (
      <div className="banner">
        <b>O acesso ao Drive não foi autorizado. </b>
        Você entrou como {auth.perfil?.email}, mas na tela do Google a permissão
        de leitura do Drive ficou de fora — dá para desmarcar só ela. Sem essa
        permissão esta aba não tem o que mostrar.
        <div className="chips" style={{ marginTop: 10 }}>
          <button className="btn primary sm" type="button" onClick={() => pedirToken(false, null)}>
            Autorizar o Drive
          </button>
        </div>
      </div>
    );

  return null;
}

/* ---------- um arquivo ---------- */

function Cartao({ f, aoAbrir, aoCopiar, aoBaixar, podeBaixar = true }) {
  const tem = ehImagem(f) || ehVideo(f);
  return (
    <div className="midia">
      <button className="midia-img" type="button" onClick={() => tem && aoAbrir(f)}>
        {tem ? (
          <img
            src={miniatura(f, 400)}
            alt={f.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          /* PSD, AI, prproj não têm miniatura no Drive. A extensão diz
             mais do que um ícone genérico de arquivo. */
          <div className="midia-sem">{extensaoDe(f)}</div>
        )}
        {ehVideo(f) && <div className="midia-play">▶</div>}
      </button>
      <div className="midia-nome" title={f.name}>
        {f.name}
      </div>
      <div className="midia-acoes">
        {/* Baixar e copiar sao a mesma permissao: os dois tiram o arquivo
            do Drive e poem na maquina da pessoa. Ver e abrir no Drive
            seguem liberados -- quem ve a imagem ja a tem na tela. */}
        {podeBaixar && ehImagem(f) && (
          <button className="btn sm" type="button" onClick={() => aoCopiar(f)}>
            Copiar
          </button>
        )}
        {podeBaixar && (
          <button className="btn sm ghost" type="button" onClick={() => aoBaixar(f)}>
            Baixar
          </button>
        )}
        {f.webViewLink && (
          <a className="btn sm ghost" href={f.webViewLink} target="_blank" rel="noopener">
            Drive
          </a>
        )}
      </div>
    </div>
  );
}

function Visor({ f, aoFechar }) {
  if (!f) return null;
  return (
    <div className="overlay" onClick={aoFechar}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="t">{f.name}</div>
          <button className="btn sm ghost" type="button" onClick={aoFechar}>
            ✕
          </button>
        </div>
        {ehVideo(f) ? (
          /* Vídeo toca pelo player do próprio Drive: transcodificar ou
             servir o arquivo bruto seria baixar centenas de MB à toa. */
          <iframe
            src={urlPreview(f)}
            title={f.name}
            allow="autoplay"
            style={{ width: "100%", height: "60vh", border: 0, borderRadius: "var(--radius)", background: "#000" }}
          />
        ) : (
          <img
            src={miniatura(f, 1600)}
            alt={f.name}
            referrerPolicy="no-referrer"
            style={{ maxWidth: "100%", maxHeight: "60vh", display: "block", margin: "0 auto", borderRadius: "var(--radius)" }}
          />
        )}
        <div className="sub" style={{ marginTop: 10 }}>
          {f.mimeType}
          {f.size ? " · " + fmtBytes(f.size) : ""}
        </div>
      </div>
    </div>
  );
}

/* ---------- grade com paginação ---------- */

function Grade({ arquivos, acoes }) {
  const [mostrando, setMostrando] = useState(PAGINA);

  /* Trocar de pasta ou de filtro recomeça a contagem — senão a pessoa
     abriria uma pasta pequena já "expandida" de uma anterior. */
  useEffect(() => setMostrando(PAGINA), [arquivos]);

  if (!arquivos.length) return null;
  const faltam = arquivos.length - mostrando;

  return (
    <>
      <div className="grid g-assets">
        {arquivos.slice(0, mostrando).map((f) => (
          <Cartao key={f.id} f={f} {...acoes} />
        ))}
      </div>
      {faltam > 0 && (
        <div className="chips" style={{ marginTop: 12 }}>
          <button className="btn sm" type="button" onClick={() => setMostrando((m) => m + PAGINA)}>
            Mostrar mais {Math.min(faltam, PAGINA)} de {faltam}
          </button>
        </div>
      )}
    </>
  );
}

/* ---------- a lista de pastas, que abre no lugar ---------- */

/* Cada linha carrega o próprio conteúdo na primeira vez que é aberta, e
   guarda depois disso. Abrir e fechar de novo não repete a chamada. */
function LinhaPasta({ pasta, nivel, filtro, acoes }) {
  const [aberta, setAberta] = useState(false);
  const [dentro, setDentro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function alternar() {
    const vai = !aberta;
    setAberta(vai);
    if (!vai || dentro || carregando) return;
    setCarregando(true);
    setErro("");
    try {
      setDentro(await listarFilhos(pasta.id));
    } catch (e) {
      setErro(e.message || "não consegui abrir");
    } finally {
      setCarregando(false);
    }
  }

  const arquivos = dentro ? dentro.arquivos.filter((f) => !filtro || tipoDe(f) === filtro) : [];
  const vazia = dentro && !dentro.pastas.length && !dentro.arquivos.length;

  return (
    <div className="arv-item">
      <button
        className={"arv-linha" + (aberta ? " on" : "")}
        type="button"
        onClick={alternar}
        style={{ paddingLeft: 10 + nivel * 18 }}
      >
        <span className="arv-seta">{aberta ? "▾" : "▸"}</span>
        <span className="arv-nome">{pasta.nome}</span>
        {dentro && (
          <span className="arv-conta">
            {dentro.pastas.length ? `${dentro.pastas.length} pastas` : ""}
            {dentro.pastas.length && dentro.arquivos.length ? " · " : ""}
            {dentro.arquivos.length ? `${dentro.arquivos.length} arquivos` : ""}
          </span>
        )}
      </button>

      {aberta && (
        <div className="arv-dentro" style={{ paddingLeft: 10 + nivel * 18 }}>
          {carregando && <div className="empty">Lendo…</div>}
          {erro && <div className="banner">{erro}</div>}
          {vazia && <div className="empty">Pasta vazia.</div>}
          {dentro?.pastas.map((p) => (
            <LinhaPasta key={p.id} pasta={p} nivel={nivel + 1} filtro={filtro} acoes={acoes} />
          ))}
          {dentro && !!dentro.arquivos.length && !arquivos.length && (
            <div className="empty">Nada deste tipo nesta pasta.</div>
          )}
          <Grade arquivos={arquivos} acoes={acoes} />
        </div>
      )}
    </div>
  );
}

/* ---------- a aba ---------- */

const FILTROS = [
  ["imagem", "Imagens"],
  ["video", "Vídeos"],
  ["outro", "Outros arquivos"],
];

export default function Imagens({ busca }) {
  const auth = useAuth();
  const raiz = raizConfigurada();

  const [topo, setTopo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [achados, setAchados] = useState(null);

  const [filtro, setFiltro] = useState("");
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    if (!raiz) return;
    let vivo = true;
    setCarregando(true);
    setErro("");
    listarFilhos(raiz)
      .then((c) => vivo && setTopo(c))
      .catch((e) => vivo && setErro(e.message || "erro ao ler a pasta raiz"))
      .finally(() => vivo && setCarregando(false));

    /* O indice da arvore (umas 30 chamadas) so serve para a BUSCA, nunca
       para navegar. Disparado junto com a abertura da aba, ele disputava
       as 6 conexoes que o navegador abre por servidor e deixava cada
       clique em pasta esperando atras dele. Depois de um respiro, a
       navegacao ja pegou o que precisava e a indexacao usa a sobra. */
    const atraso = setTimeout(() => aquecerArvore(), 3000);
    return () => {
      vivo = false;
      clearTimeout(atraso);
    };
  }, [raiz]);

  /* Busca enquanto digita: espera o dedo parar, e cancela o resultado de
     uma digitação já abandonada. Sem o `vivo`, uma busca lenta de três
     letras atrás chegaria depois e sobrescreveria a atual. */
  const pedido = useRef(0);
  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      setAchados(null);
      setBuscando(false);
      return;
    }
    const meu = ++pedido.current;
    setBuscando(true);
    const id = setTimeout(() => {
      buscarNoAcervo(t)
        .then((r) => {
          if (meu === pedido.current) setAchados(r);
        })
        .catch((e) => {
          if (meu === pedido.current) setErro(e.message || "erro na busca");
        })
        .finally(() => {
          if (meu === pedido.current) setBuscando(false);
        });
    }, ESPERA_MS);
    return () => clearTimeout(id);
  }, [termo]);

  const copiar = useCallback(async (f) => {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      setErro("Este navegador não copia imagem para a área de transferência.");
      return;
    }
    try {
      const png = await rasterizarParaPng(await baixarBlob(f));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    } catch (e) {
      setErro("Não consegui copiar: " + (e.message || "erro"));
    }
  }, []);

  const baixar = useCallback(async (f) => {
    try {
      const url = URL.createObjectURL(await baixarBlob(f));
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setErro("Não consegui baixar: " + (e.message || "erro"));
    }
  }, []);

  const acoes = {
    aoAbrir: setAberto,
    aoCopiar: copiar,
    aoBaixar: baixar,
    podeBaixar: pode("clientes", "baixar"),
  };

  if (auth.expirou || auth.acessoDrive === false) return <AvisoDeAcesso />;
  if (auth.verificando) return <div className="empty">Conferindo o seu acesso ao Drive…</div>;

  if (!raiz)
    return (
      <div className="banner">
        <b>A pasta do acervo ainda não foi escolhida. </b>
        Esta aba só lê o que estiver dentro de uma pasta definida em{" "}
        <b>Configurações › Drive</b>. Enquanto não houver uma, não há onde
        procurar. Peça a um admin.
      </div>
    );

  /* O campo do topo filtra o que já está na tela; o daqui vai ao Drive. */
  const peneirar = (lista) => {
    let l = filtro ? lista.filter((f) => tipoDe(f) === filtro) : lista;
    if (busca) l = l.filter((f) => f.name.toLowerCase().includes(busca.toLowerCase()));
    return l;
  };

  const emBusca = achados !== null;

  return (
    <>
      <div className="card">
        <div className="field">
          <label>Procurar em {nomeDaRaiz()}</label>
          <input
            type="text"
            value={termo}
            placeholder="Digite o nome do cliente ou do arquivo"
            onChange={(e) => setTermo(e.target.value)}
          />
        </div>
        <div className="sub">
          {buscando
            ? "procurando…"
            : emBusca
            ? `${achados.pastas.length} pastas e ${achados.arquivos.length} arquivos`
            : "A busca começa a partir de duas letras, em qualquer profundidade."}
        </div>
      </div>

      <div className="chips filtros">
        {FILTROS.map(([k, rot]) => (
          <button
            key={k}
            type="button"
            className={"chip" + (filtro === k ? " on" : "")}
            onClick={() => setFiltro(filtro === k ? "" : k)}
          >
            {rot}
          </button>
        ))}
        {filtro && (
          <button className="chip" type="button" onClick={() => setFiltro("")}>
            limpar filtro
          </button>
        )}
      </div>

      {erro && (
        <div className="banner" style={{ borderColor: "var(--danger)" }}>
          <b>Deu problema. </b>
          {erro}
          <button className="btn sm ghost" type="button" style={{ marginLeft: 8 }} onClick={() => setErro("")}>
            ok
          </button>
        </div>
      )}

      {emBusca ? (
        <>
          {!!achados.pastas.length && (
            <>
              <div className="sub" style={{ margin: "16px 0 8px" }}>Pastas</div>
              <div className="arvore">
                {achados.pastas.map((p) => (
                  <LinhaPasta key={p.id} pasta={p} nivel={0} filtro={filtro} acoes={acoes} />
                ))}
              </div>
            </>
          )}
          {(() => {
            const l = peneirar(achados.arquivos);
            if (!l.length)
              return !achados.pastas.length ? (
                <div className="empty">Nada com esse nome em {nomeDaRaiz()}.</div>
              ) : null;
            return (
              <>
                <div className="sub" style={{ margin: "16px 0 8px" }}>Arquivos ({l.length})</div>
                <Grade arquivos={l} acoes={acoes} />
              </>
            );
          })()}
        </>
      ) : carregando ? (
        <div className="empty">Lendo o acervo…</div>
      ) : (
        <>
          <div className="arvore">
            {topo?.pastas.map((p) => (
              <LinhaPasta key={p.id} pasta={p} nivel={0} filtro={filtro} acoes={acoes} />
            ))}
          </div>
          <Grade arquivos={peneirar(topo?.arquivos || [])} acoes={acoes} />
          {topo && !topo.pastas.length && !topo.arquivos.length && (
            <div className="empty">A pasta raiz está vazia.</div>
          )}
        </>
      )}

      <Visor f={aberto} aoFechar={() => setAberto(null)} />
    </>
  );
}
