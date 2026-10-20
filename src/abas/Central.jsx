import { useEffect, useState } from "react";
import { useEstado, alterar, uid } from "../lib/estado.js";
import { CATEGORIAS_MATERIAL, GRUPOS_GUIA } from "../lib/constantes.js";
import Modal, { Confirmar } from "../componentes/Modal.jsx";
import {
  guardarArquivo,
  apagarArquivo,
  urlDoArquivo,
  liberarUrl,
  buscarArquivo,
  rasterizarParaPng,
  LIMITE_BYTES,
} from "../lib/arquivos.js";

/* Identidade oficial — Manual de Marca GUIPA (Brandbook 2025).
   Só identidade visual, que existe justamente para ser distribuída.
   Nada de preço, carteira, política de BV ou material comercial. */
const MARCA_CORES = [
  { nome: "Laranja GUIPA", hex: "#F76E00", uso: "cor de marca — símbolo e destaques" },
  { nome: "Azul-noite", hex: "#151D23", uso: "fundo escuro padrão" },
  { nome: "Azul-noite alt.", hex: "#141C21", uso: "variação de fundo" },
  { nome: "Azul médio", hex: "#293945", uso: "apoio" },
  { nome: "Cinza", hex: "#AFAFAF", uso: "apoio / neutro" },
  { nome: "Branco", hex: "#FDFDFD", uso: "fundo claro e texto sobre escuro" },
];
const MARCA_TIPO = "SF Pro — toda a comunicação.";
const MARCA_ALERTA =
  "Materiais antigos (kit Canva) usam laranja #FC7309. O oficial do brandbook é #F76E00 — em conflito, vale o brandbook.";

/* ---------- Materiais ---------- */

