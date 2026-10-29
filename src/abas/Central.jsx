import { useEffect, useState } from "react";
import { useEstado, alterar } from "../lib/estado.js";
import { CATEGORIAS_MATERIAL, GRUPOS_GUIA } from "../lib/constantes.js";
import Modal, { Confirmar } from "../componentes/Modal.jsx";
import { buscarArquivo, copiarImagem } from "../lib/arquivos.js";
import { usePode } from "../lib/permissoes.js";
import { useAuth } from "../lib/useAuth.js";
import {
  acharPastaNaRaiz,
  listarFilhos,
  listarMidias,
  baixarBlob,
  ehImagem,
  ehVideo,
  extensaoDe,
  miniatura,
  fmtBytes,
  linkDaPasta,
  linkDeDownload,
} from "../lib/drive.js";
import {
  useCentral,
  iniciarCentral,
  salvarMaterial,
  excluirMaterial,
  salvarGuia,
  excluirGuia,
  subirImagem,
  renomearImagem,
  excluirImagem,
  linkDaImagem,
  caminhoMini,
  completarMiniaturas,
  baixarImagem,
  baixarArquivo,
  enviarDoNavegador,
  LIMITE_BYTES,
} from "../lib/central.js";

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

function ErroBanco({ erro }) {
  if (!erro) return null;
  return (
    <div className="banner" style={{ borderColor: "var(--danger)" }}>
      <b>O banco recusou. </b>
      {erro}
    </div>
  );
}

/* ---------- Materiais ---------- */

/* ---------- o que mora no Drive ---------- */

/* Imagens e materiais agora vivem em duas pastas do 07. Design, e quem
   sobe é quem tem acesso a elas no Drive. O que ainda está no Supabase
   continua aparecendo até ter uma cópia de mesmo nome lá. */
const PASTA_IMAGENS = "Imagens de Refer";
const PASTA_MATERIAIS = "Materiais de Apoio";

const semExt = (n) => String(n || "").replace(/\.[^.]+$/, "").trim();
const chave = (n) => semExt(n).toLowerCase();

async function lerPasta(trecho, fundo) {
  const pasta = await acharPastaNaRaiz(trecho);
  if (!pasta) return null;
  if (fundo) {
    const r = await listarMidias(pasta.id);
    return { pasta, arquivos: r.arquivos.filter((f) => ehImagem(f) || ehVideo(f)), pastas: [] };
  }
  const r = await listarFilhos(pasta.id);
  return { pasta, arquivos: r.arquivos, pastas: r.pastas };
}

function useDriveCentral() {
  const auth = useAuth();
  const [d, setD] = useState({ carregando: true, erro: "", imagens: null, materiais: null });
  const semAcesso = auth.expirou || auth.acessoDrive === false;
  useEffect(() => {
    if (semAcesso) {
      setD({ carregando: false, erro: "", imagens: null, materiais: null });
      return;
    }
    let vivo = true;
    Promise.all([lerPasta(PASTA_IMAGENS, true), lerPasta(PASTA_MATERIAIS, false)])
      .then(([imagens, materiais]) => vivo && setD({ carregando: false, erro: "", imagens, materiais }))
      .catch((e) => vivo && setD({ carregando: false, erro: "Drive: " + (e.message || "erro"), imagens: null, materiais: null }));
    return () => {
      vivo = false;
    };
  }, [semAcesso]);
  return d;
}

/* Um por vez: o navegador recusa vários downloads disparados juntos. */
async function baixarEmFila(itens, baixar, aoErro) {
  for (const i of itens) {
    try {
      await baixar(i);
    } catch (e) {
      aoErro(e.message || "erro");
    }
  }
}

