import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import { pedirToken } from "../lib/auth.js";
import {
  raizConfigurada,
  nomeDaRaiz,
  listarFilhos,
  trilhaAteRaiz,
  buscarNoAcervo,
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

/* ---------- peças de mídia ---------- */

function Midia({ f, aoAbrir, aoCopiar, aoBaixar }) {
  return (
    <div className="midia">
      <button className="midia-img" type="button" onClick={() => aoAbrir(f)}>
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
          <button className="btn sm" type="button" onClick={() => aoCopiar(f)}>
            Copiar
          </button>
        )}
        <button className="btn sm ghost" type="button" onClick={() => aoBaixar(f)}>
          Baixar
        </button>
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
            src={miniatura(f, 1600)}
            alt={f.name}
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
          {f.mimeType}
          {f.size ? " · " + fmtBytes(f.size) : ""}
        </div>
      </div>
    </div>
  );
}

/* ---------- a aba ---------- */

export default function Clientes({ busca }) {
  const auth = useAuth();
  const raiz = raizConfigurada();

  /* Onde estamos agora. null = ainda não abriu nada, então vale a raiz. */
  const [pastaId, setPastaId] = useState(raiz);
  const [trilha, setTrilha] = useState([]);
  const [conteudo, setConteudo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [achados, setAchados] = useState(null);

  const [tudo, setTudo] = useState(null);
  const [aberto, setAberto] = useState(null);

  /* Trocar a raiz em Configurações tem que devolver a navegação ao topo:
     continuar numa pasta do acervo antigo mostraria o que não é mais
     acervo. */
  useEffect(() => {
    setPastaId(raiz);
    setAchados(null);
    setTudo(null);
  }, [raiz]);

  useEffect(() => {
    if (!pastaId) return;
    let vivo = true;
    setCarregando(true);
    setErro("");
    setTudo(null);
    Promise.all([listarFilhos(pastaId), trilhaAteRaiz(pastaId)])
      .then(([c, t]) => {
        if (!vivo) return;
        setConteudo(c);
        setTrilha(t);
      })
      .catch((e) => vivo && setErro(e.message || "erro ao ler a pasta"))
      .finally(() => vivo && setCarregando(false));
    /* `vivo` evita gravar o conteúdo de uma pasta que já foi trocada — sem
       isso, clicar rápido em duas pastas misturaria os resultados. */
    return () => {
      vivo = false;
    };
  }, [pastaId]);

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

  async function procurar() {
    const t = termo.trim();
    if (!t) {
      setAchados(null);
      return;
    }
    setBuscando(true);
    setErro("");
    setAchados(null);
    try {
      setAchados(await buscarNoAcervo(t));
    } catch (e) {
      setErro(e.message || "erro na busca");
    } finally {
      setBuscando(false);
    }
  }

  async function verTudo() {
    setCarregando(true);
    setErro("");
    try {
      setTudo(await listarMidias(pastaId));
    } catch (e) {
      setErro(e.message || "erro ao varrer a pasta");
    } finally {
      setCarregando(false);
    }
  }

  const aviso = <AvisoDeAcesso />;
  if (auth.expirou || auth.acessoDrive === false) return aviso;
  if (auth.verificando) return <div className="empty">Conferindo o seu acesso ao Drive…</div>;

  if (!raiz)
    return (
      <div className="banner">
        <b>A pasta do acervo ainda não foi escolhida. </b>
        Esta aba só lê o que estiver dentro de uma pasta definida em{" "}
        <b>Configurações › Drive</b>. Enquanto não houver uma, não há onde
        procurar — e procurar no Drive inteiro traria pasta que não é acervo.
        Peça a um admin.
      </div>
    );

  /* O campo de busca do topo filtra o que já está na tela; o campo daqui
     vai ao Drive. São coisas diferentes e por isso convivem. */
  const filtrar = (lista) =>
    busca ? lista.filter((f) => f.name.toLowerCase().includes(busca.toLowerCase())) : lista;

  const emBusca = achados !== null;
  const arquivosNaTela = filtrar(
    emBusca ? achados.arquivos : tudo ? tudo.arquivos : conteudo?.arquivos || []
  );
  const pastasNaTela = emBusca ? achados.pastas : conteudo?.pastas || [];

  function irPara(id) {
    setAchados(null);
    setTermo("");
    setPastaId(id);
  }

  return (
    <>
      <div className="card">
        <div className="field">
          <label>Procurar no acervo</label>
          <input
            type="text"
            value={termo}
            placeholder="Nome do cliente ou do arquivo — ex: bridgestone, motoIfood"
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && procurar()}
          />
        </div>
        <div className="chips">
          <button className="btn primary" type="button" onClick={procurar} disabled={buscando}>
            {buscando ? "procurando…" : "Procurar"}
          </button>
          {emBusca && (
            <button className="btn ghost" type="button" onClick={() => irPara(pastaId)}>
              Voltar a navegar
            </button>
          )}
        </div>
        <div className="sub" style={{ marginTop: 10 }}>
          Procura em qualquer profundidade, só dentro de <b>{nomeDaRaiz()}</b>.
        </div>
      </div>

      {erro && (
        <div className="banner" style={{ borderColor: "var(--danger)" }}>
          <b>Deu problema. </b>
          {erro}
        </div>
      )}

      {!emBusca && trilha.length > 0 && (
        <div className="chips" style={{ marginTop: 14 }}>
          {trilha.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={"chip" + (i === trilha.length - 1 ? " on" : "")}
              onClick={() => irPara(p.id)}
            >
              {p.nome}
            </button>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="empty">Lendo o Drive…</div>
      ) : (
        <>
          {emBusca && !achados.arquivos.length && !achados.pastas.length && (
            <div className="empty">
              Nada com esse nome dentro de {nomeDaRaiz()}. Pode estar escrito
              diferente, ou em outra pasta do Drive que não é acervo.
            </div>
          )}

          {pastasNaTela.length > 0 && (
            <>
              <div className="sub" style={{ margin: "18px 0 8px" }}>
                {emBusca ? "Pastas com esse nome" : "Pastas"} ({pastasNaTela.length})
              </div>
              <div className="grid g-cards">
                {pastasNaTela.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="card cliente-card"
                    onClick={() => irPara(p.id)}
                  >
                    <div className="cliente-nome">📁 {p.nome}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {arquivosNaTela.length > 0 && (
            <>
              <div className="sub" style={{ margin: "18px 0 8px" }}>
                {emBusca ? "Arquivos encontrados" : tudo ? "Tudo desta pasta e das de dentro" : "Arquivos aqui"}{" "}
                ({arquivosNaTela.length})
                {tudo?.truncado && " — parei no teto, a pasta é grande"}
              </div>
              <div className="grid g-assets">
                {arquivosNaTela.map((f) => (
                  <Midia key={f.id} f={f} aoAbrir={setAberto} aoCopiar={copiar} aoBaixar={baixar} />
                ))}
              </div>
            </>
          )}

          {!emBusca && !tudo && conteudo && (
            <div className="chips" style={{ marginTop: 18 }}>
              <button className="btn" type="button" onClick={verTudo}>
                Ver todas as imagens desta pasta e das de dentro
              </button>
            </div>
          )}

          {!emBusca &&
            conteudo &&
            !conteudo.pastas.length &&
            !conteudo.arquivos.length &&
            !tudo && <div className="empty">Esta pasta está vazia.</div>}
        </>
      )}

      <Visor f={aberto} aoFechar={() => setAberto(null)} />
    </>
  );
}