function FormMaterial({ inicial, aoFechar }) {
  const novo = !inicial;
  const [m, setM] = useState(
    inicial || { nome: "", categoria: CATEGORIAS_MATERIAL[0], url: "", notas: "" }
  );

  function salvar() {
    const nome = m.nome.trim();
    if (!nome) return;
    let url = m.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    const alvo = { ...m, id: m.id || uid("m"), nome, url };
    alterar((e) => ({
      central: novo
        ? [alvo, ...e.central]
        : e.central.map((x) => (x.id === alvo.id ? alvo : x)),
    }));
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Novo material" : "Editar material"}
      aoFechar={aoFechar}
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
        <label>Nome</label>
        <input
          type="text"
          value={m.nome}
          onChange={(e) => setM({ ...m, nome: e.target.value })}
        />
      </div>
      <div className="f-row">
        <div className="field">
          <label>Categoria</label>
          <select
            value={m.categoria}
            onChange={(e) => setM({ ...m, categoria: e.target.value })}
          >
            {CATEGORIAS_MATERIAL.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Link</label>
          <input
            type="text"
            value={m.url}
            placeholder="Link do Drive"
            onChange={(e) => setM({ ...m, url: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Descrição</label>
        <textarea
          value={m.notas}
          placeholder="O que é e quando usar"
          onChange={(e) => setM({ ...m, notas: e.target.value })}
        />
      </div>
    </Modal>
  );
}

function Materiais({ busca }) {
  const estado = useEstado();
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState(null);

  const lista = estado.central
    .filter((m) => (estado.filtroCat ? m.categoria === estado.filtroCat : true))
    .filter((m) =>
      busca
        ? (m.nome + " " + (m.notas || "")).toLowerCase().includes(busca.toLowerCase())
        : true
    );

  return (
    <>
      <div className="chips">
        <button
          className={"chip" + (!estado.filtroCat ? " on" : "")}
          type="button"
          onClick={() => alterar({ filtroCat: "" })}
        >
          Tudo
        </button>
        {CATEGORIAS_MATERIAL.map((c) => {
          const n = estado.central.filter((m) => m.categoria === c).length;
          if (!n) return null;
          return (
            <button
              key={c}
              type="button"
              className={"chip" + (estado.filtroCat === c ? " on" : "")}
              onClick={() =>
                alterar({ filtroCat: estado.filtroCat === c ? "" : c })
              }
            >
              {c} ({n})
            </button>
          );
        })}
        <button
          className="btn primary sm"
          type="button"
          style={{ marginLeft: "auto" }}
          onClick={() => setCriando(true)}
        >
          ＋ Material
        </button>
      </div>

      {!lista.length ? (
        <div className="empty">
          Nenhum material cadastrado. Aponte para as pastas e arquivos oficiais
          da GUIPA no Drive.
        </div>
      ) : (
        <div className="list">
          {lista.map((m) => (
            <div className="row" key={m.id} style={{ cursor: "default" }}>
              <div className="bar" style={{ background: "var(--accent)" }} />
              <div className="body">
                <div className="ttl">{m.nome}</div>
                <div className="meta">
                  <span>{m.categoria}</span>
                  {m.notas && <span>{m.notas}</span>}
                </div>
              </div>
              <div className="right">
                {m.url && (
                  <a className="btn sm" href={m.url} target="_blank" rel="noopener">
                    Abrir
                  </a>
                )}
                <button
                  className="btn sm ghost"
                  type="button"
                  onClick={() => setEditando(m)}
                >
                  Editar
                </button>
                <button
                  className="btn sm ghost danger"
                  type="button"
                  onClick={() => setExcluindo(m)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {criando && <FormMaterial aoFechar={() => setCriando(false)} />}
      {editando && (
        <FormMaterial inicial={editando} aoFechar={() => setEditando(null)} />
      )}
      {excluindo && (
        <Confirmar
          mensagem={`Excluir “${excluindo.nome}”?`}
          aoConfirmar={() =>
            alterar((e) => ({
              central: e.central.filter((x) => x.id !== excluindo.id),
            }))
          }
          aoFechar={() => setExcluindo(null)}
        />
      )}
    </>
  );
}

/* ---------- Imagens GUIPA ---------- */

function Miniatura({ chave, alt }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivo = true;
    urlDoArquivo(chave).then((u) => vivo && setUrl(u));
    return () => {
      vivo = false;
    };
  }, [chave]);
  if (!url) return <div className="midia-sem">carregando…</div>;
  return <img src={url} alt={alt} />;
}

function ImagensGuipa({ busca }) {
  const estado = useEstado();
  const [excluindo, setExcluindo] = useState(null);
  const [aviso, setAviso] = useState("");
  const [renomeando, setRenomeando] = useState(null);

  async function processar(arquivos) {
    const problemas = [];
    for (const f of arquivos) {
      if (!/^image\//.test(f.type)) {
        problemas.push(`${f.name}: não é imagem`);
        continue;
      }
      if (f.size > LIMITE_BYTES) {
        problemas.push(`${f.name}: passa de 25 MB`);
        continue;
      }
      const chave = uid("img");
      await guardarArquivo(chave, f);
      alterar((e) => ({
        imagensGuipa: [
          ...e.imagensGuipa,
          { id: uid("ig"), nome: f.name.replace(/\.[^.]+$/, ""), arquivoChave: chave },
        ],
      }));
    }
    setAviso(problemas.join(" · "));
  }

  async function copiar(item) {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      alert("Este navegador não copia imagem para a área de transferência");
      return;
    }
    try {
      const blob = await buscarArquivo(item.arquivoChave);
      if (!blob) throw new Error("arquivo não encontrado neste navegador");
      const png = await rasterizarParaPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    } catch (e) {
      alert("Não consegui copiar: " + (e.message || "erro"));
    }
  }

  const lista = estado.imagensGuipa.filter((i) =>
    busca ? i.nome.toLowerCase().includes(busca.toLowerCase()) : true
  );

  return (
    <>
      <div className="banner">
        Imagens de referência que você cola em chats de IA — render-base da moto,
        logos. Ficam <b>só neste navegador</b>: não são compartilhadas com o time
        e o Exportar dados não leva o conteúdo binário junto.
      </div>

      <div className="chips">
        <label className="btn primary sm" style={{ cursor: "pointer" }}>
          ＋ Adicionar imagens
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              processar([...e.target.files]);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {aviso && <div className="banner">{aviso}</div>}

      {!lista.length ? (
        <div className="empty">Nenhuma imagem guardada ainda.</div>
      ) : (
        <div className="grid g-assets">
          {lista.map((i) => (
            <div className="midia" key={i.id}>
              <div className="midia-img">
                <Miniatura chave={i.arquivoChave} alt={i.nome} />
              </div>
              {renomeando === i.id ? (
                <input
                  type="text"
                  autoFocus
                  defaultValue={i.nome}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v)
                      alterar((s) => ({
                        imagensGuipa: s.imagensGuipa.map((x) =>
                          x.id === i.id ? { ...x, nome: v } : x
                        ),
                      }));
                    setRenomeando(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                />
              ) : (
                <div
                  className="midia-nome"
                  title="Duplo clique para renomear"
                  onDoubleClick={() => setRenomeando(i.id)}
                >
                  {i.nome}
                </div>
              )}
              <div className="midia-acoes">
                <button className="btn sm" type="button" onClick={() => copiar(i)}>
                  Copiar
                </button>
                <button
                  className="btn sm ghost danger"
                  type="button"
                  onClick={() => setExcluindo(i)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {excluindo && (
        <Confirmar
          mensagem={`Excluir a imagem “${excluindo.nome}”? O arquivo sai do navegador junto.`}
          aoConfirmar={async () => {
            /* apaga o blob junto — senão fica arquivo órfão no IndexedDB
               ocupando espaço que ninguém mais consegue enxergar */
            liberarUrl(excluindo.arquivoChave);
            await apagarArquivo(excluindo.arquivoChave);
            alterar((e) => ({
              imagensGuipa: e.imagensGuipa.filter((x) => x.id !== excluindo.id),
            }));
          }}
          aoFechar={() => setExcluindo(null)}
        />
      )}
    </>
  );
}

/* As cores moram aqui, e nao em Materiais, porque quem procura cor
   esta procurando medida da marca -- nao um arquivo para baixar. */
function CoresGuipa() {
  const [copiado, setCopiado] = useState("");
  return (
    <>
    <div className="card">
      <div className="card-h">
        <div className="t">Cores GUIPA</div>
      </div>
      <div className="sw-grid">
        {MARCA_CORES.map((c) => (
          <button
            className="sw"
            key={c.hex}
            type="button"
            title="Clique para copiar o hex"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(c.hex);
                setCopiado(c.hex);
                setTimeout(() => setCopiado(""), 1400);
              } catch {
                /* clipboard bloqueado: o hex está escrito no card mesmo */
              }
            }}
          >
            <div className="chip-cor" style={{ background: c.hex }} />
            <div className="info">
              <div className="n">{c.nome}</div>
              <div className="h">{copiado === c.hex ? "copiado ✓" : c.hex}</div>
              <div className="u">{c.uso}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="sub" style={{ marginTop: 12 }}>
        <b>Tipografia:</b> {MARCA_TIPO}
      </div>
      <div className="banner" style={{ marginTop: 10 }}>
        {MARCA_ALERTA}
      </div>
    </div>
    </>
  );
}

/* ---------- Guias e medidas ---------- */

function FormGuia({ inicial, aoFechar }) {
  const novo = !inicial;
  const [g, setG] = useState(
    inicial || { titulo: "", grupo: GRUPOS_GUIA[0], valor: "", notas: "" }
  );

  function salvar() {
    const titulo = g.titulo.trim();
    if (!titulo) return;
    const alvo = { ...g, id: g.id || uid("g"), titulo, pendente: !g.valor.trim() };
    alterar((e) => ({
      guias: novo
        ? [...e.guias, alvo]
        : e.guias.map((x) => (x.id === alvo.id ? alvo : x)),
    }));
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Novo guia" : "Editar guia"}
      aoFechar={aoFechar}
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
          value={g.titulo}
          placeholder="Ex: medida da tela LED do baú"
          onChange={(e) => setG({ ...g, titulo: e.target.value })}
        />
      </div>
      <div className="f-row">
        <div className="field">
          <label>Grupo</label>
          <select value={g.grupo} onChange={(e) => setG({ ...g, grupo: e.target.value })}>
            {GRUPOS_GUIA.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Valor</label>
          <input
            type="text"
            value={g.valor}
            placeholder="deixe vazio se ainda não sabe"
            onChange={(e) => setG({ ...g, valor: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Notas</label>
        <textarea
          value={g.notas}
          onChange={(e) => setG({ ...g, notas: e.target.value })}
        />
      </div>
    </Modal>
  );
}

function Guias({ busca }) {
  const estado = useEstado();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);

  const lista = estado.guias.filter((g) =>
    busca
      ? (g.titulo + " " + (g.valor || "") + " " + (g.notas || ""))
          .toLowerCase()
          .includes(busca.toLowerCase())
      : true
  );
  const pendentes = estado.guias.filter((g) => !g.valor).length;

  return (
    <>
      <CoresGuipa />

      <div className="chips" style={{ marginTop: 16 }}>
        {pendentes > 0 && (
          <span className="tag" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>
            {pendentes} a confirmar
          </span>
        )}
        <button
          className="btn primary sm"
          type="button"
          style={{ marginLeft: "auto" }}
          onClick={() => setCriando(true)}
        >
          ＋ Guia
        </button>
      </div>

      {!lista.length ? (
        <div className="empty">
          Nenhum guia cadastrado. Medidas da tela, do baú, arquivo do Photoshop,
          como a mídia é exibida.
        </div>
      ) : (
        GRUPOS_GUIA.map((grupo) => {
          const doGrupo = lista.filter((g) => g.grupo === grupo);
          if (!doGrupo.length) return null;
          return (
            <div className="card" key={grupo} style={{ marginBottom: 14 }}>
              <div className="card-h">
                <div className="t">{grupo}</div>
              </div>
              {doGrupo.map((g) => (
                <div className="kv" key={g.id}>
                  <div className="k">{g.titulo}</div>
                  <div className="v">
                    {g.valor ? (
                      g.valor
                    ) : (
                      <span style={{ color: "var(--warn)" }}>a confirmar</span>
                    )}
                    {g.notas && <div className="sub">{g.notas}</div>}
                  </div>
                  <button
                    className="btn sm ghost"
                    type="button"
                    onClick={() => setEditando(g)}
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          );
        })
      )}

      {criando && <FormGuia aoFechar={() => setCriando(false)} />}
      {editando && <FormGuia inicial={editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

/* ---------- a aba ---------- */

/* Antes eram tres sub-abas. O problema nao era o conteudo, era ter que
   lembrar em qual delas cada coisa estava -- e a Central e consultada no
   meio de outra tarefa, quando ninguem quer navegar. Empilhado, rolar
   resolve, e a busca do topo atravessa as tres de uma vez. */
function Secao({ titulo, sub, children }) {
  return (
    <section className="secao">
      <div className="secao-h">
        <h2>{titulo}</h2>
        {sub && <span>{sub}</span>}
      </div>
      {children}
    </section>
  );
}

export default function Central({ busca }) {
  return (
    <>
      <Secao titulo="Materiais" sub="Logo, kit, apresentacoes — o que se baixa">
        <Materiais busca={busca} />
      </Secao>

      <Secao titulo="Imagens GUIPA" sub="Referencias e renders da frota">
        <ImagensGuipa busca={busca} />
      </Secao>

      <Secao titulo="Guias e medidas" sub="Cores, tipografia e as medidas de cada midia">
        <Guias busca={busca} />
      </Secao>
    </>
  );
}