function FormMaterial({ inicial, aoFechar }) {
  const novo = !inicial;
  const [m, setM] = useState(
    inicial || { nome: "", categoria: CATEGORIAS_MATERIAL[0], url: "", notas: "" }
  );
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    const nome = m.nome.trim();
    if (!nome) return;
    if (arquivo && arquivo.size > LIMITE_BYTES) return setErro("O arquivo passa de 25 MB.");
    let url = (m.url || "").trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    setSalvando(true);
    const r = await salvarMaterial({ ...m, nome, url }, arquivo);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Novo material" : "Editar material"}
      aoFechar={aoFechar}
      acoes={
        <>
          {erro && <div className="msg-erro" style={{ marginRight: "auto", marginTop: 0 }}>{erro}</div>}
          <button className="btn ghost" type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primary" type="button" onClick={salvar} disabled={salvando}>
            {salvando ? "salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Nome</label>
        <input type="text" value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} />
      </div>
      <div className="f-row">
        <div className="field">
          <label>Categoria</label>
          <select value={m.categoria} onChange={(e) => setM({ ...m, categoria: e.target.value })}>
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
        <label>Arquivo</label>
        <label className="btn sm" style={{ cursor: "pointer" }}>
          {arquivo ? arquivo.name : m.arquivo_nome ? "Trocar " + m.arquivo_nome : "Escolher arquivo"}
          <input
            type="file"
            style={{ display: "none" }}
            onChange={(e) => setArquivo(e.target.files[0] || null)}
          />
        </label>
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

function Materiais({ busca, drive }) {
  const central = useCentral();
  const estado = useEstado();
  const podeFazer = usePode();
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [limpando, setLimpando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");

  const noDrive = drive.materiais;
  const nomesDrive = new Set([
    ...(noDrive?.arquivos || []).map((f) => chave(f.name)),
    ...(noDrive?.pastas || []).map((p) => chave(p.nome)),
  ]);
  /* Material com arquivo que já tem cópia no Drive sai da lista. */
  const jaNoDrive = (m) => m.caminho && (nomesDrive.has(chave(m.arquivo_nome)) || nomesDrive.has(chave(m.nome)));
  const copias = central.materiais.filter(jaNoDrive);
  const aMover = central.materiais.filter((m) => m.caminho && !jaNoDrive(m));
  const casa = (txt) => (busca ? txt.toLowerCase().includes(busca.toLowerCase()) : true);

  /* O filtro de categoria continua sendo preferência de quem olha, então
     fica no estado pessoal; o conteúdo é que agora é do time. */
  const lista = central.materiais
    .filter((m) => !jaNoDrive(m))
    .filter((m) => (estado.filtroCat ? m.categoria === estado.filtroCat : true))
    .filter((m) => casa(m.nome + " " + (m.notas || "")));
  const daPasta = estado.filtroCat
    ? { arquivos: [], pastas: [] }
    : {
        pastas: (noDrive?.pastas || []).filter((p) => casa(p.nome)),
        arquivos: (noDrive?.arquivos || []).filter((f) => casa(f.name)),
      };
  const vazio = !lista.length && !daPasta.arquivos.length && !daPasta.pastas.length;

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
          const n = central.materiais.filter((m) => m.categoria === c).length;
          if (!n) return null;
          return (
            <button
              key={c}
              type="button"
              className={"chip" + (estado.filtroCat === c ? " on" : "")}
              onClick={() => alterar({ filtroCat: estado.filtroCat === c ? "" : c })}
            >
              {c} ({n})
            </button>
          );
        })}
        {podeFazer("central", "criar") && (
          <div className="chips-fim">
            {aMover.length > 0 && (
              <button
                className="btn sm"
                type="button"
                disabled={baixando}
                onClick={async () => {
                  setBaixando(true);
                  await baixarEmFila(aMover, (m) => baixarArquivo(m.caminho, m.arquivo_nome), setErro);
                  setBaixando(false);
                }}
              >
                {baixando ? "baixando…" : `Baixar do Supabase (${aMover.length})`}
              </button>
            )}
            {copias.length > 0 && podeFazer("central", "excluir") && (
              <button className="btn sm ghost danger" type="button" onClick={() => setLimpando(true)}>
                Apagar cópias antigas ({copias.length})
              </button>
            )}
            {noDrive && (
              <a className="btn sm" href={linkDaPasta(noDrive.pasta.id)} target="_blank" rel="noopener">
                Pasta no Drive ↗
              </a>
            )}
            <button className="btn primary sm" type="button" onClick={() => setCriando(true)}>
              ＋ Material
            </button>
          </div>
        )}
      </div>

      <ErroBanco erro={erro || drive.erro} />

      {vazio ? (
        <div className="empty">{drive.carregando ? "Carregando…" : "Nenhum material."}</div>
      ) : (
        <div className="list">
          {daPasta.pastas.map((p) => (
            <div className="row" key={p.id} style={{ cursor: "default" }}>
              <div className="bar" style={{ background: "var(--accent)" }} />
              <div className="body">
                <div className="ttl">{p.nome}</div>
                <div className="meta">
                  <span>Pasta</span>
                </div>
              </div>
              <div className="right">
                <a className="btn sm" href={linkDaPasta(p.id)} target="_blank" rel="noopener">
                  Abrir
                </a>
              </div>
            </div>
          ))}
          {daPasta.arquivos.map((f) => (
            <div className="row" key={f.id} style={{ cursor: "default" }}>
              <div className="bar" style={{ background: "var(--accent)" }} />
              <div className="body">
                <div className="ttl">{semExt(f.name)}</div>
                <div className="meta">
                  <span>{extensaoDe(f)}</span>
                  {f.size && <span>{fmtBytes(f.size)}</span>}
                </div>
              </div>
              <div className="right">
                <a className="btn sm" href={linkDeDownload(f)} target="_blank" rel="noopener">
                  Baixar
                </a>
                <a className="btn sm" href={f.webViewLink} target="_blank" rel="noopener">
                  Abrir
                </a>
              </div>
            </div>
          ))}
          {lista.map((m) => (
            <div className="row" key={m.id} style={{ cursor: "default" }}>
              <div className="bar" style={{ background: "var(--accent)" }} />
              <div className="body">
                <div className="ttl">{m.nome}</div>
                <div className="meta">
                  <span>{m.categoria}</span>
                  {m.arquivo_nome && <span>{m.arquivo_nome}</span>}
                  {m.notas && <span>{m.notas}</span>}
                </div>
              </div>
              <div className="right">
                {m.caminho && (
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() => baixarArquivo(m.caminho, m.arquivo_nome).catch((e) => setErro(e.message))}
                  >
                    Baixar
                  </button>
                )}
                {m.url && (
                  <a className="btn sm" href={m.url} target="_blank" rel="noopener">
                    Abrir
                  </a>
                )}
                {podeFazer("central", "editar") && (
                  <button className="btn sm ghost" type="button" onClick={() => setEditando(m)}>
                    Editar
                  </button>
                )}
                {podeFazer("central", "excluir") && (
                  <button className="btn sm ghost danger" type="button" onClick={() => setExcluindo(m)}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {criando && <FormMaterial aoFechar={() => setCriando(false)} />}
      {editando && <FormMaterial inicial={editando} aoFechar={() => setEditando(null)} />}
      {excluindo && (
        <Confirmar
          mensagem={`Excluir “${excluindo.nome}”? Some para o time inteiro.`}
          aoConfirmar={async () => {
            const r = await excluirMaterial(excluindo);
            if (!r.ok) setErro(r.erro);
          }}
          aoFechar={() => setExcluindo(null)}
        />
      )}
      {limpando && (
        <Confirmar
          mensagem={`Apagar do Supabase ${copias.length} material(is) que já estão no Drive?`}
          aoConfirmar={async () => {
            for (const m of copias) {
              const r = await excluirMaterial(m);
              if (!r.ok) setErro(r.erro);
            }
          }}
          aoFechar={() => setLimpando(false)}
        />
      )}
    </>
  );
}

/* ---------- Imagens GUIPA ---------- */

/* Link assinado do bucket privado: a imagem só abre para quem está
   logado com conta da GUIPA, mesmo que alguém copie o endereço. */
function Miniatura({ caminho, alt, temMini }) {
  const [url, setUrl] = useState("");
  const alvo = temMini ? caminhoMini(caminho) : caminho;
  useEffect(() => {
    let vivo = true;
    linkDaImagem(alvo).then((u) => vivo && setUrl(u));
    return () => {
      vivo = false;
    };
  }, [alvo]);
  if (!url) return <div className="midia-sem">carregando…</div>;
  return <img src={url} alt={alt} loading="lazy" />;
}

function ImagensGuipa({ busca, drive }) {
  const central = useCentral();
  const podeFazer = usePode();
  const [excluindo, setExcluindo] = useState(null);
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(0);
  const [renomeando, setRenomeando] = useState(null);
  const [limpando, setLimpando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const podeSubir = podeFazer("central", "criar");
  const faltaMini = central.imagens.some((i) => !central.minis.has(caminhoMini(i.caminho)));

  useEffect(() => {
    if (podeSubir && faltaMini) completarMiniaturas();
  }, [podeSubir, faltaMini]);

  async function processar(arquivos) {
    const problemas = [];
    setEnviando(arquivos.length);
    for (const f of arquivos) {
      if (!/^image\//.test(f.type)) {
        problemas.push(`${f.name}: não é imagem`);
      } else if (f.size > LIMITE_BYTES) {
        problemas.push(`${f.name}: passa de 25 MB`);
      } else {
        const r = await subirImagem(f);
        if (!r.ok) problemas.push(`${f.name}: ${r.erro}`);
      }
      setEnviando((n) => n - 1);
    }
    setEnviando(0);
    setAviso(problemas.join(" · "));
  }

  const [copiando, setCopiando] = useState({});

  async function copiar(id, obter) {
    setCopiando((c) => ({ ...c, [id]: "copiando…" }));
    try {
      await copiarImagem(obter);
      setCopiando((c) => ({ ...c, [id]: "copiada ✓" }));
    } catch (e) {
      setAviso("Não consegui copiar: " + (e.message || "erro"));
    }
    setTimeout(() => setCopiando(({ [id]: _, ...resto }) => resto), 1600);
  }

  const casa = (txt) => (busca ? txt.toLowerCase().includes(busca.toLowerCase()) : true);
  const noDrive = drive.imagens;
  const nomesDrive = new Set((noDrive?.arquivos || []).map((f) => chave(f.name)));
  const copias = central.imagens.filter((i) => nomesDrive.has(chave(i.nome)));
  const lista = central.imagens.filter((i) => !nomesDrive.has(chave(i.nome)) && casa(i.nome));
  const daPasta = (noDrive?.arquivos || []).filter((f) => casa(f.name));
  const extDe = (i) => i.caminho.split(".").pop() || "png";

  return (
    <>

      {podeSubir && (
        <div className="chips">
          {lista.length > 0 && (
            <button
              className="btn sm"
              type="button"
              disabled={baixando}
              onClick={async () => {
                setBaixando(true);
                await baixarEmFila(lista, (i) => baixarArquivo(i.caminho, i.nome + "." + extDe(i)), setAviso);
                setBaixando(false);
              }}
            >
              {baixando ? "baixando…" : `Baixar do Supabase (${lista.length})`}
            </button>
          )}
          {copias.length > 0 && podeFazer("central", "excluir") && (
            <button className="btn sm ghost danger" type="button" onClick={() => setLimpando(true)}>
              Apagar cópias antigas ({copias.length})
            </button>
          )}
          {noDrive && (
            <a className="btn sm" href={linkDaPasta(noDrive.pasta.id)} target="_blank" rel="noopener">
              Pasta no Drive ↗
            </a>
          )}
          <label className="btn primary sm" style={{ cursor: "pointer" }}>
            {enviando ? `enviando… (${enviando})` : "＋ Adicionar imagens"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={!!enviando}
              style={{ display: "none" }}
              onChange={(e) => {
                processar([...e.target.files]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {aviso && <div className="banner">{aviso}</div>}
      <ErroBanco erro={drive.erro} />

      {!lista.length && !daPasta.length ? (
        <div className="empty">{drive.carregando ? "Carregando…" : "Nenhuma imagem ainda."}</div>
      ) : (
        <div className="grid g-assets">
          {daPasta.map((f) => (
            <div className="midia" key={f.id}>
              <div className="midia-img">
                <img src={miniatura(f, 400)} alt={f.name} loading="lazy" referrerPolicy="no-referrer" />
              </div>
              <div className="midia-nome" title={f.name}>
                {semExt(f.name)}
              </div>
              <div className="midia-acoes">
                {ehImagem(f) ? (
                  <button
                    className="btn sm"
                    type="button"
                    disabled={!!copiando[f.id]}
                    onClick={() => copiar(f.id, () => baixarBlob(f))}
                  >
                    {copiando[f.id] || "Copiar"}
                  </button>
                ) : (
                  <a className="btn sm" href={f.webViewLink} target="_blank" rel="noopener">
                    Abrir
                  </a>
                )}
                <a className="btn sm" href={linkDeDownload(f)} target="_blank" rel="noopener">
                  Baixar
                </a>
              </div>
            </div>
          ))}
          {lista.map((i) => (
            <div className="midia" key={i.id}>
              <div className="midia-img">
                <Miniatura caminho={i.caminho} alt={i.nome} temMini={central.minis.has(caminhoMini(i.caminho))} />
              </div>
              {renomeando === i.id ? (
                <input
                  type="text"
                  autoFocus
                  defaultValue={i.nome}
                  onBlur={async (e) => {
                    const v = e.target.value.trim();
                    setRenomeando(null);
                    if (v && v !== i.nome) {
                      const r = await renomearImagem(i.id, v);
                      if (!r.ok) setAviso(r.erro);
                    }
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                />
              ) : (
                <div
                  className="midia-nome"
                  title={podeFazer("central", "editar") ? "Duplo clique para renomear" : i.nome}
                  onDoubleClick={() => podeFazer("central", "editar") && setRenomeando(i.id)}
                >
                  {i.nome}
                </div>
              )}
              <div className="midia-acoes">
                <button className="btn sm" type="button" disabled={!!copiando[i.id]} onClick={() => copiar(i.id, () => baixarImagem(i.caminho))}>
                  {copiando[i.id] || "Copiar"}
                </button>
                <button
                  className="btn sm"
                  type="button"
                  onClick={() =>
                    baixarArquivo(i.caminho, i.nome + "." + extDe(i)).catch((e) =>
                      setAviso("Não consegui baixar: " + e.message)
                    )
                  }
                >
                  Baixar
                </button>
                {podeFazer("central", "excluir") && (
                  <button className="btn sm ghost danger" type="button" onClick={() => setExcluindo(i)}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {excluindo && (
        <Confirmar
          mensagem={`Excluir a imagem “${excluindo.nome}”? Some para o time inteiro.`}
          aoConfirmar={async () => {
            const r = await excluirImagem(excluindo);
            if (!r.ok) setAviso(r.erro);
          }}
          aoFechar={() => setExcluindo(null)}
        />
      )}
      {limpando && (
        <Confirmar
          mensagem={`Apagar do Supabase ${copias.length} imagem(ns) que já estão no Drive?`}
          aoConfirmar={async () => {
            for (const i of copias) {
              const r = await excluirImagem(i);
              if (!r.ok) setAviso(r.erro);
            }
          }}
          aoFechar={() => setLimpando(false)}
        />
      )}
    </>
  );
}

/* ---------- Guias e medidas ---------- */

/* As cores moram aqui, e nao em Materiais, porque quem procura cor
   esta procurando medida da marca -- nao um arquivo para baixar. */
function CoresGuipa() {
  const [copiado, setCopiado] = useState("");
  return (
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
  );
}

function FormGuia({ inicial, aoFechar }) {
  const novo = !inicial;
  const [g, setG] = useState(
    inicial
      ? { ...inicial, specs: inicial.specs?.length ? inicial.specs : [{ k: "", v: "" }] }
      : { titulo: "", grupo: GRUPOS_GUIA[0], specs: [{ k: "", v: "" }], notas: "" }
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const podeFazer = usePode();

  const mudaSpec = (i, patch) =>
    setG({ ...g, specs: g.specs.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  async function salvar() {
    const titulo = g.titulo.trim();
    if (!titulo) return;
    setSalvando(true);
    const r = await salvarGuia({ ...g, titulo });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Novo guia" : "Editar guia"}
      aoFechar={aoFechar}
      acoes={
        <>
          {!novo && podeFazer("central", "excluir") && (
            <button
              className="btn sm ghost danger"
              type="button"
              style={{ marginRight: "auto" }}
              onClick={async () => {
                const r = await excluirGuia(g.id);
                if (!r.ok) return setErro(r.erro);
                aoFechar();
              }}
            >
              Excluir guia
            </button>
          )}
          {erro && <div className="msg-erro" style={{ marginRight: "auto", marginTop: 0 }}>{erro}</div>}
          <button className="btn ghost" type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primary" type="button" onClick={salvar} disabled={salvando}>
            {salvando ? "salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <div className="f-row">
        <div className="field">
          <label>Título</label>
          <input
            type="text"
            value={g.titulo}
            placeholder="Ex: Tela LED do baú"
            onChange={(e) => setG({ ...g, titulo: e.target.value })}
          />
        </div>
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
      </div>
      <div className="field">
        <label>Medidas</label>
        <div className="guia-specs-form">
          {g.specs.map((x, i) => (
            <div className="guia-spec-linha" key={i}>
              <input
                type="text"
                value={x.k}
                placeholder="Ex: Largura"
                onChange={(e) => mudaSpec(i, { k: e.target.value })}
              />
              <input
                type="text"
                value={x.v}
                placeholder="vazio = a confirmar"
                onChange={(e) => mudaSpec(i, { v: e.target.value })}
              />
              <button
                className="btn sm ghost danger"
                type="button"
                aria-label="Tirar medida"
                onClick={() => setG({ ...g, specs: g.specs.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="btn sm ghost"
            type="button"
            onClick={() => setG({ ...g, specs: [...g.specs, { k: "", v: "" }] })}
          >
            ＋ Medida
          </button>
        </div>
      </div>
      <div className="field">
        <label>Notas</label>
        <textarea value={g.notas} onChange={(e) => setG({ ...g, notas: e.target.value })} />
      </div>
    </Modal>
  );
}

function Guias({ busca }) {
  const central = useCentral();
  const podeFazer = usePode();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);

  const lista = central.guias.filter((g) =>
    busca
      ? (g.titulo + " " + g.specs.map((x) => x.k + " " + x.v).join(" ") + " " + (g.notas || "")).toLowerCase().includes(busca.toLowerCase())
      : true
  );
  const pendentes = central.guias.filter((g) => g.pendente).length;

  return (
    <>
      <CoresGuipa />

      <div className="chips" style={{ marginTop: 16 }}>
        {pendentes > 0 && (
          <span className="tag" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>
            {pendentes} a confirmar
          </span>
        )}
        {podeFazer("central", "criar") && (
          <button
            className="btn primary sm"
            type="button"
            style={{ marginLeft: "auto" }}
            onClick={() => setCriando(true)}
          >
            ＋ Guia
          </button>
        )}
      </div>

      {!lista.length ? (
        <div className="empty">Nenhum guia.</div>
      ) : (
        GRUPOS_GUIA.map((grupo) => {
          const doGrupo = lista.filter((g) => g.grupo === grupo);
          if (!doGrupo.length) return null;
          return (
            <div key={grupo} style={{ marginBottom: 18 }}>
              <div className="guia-grupo">{grupo}</div>
              <div className="guia-grade">
                {doGrupo.map((g) => (
                  <div className={"card guia-card" + (g.pendente ? " pendente" : "")} key={g.id}>
                    <div className="card-h">
                      <div className="t guia-titulo">{g.titulo}</div>
                      <div className="a">
                        {g.pendente && <span className="guia-selo">a confirmar</span>}
                        {podeFazer("central", "editar") && (
                          <button className="btn sm ghost" type="button" onClick={() => setEditando(g)}>
                            Editar
                          </button>
                        )}
                      </div>
                    </div>
                    {g.specs.map((x, i) => (
                      <div className="guia-spec" key={i}>
                        <span className={"guia-ok" + (x.v ? "" : " falta")}>{x.v ? "✓" : "!"}</span>
                        {x.k && <span className="guia-k">{x.k}</span>}
                        <span className={"guia-v" + (x.v ? "" : " falta")}>{x.v || "a confirmar"}</span>
                      </div>
                    ))}
                    {g.notas && <div className="guia-notas">{g.notas}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {criando && <FormGuia aoFechar={() => setCriando(false)} />}
      {editando && <FormGuia inicial={editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

/* ---------- o que ficou no navegador ---------- */

/* Quem usou a Central quando ela era local tem conteúdo no próprio
   navegador que ninguém mais vê. Este aviso aparece só para essa pessoa,
   e só se ela pode criar na Central. Nada vai sozinho: enviar torna o
   conteúdo visível para o time inteiro, então é a pessoa quem decide. */
function SobrasDoNavegador() {
  const estado = useEstado();
  const podeFazer = usePode();
  const [enviando, setEnviando] = useState(false);
  const [relato, setRelato] = useState(null);

  const n = {
    materiais: (estado.central || []).length,
    guias: (estado.guias || []).length,
    imagens: (estado.imagensGuipa || []).length,
  };
  const total = n.materiais + n.guias + n.imagens;
  if (!total || !podeFazer("central", "criar")) return null;

  async function enviar() {
    setEnviando(true);
    const r = await enviarDoNavegador({
      materiais: estado.central,
      guias: estado.guias,
      imagens: estado.imagensGuipa,
      lerArquivo: buscarArquivo,
    });
    setEnviando(false);
    setRelato(r);
    /* Só limpa o navegador se nada deu erro: com erro, a pessoa ainda
       tem a cópia local para tentar de novo. */
    if (!r.erros.length) alterar({ central: [], guias: [], imagensGuipa: [] });
  }

  return (
    <div className="banner" style={{ marginBottom: 18 }}>
      {relato ? (
        <>
          <b>Enviado.</b> {relato.materiais} materiais, {relato.guias} guias e{" "}
          {relato.imagens} imagens foram para a Central do time
          {relato.pulados ? ` (${relato.pulados} já existiam e foram pulados)` : ""}.
          {relato.erros.length > 0 && (
            <div style={{ marginTop: 6 }}>
              Não foram: {relato.erros.join(" · ")}. A cópia local ficou guardada
              para tentar de novo.
            </div>
          )}
        </>
      ) : (
        <>
          <b>Você tem conteúdo da Central guardado só neste navegador:</b>{" "}
          {n.materiais} materiais, {n.guias} guias e {n.imagens} imagens, de quando
          a Central ainda não era compartilhada. Ninguém mais vê isso.
          <div className="chips" style={{ marginTop: 10, marginBottom: 0 }}>
            <button className="btn primary sm" type="button" disabled={enviando} onClick={enviar}>
              {enviando ? "enviando…" : "Enviar para a Central do time"}
            </button>
          </div>
        </>
      )}
    </div>
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
  const central = useCentral();
  const drive = useDriveCentral();
  useEffect(() => {
    iniciarCentral();
  }, []);

  if (central.carregando) return <div className="empty">Carregando a Central…</div>;

  return (
    <>
      <SobrasDoNavegador />
      <ErroBanco erro={central.erro} />

      <Secao titulo="Materiais">
        <Materiais busca={busca} drive={drive} />
      </Secao>

      <Secao titulo="Imagens GUIPA">
        <ImagensGuipa busca={busca} drive={drive} />
      </Secao>

      <Secao titulo="Guias e medidas">
        <Guias busca={busca} />
      </Secao>
    </>
  );
}
