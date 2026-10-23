import { useEffect, useState } from "react";
import { usePode } from "../lib/permissoes.js";
import { useAuth } from "../lib/useAuth.js";
import {
  useCompartilhado,
  publicarPrompt,
  normaliza,
  pessoas,
  nomeDe,
} from "../lib/compartilhado.js";
import {
  usePrompts,
  salvarPrompt,
  excluirPrompt,
  alternarFavorito,
  favoritarDoTime,
  enviarPrompt,
} from "../lib/prompts.js";
import { CATEGORIAS_PROMPT, categoriaPrompt, FERRAMENTAS_IA } from "../lib/constantes.js";
import Modal, { Confirmar } from "../componentes/Modal.jsx";

function FormPrompt({ inicial, aoFechar, aoEnviar, podePublicar }) {
  const auth = useAuth();
  const novo = !inicial;
  const [p, setP] = useState(
    inicial || { titulo: "", texto: "", tags: [], favorito: false, categoria: "imagem", ferramenta: "", modelo: "" }
  );
  const [tagsTexto, setTagsTexto] = useState((inicial?.tags || []).join(", "));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [publicado, setPublicado] = useState(false);

  async function publicar() {
    const r = await publicarPrompt(p, auth.perfil?.email || "");
    if (!r.ok) return setErro(r.erro);
    setPublicado(true);
  }

  async function salvar() {
    if (!p.titulo.trim()) return;
    setSalvando(true);
    const r = await salvarPrompt(
      { ...p, tags: tagsTexto.split(",").map((t) => t.trim()).filter(Boolean) },
      auth.perfil?.email
    );
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Novo prompt" : "Editar prompt"}
      aoFechar={aoFechar}
      largo
      acoes={
        <>
          {!novo && aoEnviar && (
            <button className="btn sm ghost" type="button" onClick={() => aoEnviar(inicial)}>
              Enviar para…
            </button>
          )}
          {!novo && podePublicar && (
            <button
              className="btn sm ghost"
              type="button"
              style={{ marginRight: "auto" }}
              disabled={publicado}
              onClick={publicar}
            >
              {publicado ? "Publicado no time ✓" : "Publicar no time"}
            </button>
          )}
          <button className="btn ghost" type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primary" type="button" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      {erro && <div className="banner" style={{ borderColor: "var(--danger)" }}>{erro}</div>}
      <div className="field">
        <label>Título</label>
        <input
          type="text"
          value={p.titulo}
          placeholder="Ex: render de moto com baú"
          onChange={(e) => setP({ ...p, titulo: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Prompt</label>
        <textarea
          value={p.texto}
          style={{ minHeight: 160 }}
          placeholder="O texto que você cola na ferramenta"
          onChange={(e) => setP({ ...p, texto: e.target.value })}
        />
      </div>
      <div className="f-row">
        <div className="field">
          <label>Categoria</label>
          <select value={p.categoria} onChange={(e) => setP({ ...p, categoria: e.target.value })}>
            {CATEGORIAS_PROMPT.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Onde usar</label>
          {/* texto livre com sugestões: aceita ferramenta que nem existe ainda */}
          <input
            type="text"
            list="ferramentas-ia"
            value={p.ferramenta}
            placeholder="ChatGPT, Firefly, Gemini…"
            onChange={(e) => setP({ ...p, ferramenta: e.target.value })}
          />
          <datalist id="ferramentas-ia">
            {FERRAMENTAS_IA.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Modelo</label>
          <input
            type="text"
            value={p.modelo}
            placeholder="Veo 3.1, Imagen 4…"
            onChange={(e) => setP({ ...p, modelo: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Tags (separadas por vírgula)</label>
        <input
          type="text"
          value={tagsTexto}
          placeholder="produto, social, campanha…"
          onChange={(e) => setTagsTexto(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/* Escolhe o colega e manda uma cópia. A lista é de quem já entrou no
   GuipaHub — quem nunca entrou ainda não tem onde receber. */
function EnviarPrompt({ prompt, time, aoFechar }) {
  const auth = useAuth();
  const eu = (auth.perfil?.email || "").toLowerCase();
  const colegas = time.filter((p) => p.email?.toLowerCase() !== eu);
  const [para, setPara] = useState("");
  const [estado, setEstado] = useState(""); // "" | "enviando" | "ok" | erro

  async function enviar() {
    if (!para) return;
    setEstado("enviando");
    const r = await enviarPrompt(prompt, para);
    setEstado(r.ok ? "ok" : r.erro);
  }

  return (
    <Modal
      titulo={"Enviar “" + prompt.titulo + "”"}
      aoFechar={aoFechar}
      acoes={
        estado === "ok" ? (
          <button className="btn primary" type="button" onClick={aoFechar}>
            Fechar
          </button>
        ) : (
          <>
            <button className="btn ghost" type="button" onClick={aoFechar}>
              Cancelar
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={!para || estado === "enviando"}
              onClick={enviar}
            >
              {estado === "enviando" ? "Enviando…" : "Enviar"}
            </button>
          </>
        )
      }
    >
      {estado === "ok" ? (
        <div className="note">Enviado para {nomeDe(para, time)}.</div>
      ) : (
        <>
          <div className="field">
            <label>Para</label>
            <select value={para} onChange={(e) => setPara(e.target.value)}>
              <option value="">Escolha a pessoa</option>
              {colegas.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.nome || p.email}
                </option>
              ))}
            </select>
          </div>
          {estado && estado !== "enviando" && (
            <div className="banner" style={{ borderColor: "var(--danger)" }}>{estado}</div>
          )}
        </>
      )}
    </Modal>
  );
}

/* Card no mesmo desenho do Guipa Manager: ★ e título em cima com a
   categoria à direita, onde usar em etiquetas, o começo do texto e três
   botões. Enviar e publicar ficam dentro do Editar. Embaixo do texto, em
   letra pequena, quem escreveu e quem mandou. */
function CartaoPrompt({ p, time, doTime, favorito, aoFavoritar, copiado, aoCopiar, aoEditar, aoExcluir }) {
  const cat = categoriaPrompt(p.categoria);
  const autor = p.criadoPor ? nomeDe(p.criadoPor, time) : "";
  return (
    <div className="card prompt-card">
      <div className="card-h">
        <button
          className={"icon-ghost prompt-estrela" + (favorito ? " on" : "")}
          type="button"
          title={favorito ? "Tirar dos favoritos" : "Favoritar"}
          aria-pressed={favorito}
          onClick={aoFavoritar}
        >
          {favorito ? "★" : "☆"}
        </button>
        <div className="prompt-titulo">{p.titulo}</div>
        <div className="a">
          <span className="tag solid" style={{ background: cat.cor }}>
            {cat.label}
          </span>
        </div>
      </div>
      {(p.ferramenta || p.modelo) && (
        <div className="prompt-onde">
          {p.ferramenta && <span className="tag prompt-ferramenta">▷ {p.ferramenta}</span>}
          {p.modelo && <span className="tag">{p.modelo}</span>}
        </div>
      )}
      <div className="prompt-texto">{p.texto}</div>
      {(p.tags || []).length > 0 && (
        <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
          {p.tags.map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}
      {(autor || p.enviadoPor || doTime) && (
        <div className="prompt-autoria">
          {doTime && <span className="prompt-selo">do time</span>}
          {autor && <span>por {autor}</span>}
          {p.enviadoPor && <span>enviado por {nomeDe(p.enviadoPor, time)}</span>}
        </div>
      )}
      <div className="prompt-acoes">
        <button className="btn sm primary" type="button" onClick={aoCopiar}>
          {copiado ? "Copiado ✓" : "Copiar"}
        </button>
        {aoEditar && (
          <button className="btn sm ghost" type="button" onClick={aoEditar}>
            Editar
          </button>
        )}
        {aoExcluir && (
          <button className="btn sm ghost" type="button" onClick={aoExcluir}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default function Prompts({ busca }) {
  const auth = useAuth();
  const email = auth.perfil?.email || "";
  const compartilhado = useCompartilhado();
  const { meus, favoritos, carregando, erro } = usePrompts();
  const podeFazer = usePode();
  const [aba, setAba] = useState("meus");
  const [cat, setCat] = useState("");
  const [time, setTime] = useState([]);
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [enviando, setEnviando] = useState(null);
  const [copiado, setCopiado] = useState("");
  const [falha, setFalha] = useState("");

  useEffect(() => {
    pessoas().then(setTime);
  }, []);

  const biblioteca = compartilhado.biblioteca || [];
  const favoritosDoTime = biblioteca.filter((b) => favoritos.includes(b.id));

  /* Publicar um título que já está na biblioteca é ATUALIZAR o que está
     lá — para o banco é um UPDATE, que exige "editar", não só "publicar". */
  function podePublicar(p) {
    const jaExiste = biblioteca.some((b) => normaliza(b.titulo) === normaliza(p.titulo));
    return jaExiste ? podeFazer("prompts", "editar") : podeFazer("prompts", "publicar");
  }

  async function rodar(promessa) {
    const r = await promessa;
    if (!r.ok) setFalha(r.erro);
    return r.ok;
  }

  async function copiar(p) {
    try {
      await navigator.clipboard.writeText(p.texto || "");
      setCopiado(p.id);
      setTimeout(() => setCopiado(""), 1600);
    } catch {
      setFalha("Não consegui copiar para a área de transferência.");
    }
  }

  const bate = (p) =>
    (cat ? (p.categoria || "outro") === cat : true) &&
    (busca
      ? (p.titulo + " " + p.texto + " " + (p.tags || []).join(" ") + " " + (p.ferramenta || "") + " " + (p.modelo || ""))
          .toLowerCase()
          .includes(busca.toLowerCase())
      : true);

  /* Na aba da pessoa: favoritos primeiro (os dela e os do time), depois o
     resto dos dela. */
  const daAba =
    aba === "meus"
      ? [
          ...meus.filter((p) => p.favorito).map((p) => ({ p, doTime: false })),
          ...favoritosDoTime.map((p) => ({ p, doTime: true })),
          ...meus.filter((p) => !p.favorito).map((p) => ({ p, doTime: false })),
        ]
      : biblioteca.map((p) => ({ p, doTime: true }));
  const lista = daAba.filter(({ p }) => bate(p));
  const contagem = (k) => daAba.filter(({ p }) => (p.categoria || "outro") === k).length;

  return (
    <>
      <div className="chips" style={{ alignItems: "center" }}>
        <div className="seg">
          <button type="button" className={aba === "meus" ? "on" : ""} onClick={() => setAba("meus")}>
            Meus prompts ({meus.length + favoritosDoTime.length})
          </button>
          <button type="button" className={aba === "time" ? "on" : ""} onClick={() => setAba("time")}>
            Biblioteca do time ({biblioteca.length})
          </button>
        </div>
        <button className="btn primary sm" type="button" style={{ marginLeft: "auto" }} onClick={() => setCriando(true)}>
          ＋ Novo prompt
        </button>
      </div>

      <div className="chips" style={{ marginTop: 10 }}>
        <button className={"chip" + (!cat ? " on" : "")} type="button" onClick={() => setCat("")}>
          Todos
        </button>
        {CATEGORIAS_PROMPT.map((c) => {
          const n = contagem(c.key);
          if (!n) return null;
          return (
            <button
              key={c.key}
              type="button"
              className={"chip" + (cat === c.key ? " on" : "")}
              onClick={() => setCat(cat === c.key ? "" : c.key)}
            >
              <span className="dot" style={{ background: c.cor }} />
              <span>
                {c.label} ({n})
              </span>
            </button>
          );
        })}
      </div>

      {(erro || falha) && (
        <div className="banner" style={{ borderColor: "var(--danger)" }}>
          {erro || falha}
        </div>
      )}

      {carregando && aba === "meus" ? (
        <div className="empty">Carregando…</div>
      ) : !lista.length ? (
        <div className="empty">
          {busca || cat
            ? "Nada encontrado."
            : aba === "meus"
            ? "Nenhum prompt ainda."
            : "A biblioteca do time está vazia."}
        </div>
      ) : (
        <div className="grid g-cards">
          {lista.map(({ p, doTime }) =>
            doTime ? (
              <CartaoPrompt
                key={"t" + p.id}
                p={p}
                time={time}
                doTime
                favorito={favoritos.includes(p.id)}
                aoFavoritar={() => rodar(favoritarDoTime(p.id, email, !favoritos.includes(p.id)))}
                copiado={copiado === p.id}
                aoCopiar={() => copiar(p)}
              />
            ) : (
              <CartaoPrompt
                key={p.id}
                p={p}
                time={time}
                favorito={p.favorito}
                aoFavoritar={() => rodar(alternarFavorito(p))}
                copiado={copiado === p.id}
                aoCopiar={() => copiar(p)}
                aoEditar={() => setEditando(p)}
                aoExcluir={() => setExcluindo(p)}
              />
            )
          )}
        </div>
      )}

      {criando && <FormPrompt aoFechar={() => setCriando(false)} />}
      {editando && (
        <FormPrompt
          inicial={editando}
          aoFechar={() => setEditando(null)}
          podePublicar={podePublicar(editando)}
          aoEnviar={(p) => {
            setEditando(null);
            setEnviando(p);
          }}
        />
      )}
      {enviando && <EnviarPrompt prompt={enviando} time={time} aoFechar={() => setEnviando(null)} />}
      {excluindo && (
        <Confirmar
          mensagem={`Excluir o prompt “${excluindo.titulo}”? Isso não tem volta.`}
          aoConfirmar={() => rodar(excluirPrompt(excluindo.id))}
          aoFechar={() => setExcluindo(null)}
        />
      )}
    </>
  );
}
