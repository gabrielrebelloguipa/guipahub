import { usePode } from "../lib/permissoes.js";
import { useState } from "react";
import { useEstado, alterar, uid } from "../lib/estado.js";
import {
  useCompartilhado,
  publicarPrompt,
  normaliza,
} from "../lib/compartilhado.js";
import { useAuth } from "../lib/useAuth.js";
import {
  CATEGORIAS_PROMPT,
  categoriaPrompt,
  FERRAMENTAS_IA,
} from "../lib/constantes.js";
import Modal, { Confirmar } from "../componentes/Modal.jsx";
import AvisoAlcance from "../componentes/AvisoAlcance.jsx";

function FormPrompt({ inicial, aoFechar }) {
  const novo = !inicial;
  const [p, setP] = useState(
    inicial || {
      titulo: "",
      texto: "",
      tags: [],
      favorito: false,
      categoria: "imagem",
      ferramenta: "",
      modelo: "",
    }
  );
  const [tagsTexto, setTagsTexto] = useState((inicial?.tags || []).join(", "));

  function salvar() {
    const titulo = p.titulo.trim();
    if (!titulo) return;
    const alvo = {
      ...p,
      id: p.id || uid("p"),
      titulo,
      tags: tagsTexto
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    alterar((e) => ({
      prompts: novo
        ? [alvo, ...e.prompts]
        : e.prompts.map((x) => (x.id === alvo.id ? alvo : x)),
    }));
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Novo prompt" : "Editar prompt"}
      aoFechar={aoFechar}
      largo
      acoes={
        <>
          <button className="btn ghost" type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primary" type="button" onClick={salvar}>
            Salvar
          </button>
        </>
      }
    >
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
          <select
            value={p.categoria}
            onChange={(e) => setP({ ...p, categoria: e.target.value })}
          >
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


/* A biblioteca e o balcao comum: qualquer um publica, qualquer um leva
   uma copia para os prompts pessoais. Importar COPIA de proposito —
   depois de importado o prompt e seu, e editar nao mexe no dos outros.
   Referencia viva daria versionamento e conflito para um problema que
   ninguem tem. */
function Biblioteca({ aoFechar }) {
  const compartilhado = useCompartilhado();
  const estado = useEstado();
  const [filtro, setFiltro] = useState("");
  const [importados, setImportados] = useState([]);

  const lista = (compartilhado.biblioteca || []).filter((p) =>
    filtro
      ? (p.titulo + " " + p.texto + " " + (p.tags || []).join(" "))
          .toLowerCase()
          .includes(filtro.toLowerCase())
      : true
  );

  /* Ja tenho isto? Compara pelo titulo sem acento e sem maiuscula —
     evita a pessoa importar o mesmo prompt tres vezes sem perceber. */
  function jaTenho(p) {
    return estado.prompts.some((x) => normaliza(x.titulo) === normaliza(p.titulo));
  }

  function importar(p) {
    alterar((e) => ({
      prompts: [
        {
          id: uid("p"),
          titulo: p.titulo,
          texto: p.texto,
          tags: [...(p.tags || [])],
          categoria: p.categoria || "outro",
          ferramenta: p.ferramenta || "",
          modelo: p.modelo || "",
          favorito: false,
          daBiblioteca: p.id,
        },
        ...e.prompts,
      ],
    }));
    setImportados((v) => [...v, p.id]);
  }

  return (
    <Modal titulo="Biblioteca de prompts" aoFechar={aoFechar} largo>
      <AvisoAlcance>
        Prompts que o time publicou. Importar traz uma <b>cópia</b> para os
        seus — depois é seu, e editar não afeta ninguém.
      </AvisoAlcance>

      <div className="field">
        <input
          type="text"
          value={filtro}
          placeholder="Buscar na biblioteca..."
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      {!lista.length ? (
        <div className="empty">
          {filtro
            ? "Nada encontrado."
            : "A biblioteca esta vazia. Publique um prompt pelo botao Publicar num card."}
        </div>
      ) : (
        <div className="list">
          {lista.map((p) => {
            const cat = categoriaPrompt(p.categoria);
            const tenho = jaTenho(p);
            const acabouDeImportar = importados.includes(p.id);
            return (
              <div className="row" key={p.id} style={{ cursor: "default" }}>
                <div className="bar" style={{ background: cat.cor }} />
                <div className="body">
                  <div className="ttl">{p.titulo}</div>
                  <div className="meta">
                    <span>{cat.label}</span>
                    {p.ferramenta && <span>&#9655; {p.ferramenta}</span>}
                    {p.criadoPor && <span>por {p.criadoPor}</span>}
                  </div>
                </div>
                <div className="right">
                  <button
                    className={"btn sm" + (tenho || acabouDeImportar ? " ghost" : "")}
                    type="button"
                    disabled={acabouDeImportar}
                    onClick={() => importar(p)}
                  >
                    {acabouDeImportar
                      ? "importado"
                      : tenho
                      ? "importar de novo"
                      : "Importar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default function Prompts({ busca }) {
  const estado = useEstado();
  const compartilhado = useCompartilhado();
  const auth = useAuth();
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [copiado, setCopiado] = useState("");
  const [bibliotecaAberta, setBibliotecaAberta] = useState(false);
  const [publicado, setPublicado] = useState("");
  const podeFazer = usePode();

  /* Publicar um titulo que ja esta na biblioteca e ATUALIZAR o que esta
     la -- e para o banco isso e um UPDATE, que exige "editar", nao so
     "publicar". Sem conferir aqui, o botao apareceria e o banco recusaria
     com uma mensagem que nao explica o motivo. */
  function podePublicar(p) {
    const jaExiste = (compartilhado.biblioteca || []).some(
      (b) => normaliza(b.titulo) === normaliza(p.titulo)
    );
    return jaExiste ? podeFazer("prompts", "editar") : podeFazer("prompts", "publicar");
  }

  /* Publicar manda uma copia para o balcao comum. Republicar o mesmo
     prompt atualiza o que esta la em vez de criar um segundo igual. */
  async function publicar(p) {
    const r = await publicarPrompt(p, auth.perfil?.email || "");
    if (!r.ok) { alert(r.erro); return; }
    setPublicado(p.id);
    setTimeout(() => setPublicado(""), 1800);
  }

  const lista = estado.prompts
    .filter((p) =>
      estado.filtroPromptCat ? (p.categoria || "outro") === estado.filtroPromptCat : true
    )
    .filter((p) =>
      busca
        ? (p.titulo + " " + p.texto + " " + (p.tags || []).join(" ") + " " +
           (p.ferramenta || "") + " " + (p.modelo || ""))
            .toLowerCase()
            .includes(busca.toLowerCase())
        : true
    );

  async function copiar(p) {
    try {
      await navigator.clipboard.writeText(p.texto || "");
      setCopiado(p.id);
      setTimeout(() => setCopiado(""), 1600);
    } catch {
      alert("Não consegui copiar para a área de transferência");
    }
  }

  return (
    <>
      <div className="chips">
        <button
          className={"chip" + (!estado.filtroPromptCat ? " on" : "")}
          type="button"
          onClick={() => alterar({ filtroPromptCat: "" })}
        >
          Todos
        </button>
        {CATEGORIAS_PROMPT.map((cat) => {
          const n = estado.prompts.filter(
            (p) => (p.categoria || "outro") === cat.key
          ).length;
          if (!n) return null;
          return (
            <button
              key={cat.key}
              type="button"
              className={"chip" + (estado.filtroPromptCat === cat.key ? " on" : "")}
              onClick={() =>
                alterar({
                  filtroPromptCat:
                    estado.filtroPromptCat === cat.key ? "" : cat.key,
                })
              }
            >
              <span className="dot" style={{ background: cat.cor }} />
              <span>
                {cat.label} ({n})
              </span>
            </button>
          );
        })}
        <button
          className="btn sm"
          type="button"
          style={{ marginLeft: "auto" }}
          onClick={() => setBibliotecaAberta(true)}
        >
          Biblioteca ({(compartilhado.biblioteca || []).length})
        </button>
        <button className="btn primary sm" type="button" onClick={() => setCriando(true)}>
          ＋ Novo prompt
        </button>
      </div>

      {!lista.length ? (
        <div className="empty">
          {busca
            ? `Nada encontrado para “${busca}”.`
            : "Nenhum prompt salvo ainda."}
        </div>
      ) : (
        <div className="grid g-cards">
          {lista.map((p) => {
            const cat = categoriaPrompt(p.categoria);
            return (
              <div className="card" key={p.id}>
                <div className="card-h">
                  <div className="t" style={{ textTransform: "none", fontSize: "0.9rem", color: "var(--text)" }}>
                    {p.titulo}
                  </div>
                  <div className="a">
                    <button
                      className="btn sm ghost"
                      type="button"
                      title="Favorito"
                      onClick={() =>
                        alterar((e) => ({
                          prompts: e.prompts.map((x) =>
                            x.id === p.id ? { ...x, favorito: !x.favorito } : x
                          ),
                        }))
                      }
                    >
                      {p.favorito ? "★" : "☆"}
                    </button>
                  </div>
                </div>

                <span className="tag" style={{ borderColor: cat.cor, color: cat.cor }}>
                  {cat.label}
                </span>

                {/* onde usar: é o que se precisa bater o olho e saber */}
                {(p.ferramenta || p.modelo) && (
                  <div className="sub">
                    ▷ {p.ferramenta}
                    {p.modelo ? " · " + p.modelo : ""}
                  </div>
                )}

                <div className="note" style={{ marginTop: 10, maxHeight: 120, overflow: "hidden" }}>
                  {p.texto}
                </div>

                <div className="midia-acoes" style={{ marginTop: 12 }}>
                  <button className="btn sm" type="button" onClick={() => copiar(p)}>
                    {copiado === p.id ? "copiado ✓" : "Copiar"}
                  </button>
                  {podePublicar(p) && (
                    <button
                      className="btn sm ghost"
                      type="button"
                      title="Mandar uma copia para a biblioteca do time"
                      onClick={() => publicar(p)}
                    >
                      {publicado === p.id ? "publicado" : "Publicar"}
                    </button>
                  )}
                  <button
                    className="btn sm ghost"
                    type="button"
                    onClick={() => setEditando(p)}
                  >
                    Editar
                  </button>
                  <button
                    className="btn sm ghost danger"
                    type="button"
                    onClick={() => setExcluindo(p)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bibliotecaAberta && <Biblioteca aoFechar={() => setBibliotecaAberta(false)} />}
      {criando && <FormPrompt aoFechar={() => setCriando(false)} />}
      {editando && (
        <FormPrompt inicial={editando} aoFechar={() => setEditando(null)} />
      )}
      {excluindo && (
        <Confirmar
          mensagem={`Excluir o prompt “${excluindo.titulo}”? Isso não tem volta.`}
          aoConfirmar={() =>
            alterar((e) => ({
              prompts: e.prompts.filter((x) => x.id !== excluindo.id),
            }))
          }
          aoFechar={() => setExcluindo(null)}
        />
      )}
    </>
  );
}
