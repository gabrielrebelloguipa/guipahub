import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import { pedirToken } from "../lib/auth.js";
import {
  buscarClientes,
  listarMidias,
  baixarBlob,
  ehVideo,
  miniatura,
  urlPreview,
  fmtBytes,
} from "../lib/drive.js";

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

/* Avisos que não são sobre a busca, e sim sobre o acesso. Devolve null
   quando não há nada a dizer. */
function AvisoDeAcesso() {
  const auth = useAuth();

  if (auth.expirou)
    return (
      <div className="banner">
        <b>Sua sessão do Google expirou. </b>
        Ela vale uma hora e o navegador não conseguiu renovar sozinho. Entrar de
        novo leva um clique e não perde nada.
        <div className="chips" style={{ marginTop: 10 }}>
          <button
            className="btn primary sm"
            type="button"
            onClick={() => pedirToken(false, null)}
          >
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
          <button
            className="btn primary sm"
            type="button"
            onClick={() => pedirToken(false, null)}
          >
            Autorizar o Drive
          </button>
        </div>
      </div>
    );

  return null;
}

function Galeria({ cliente, aoVoltar, busca }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [arquivos, setArquivos] = useState([]);
  const [truncado, setTruncado] = useState(false);
  const [filtro, setFiltro] = useState("tudo");
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro("");
    listarMidias(cliente.id)
      .then((r) => {
        if (!vivo) return;
        setArquivos(r.arquivos);
        setTruncado(r.truncado);
      })
      .catch((e) => vivo && setErro(e.message || "erro ao ler a pasta"))
      .finally(() => vivo && setCarregando(false));
    /* `vivo` evita gravar estado de um cliente que já foi trocado — sem
       isso, voltar e abrir outro cliente rápido misturaria os resultados. */
    return () => {
      vivo = false;
    };
  }, [cliente.id]);

  const imagens = arquivos.filter((f) => !ehVideo(f));
  const videos = arquivos.filter(ehVideo);

  const lista = arquivos
    .filter((f) =>
      filtro === "imagem" ? !ehVideo(f) : filtro === "video" ? ehVideo(f) : true
    )
    .filter((f) =>
      busca ? f.name.toLowerCase().includes(busca.toLowerCase()) : true
    );

  async function copiar(f) {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      alert("Este navegador não copia imagem para a área de transferência");
      return;
    }
    try {
      const blob = await baixarBlob(f);
      const png = await rasterizarParaPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    } catch (e) {
      alert("Não consegui copiar: " + (e.message || "erro"));
    }
  }

  async function baixar(f) {
    try {
      const blob = await baixarBlob(f);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      alert("Não consegui baixar: " + (e.message || "erro"));
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-h">
          <div className="t">{cliente.nome}</div>
          <div className="a">
            <button className="btn sm ghost" type="button" onClick={aoVoltar}>
              ← Voltar
            </button>
          </div>
        </div>
        {cliente.caminho && <div className="sub">{cliente.caminho}</div>}
      </div>

      {erro && (
        <div className="banner">
          <b>Erro ao ler a pasta. </b>
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="empty">Lendo as pastas do cliente no Drive…</div>
      ) : !arquivos.length ? (
        <div className="empty">Nenhuma imagem ou vídeo nessa pasta.</div>
      ) : (
        <>
          <div className="chips">
            {[
              ["tudo", `Tudo (${arquivos.length})`],
              ["imagem", `Imagens (${imagens.length})`, imagens.length],
              ["video", `Vídeos (${videos.length})`, videos.length],
            ]
              .filter((c) => c[2] === undefined || c[2] > 0)
              .map(([k, rot]) => (
                <button
                  key={k}
                  type="button"
                  className={"chip" + (filtro === k ? " on" : "")}
                  onClick={() => setFiltro(k)}
                >
                  {rot}
                </button>
              ))}
          </div>

          {truncado && (
            <div className="banner">
              <b>Mostrando os primeiros {arquivos.length} arquivos. </b>
              A pasta é grande demais para varrer inteira de uma vez — abra uma
              subpasta específica no Drive se faltar alguma coisa.
            </div>
          )}

          {!lista.length ? (
            <div className="empty">Nada com esse filtro.</div>
          ) : (
            <div className="grid g-assets">
              {lista.map((f) => (
                <div className="midia" key={f.id}>
                  <button
                    className="midia-img"
                    type="button"
                    onClick={() => setAberto(f)}
                  >
                    <img
                      src={miniatura(f, 400)}
                      alt={f.name}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    {ehVideo(f) && <div className="midia-play">▶</div>}
                  </button>
                  <div className="midia-nome" title={f.name}>
                    {f.name}
                  </div>
                  <div className="midia-acoes">
                    {!ehVideo(f) && (
                      <button
                        className="btn sm"
                        type="button"
                        onClick={() => copiar(f)}
                      >
                        Copiar
                      </button>
                    )}
                    <button
                      className="btn sm ghost"
                      type="button"
                      onClick={() => baixar(f)}
                    >
                      Baixar
                    </button>
                    {f.webViewLink && (
                      <a
                        className="btn sm ghost"
                        href={f.webViewLink}
                        target="_blank"
                        rel="noopener"
                      >
                        Drive
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {aberto && (
        <div className="overlay" onClick={() => setAberto(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <div className="t">{aberto.name}</div>
              <button
                className="btn sm ghost"
                type="button"
                onClick={() => setAberto(null)}
              >
                ✕
              </button>
            </div>
            {ehVideo(aberto) ? (
              /* Vídeo toca pelo player do próprio Drive: transcodificar ou
                 servir o arquivo bruto seria baixar centenas de MB à toa. */
              <iframe
                src={urlPreview(aberto)}
                title={aberto.name}
                allow="autoplay"
                style={{
                  width: "100%",
                  height: "60vh",
                  border: 0,
                  borderRadius: "var(--radius)",
                  background: "#000",
                }}
              />
            ) : (
              <img
                src={miniatura(aberto, 1600)}
                alt={aberto.name}
                referrerPolicy="no-referrer"
                style={{
                  maxWidth: "100%",
                  maxHeight: "60vh",
                  display: "block",
                  margin: "0 auto",
                  borderRadius: "var(--radius)",
                }}
              />
            )}
            <div className="sub" style={{ marginTop: 10 }}>
              {aberto.mimeType}
              {aberto.size ? " · " + fmtBytes(aberto.size) : ""}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Clientes({ busca }) {
  const auth = useAuth();
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState(null);
  const [erro, setErro] = useState("");
  const [cliente, setCliente] = useState(null);

  if (cliente)
    return (
      <Galeria
        cliente={cliente}
        busca={busca}
        aoVoltar={() => setCliente(null)}
      />
    );

  const aviso = <AvisoDeAcesso />;
  if (auth.expirou || auth.acessoDrive === false) return aviso;
  if (auth.verificando)
    return <div className="empty">Conferindo o seu acesso ao Drive…</div>;

  async function buscar() {
    const t = termo.trim();
    if (!t) {
      setResultados(null);
      return;
    }
    setBuscando(true);
    setErro("");
    setResultados(null);
    try {
      setResultados(await buscarClientes(t));
    } catch (e) {
      setErro(e.message || "erro na busca");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-h">
          <div className="t">Buscar cliente</div>
        </div>
        <div className="field">
          <label>Cliente</label>
          <input
            type="text"
            value={termo}
            placeholder="Nome do cliente — ex: ifood"
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
          />
        </div>
        <div className="chips">
          <button
            className="btn primary"
            type="button"
            onClick={buscar}
            disabled={buscando}
          >
            {buscando ? "buscando…" : "Buscar"}
          </button>
          {resultados && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setTermo("");
                setResultados(null);
              }}
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="banner">
          <b>O Drive recusou a busca. </b>
          {erro}
        </div>
      )}

      {buscando ? (
        <div className="empty">Procurando no Drive…</div>
      ) : !resultados ? (
        <div className="empty">
          Digite o nome do cliente e busque. Aparecem as pastas do Drive que
          você tem acesso.
        </div>
      ) : !resultados.length ? (
        <div className="empty">
          Nenhuma pasta com esse nome. Confira a grafia — ou você pode não ter
          acesso a ela no Drive.
        </div>
      ) : (
        <div className="grid g-cards">
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              className="card cliente-card"
              onClick={() => setCliente(r)}
            >
              <div className="cliente-nome">{r.nome}</div>
              {r.caminho && <div className="cliente-caminho">{r.caminho}</div>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
