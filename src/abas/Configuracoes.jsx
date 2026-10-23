import { useEffect, useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import {
  usePermissoes,
  AREAS,
  ROTULO_ACAO,
  ACOES_SEM_TRANCA,
  podeNoPerfil,
  salvarPermissoesDe,
  salvarPermissoesPadrao,
  salvarResponsaveis,
  definirAdmin,
  salvarDrive,
  salvarMeuTelefone,
} from "../lib/permissoes.js";
import { buscarPastas } from "../lib/drive.js";
import { auditoriaComentarios } from "../lib/compartilhado.js";
import { useMenu, salvarOrdem } from "../lib/menu.js";

/* ---------- permissões ---------- */

/* Colunas na ordem em que a pessoa pensa: primeiro "enxergo?", depois
   o que faço, do mais leve ao mais destrutivo. */
const COLUNAS = ["ver", "criar", "editar", "mover", "comentar", "excluir", "excluir_outros", "colunas", "baixar", "publicar"];
const COLUNAS_USADAS = COLUNAS.filter((c) => AREAS.some((a) => a.acoes.includes(c)));

/* O mapa completo {area: {acao: bool}} de alguém, já resolvido: exceção
   da pessoa por cima do padrão. É o que a matriz desenha e o que se
   grava quando alguém é personalizado. Gravar o resolvido inteiro, e
   não só a célula mexida, evita que a exceção dependa de um padrão que
   pode mudar depois. */
function resolvido(perfil, padrao) {
  const r = {};
  for (const a of AREAS) {
    r[a.key] = {};
    for (const acao of a.acoes) r[a.key][acao] = podeNoPerfil(perfil, padrao, a.key, acao);
  }
  return r;
}

function Matriz({ valor, aoMudar, desabilitada }) {
  return (
    <div className="matriz-rola">
      <table className="matriz">
        <thead>
          <tr>
            <th />
            {COLUNAS_USADAS.map((c) => (
              <th key={c}>{ROTULO_ACAO[c]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AREAS.map((a) => {
            const enxerga = valor[a.key]?.ver;
            return (
              <tr key={a.key} className={enxerga ? "" : "apagada"}>
                <th scope="row">{a.label}</th>
                {COLUNAS_USADAS.map((c) => {
                  if (!a.acoes.includes(c)) return <td key={c} className="na">—</td>;
                  const marcada = !!valor[a.key]?.[c];
                  /* Sem "ver", as outras ações não têm onde acontecer:
                     ficam visíveis mas travadas, para não parecer que
                     alguém pode excluir cartão numa aba que nem enxerga. */
                  const travada = desabilitada || (c !== "ver" && !enxerga);
                  const semTranca = (ACOES_SEM_TRANCA[a.key] || []).includes(c);
                  return (
                    <td key={c}>
                      <label
                        className="mz-cel"
                        title={semTranca ? "Só na tela: para o banco, mover e editar são a mesma operação." : ""}
                      >
                        <input
                          type="checkbox"
                          checked={marcada}
                          disabled={travada}
                          onChange={(e) => aoMudar(a.key, c, e.target.checked)}
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* Desligar "ver" leva junto as outras ações da área: ação escondida
   numa aba que não aparece seria permissão fantasma, que volta a valer
   no dia em que alguém religar só o "ver". */
function aplicar(mapa, area, acao, ligar) {
  const novo = JSON.parse(JSON.stringify(mapa));
  novo[area][acao] = ligar;
  if (acao === "ver" && !ligar) {
    for (const k of Object.keys(novo[area])) novo[area][k] = false;
  }
  return novo;
}

function Permissoes({ ehAdmin, meuEmail }) {
  const { perfis, permissoesPadrao } = usePermissoes();
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState("");
  const [aberto, setAberto] = useState(null);

  async function mexer(fn, marca) {
    setSalvando(marca);
    setErro("");
    const r = await fn();
    setSalvando("");
    if (!r.ok) setErro(r.erro);
  }

  const padraoResolvido = resolvido(null, permissoesPadrao);

  return (
    <>
      {erro && (
        <div className="banner" style={{ borderColor: "var(--danger)" }}>
          <b>O banco recusou. </b>
          {erro}
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <div className="t">Padrão de quem entra</div>
        </div>
        <Matriz
          valor={padraoResolvido}
          desabilitada={!ehAdmin || salvando === "padrao"}
          aoMudar={(area, acao, ligar) =>
            mexer(
              () => salvarPermissoesPadrao(aplicar(padraoResolvido, area, acao, ligar), meuEmail),
              "padrao"
            )
          }
        />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          <div className="t">Pessoas ({perfis.length})</div>
        </div>

        {perfis.map((p) => {
          const personalizado = p.permissoes != null;
          const souEu = p.email?.toLowerCase() === String(meuEmail).toLowerCase();
          const valor = resolvido(p, permissoesPadrao);
          const expandido = aberto === p.id;
          return (
            <div key={p.id} className="pessoa">
              <button
                type="button"
                className={"pessoa-h" + (expandido ? " on" : "")}
                onClick={() => setAberto(expandido ? null : p.id)}
              >
                <span className="arv-seta">{expandido ? "▾" : "▸"}</span>
                <span className="pessoa-nome">{p.nome || p.email}</span>
                {p.admin && <span className="tag">admin</span>}
                {souEu && <span className="tag">você</span>}
                <span className="pessoa-estado">
                  {p.admin ? "faz tudo" : personalizado ? "personalizado" : "usando o padrão"}
                </span>
              </button>

              {expandido && (
                <div className="pessoa-corpo">
                  <div className="sub" style={{ marginBottom: 10 }}>{p.email}</div>

                  {p.admin ? (
                    <div className="empty" style={{ textAlign: "left" }}>
                      Admin vê e faz tudo, em todas as áreas. Para restringir,
                      tire o admin primeiro.
                    </div>
                  ) : (
                    <Matriz
                      valor={valor}
                      desabilitada={!ehAdmin || salvando === p.id}
                      aoMudar={(area, acao, ligar) =>
                        mexer(() => salvarPermissoesDe(p.id, aplicar(valor, area, acao, ligar)), p.id)
                      }
                    />
                  )}

                  <div className="chips" style={{ marginTop: 12 }}>
                    {personalizado && !p.admin && (
                      <button
                        className="btn sm ghost"
                        type="button"
                        disabled={!ehAdmin}
                        onClick={() => mexer(() => salvarPermissoesDe(p.id, null), p.id)}
                      >
                        Voltar ao padrão
                      </button>
                    )}
                    {ehAdmin && !souEu && (
                      <button
                        className="btn sm ghost"
                        type="button"
                        onClick={() => mexer(() => definirAdmin(p.id, !p.admin), p.id)}
                      >
                        {p.admin ? "Tirar de admin" : "Tornar admin"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- responsáveis do comercial ---------- */

/* Quem pode ser escolhido como responsável de uma conta, na aba Marcas.
   Mora no banco para entrar ou sair alguém do comercial sem deploy.
   Tirar um nome daqui não apaga a carteira dele: as marcas continuam
   marcadas com o nome, que aparece como "(fora da lista)". */
function Responsaveis({ ehAdmin, meuEmail }) {
  const { responsaveis } = usePermissoes();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function gravar(lista) {
    setSalvando(true);
    setErro("");
    const r = await salvarResponsaveis(lista, meuEmail);
    setSalvando(false);
    if (!r.ok) setErro(r.erro);
    return r.ok;
  }

  async function adicionar() {
    const n = nome.trim();
    const e = email.trim().toLowerCase();
    if (!n || !e) return setErro("Preencha nome e e-mail.");
    if (!/^[^@\s]+@guipabrasil\.com$/.test(e)) return setErro("Use um e-mail @guipabrasil.com.");
    if (responsaveis.some((r) => r.email === e)) return setErro("Esse e-mail já está na lista.");
    if (await gravar([...responsaveis, { nome: n, email: e }])) {
      setNome("");
      setEmail("");
    }
  }

  return (
    <div className="card">
      {erro && <div className="banner" style={{ borderColor: "var(--danger)" }}>{erro}</div>}
      <div className="list">
        {responsaveis.map((r) => (
          <div className="row" key={r.email || r.nome} style={{ cursor: "default" }}>
            <div className="bar" style={{ background: "var(--accent)" }} />
            <div className="body">
              <div className="ttl">{r.nome}</div>
              <div className="meta"><span>{r.email || "sem e-mail"}</span></div>
            </div>
            {ehAdmin && (
              <div className="right">
                <button
                  className="btn sm ghost danger"
                  type="button"
                  disabled={salvando}
                  onClick={() => gravar(responsaveis.filter((x) => x !== r))}
                >
                  Tirar da lista
                </button>
              </div>
            )}
          </div>
        ))}
        {!responsaveis.length && <div className="empty">Nenhum responsável ainda.</div>}
      </div>
      {ehAdmin && (
        <div className="chips" style={{ marginTop: 12 }}>
          <input
            className="campo-resp"
            value={nome}
            placeholder="Nome completo"
            onChange={(e) => setNome(e.target.value)}
          />
          <input
            className="campo-resp"
            value={email}
            placeholder="nome@guipabrasil.com"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
          />
          <button className="btn sm" type="button" disabled={salvando} onClick={adicionar}>
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- auditoria de comentários ---------- */

/* Toda versão de todo comentário dos quadros de marca: o que foi
   escrito, cada edição com o antes e o depois, e o texto do que foi
   excluído. Quem grava é o banco (11), e só admin lê — no Kanban o
   comentário pode ser editado e apagado livremente porque o registro
   de verdade mora aqui. */
const ROTULO_ACAO_AUD = { criou: "comentou", editou: "editou", excluiu: "excluiu" };

function quandoAud(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function Auditoria() {
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");
  const [so, setSo] = useState(""); // "" | "editou" | "excluiu"

  async function ler() {
    const r = await auditoriaComentarios();
    if (r.ok) setLinhas(r.linhas);
    else setErro(r.erro);
  }

  /* Lê uma vez ao abrir. Ler no corpo do componente pediria a auditoria
     de novo a cada redesenho. */
  useEffect(() => {
    ler();
  }, []);

  if (linhas === null && !erro) return <div className="empty">Lendo a auditoria…</div>;
  if (erro) return <div className="banner" style={{ borderColor: "var(--danger)" }}>{erro}</div>;

  const t = filtro.trim().toLowerCase();
  const vis = linhas
    .filter((l) => (so ? l.acao === so : true))
    .filter((l) =>
      !t
        ? true
        : [l.marca_nome, l.cartao_titulo, l.autor_comentario, l.feito_por, l.feito_por_nome, l.texto_antes, l.texto_depois]
            .join(" ").toLowerCase().includes(t)
    );

  return (
    <div className="card">
      <div className="chips">
        <input
          className="campo-resp"
          value={filtro}
          placeholder="Filtrar por marca, cartão, pessoa ou texto"
          onChange={(e) => setFiltro(e.target.value)}
          style={{ flex: "1 1 260px" }}
        />
        {[["", "Tudo"], ["editou", "Só edições"], ["excluiu", "Só exclusões"]].map(([k, rot]) => (
          <button key={k} type="button" className={"chip" + (so === k ? " on" : "")} onClick={() => setSo(k)}>
            {rot}
          </button>
        ))}
        <button className="btn sm ghost" type="button" onClick={() => { setLinhas(null); ler(); }}>
          Atualizar
        </button>
      </div>

      {!vis.length ? (
        <div className="empty">
          {linhas.length ? "Nada com esse filtro." : "Nenhum comentário registrado ainda."}
        </div>
      ) : (
        <ul className="aud-lista">
          {vis.map((l) => (
            <li key={l.id} className={"aud-item aud-" + l.acao}>
              <div className="aud-topo">
                <b>{l.feito_por_nome || l.feito_por || "Alguém"}</b> {ROTULO_ACAO_AUD[l.acao] || l.acao}
                {l.acao !== "criou" && l.feito_por !== l.autor_comentario && (
                  <> o comentário de <b>{l.autor_comentario}</b></>
                )}
                {" em "}
                <i>“{l.cartao_titulo}”</i>
                {l.marca_nome ? <> · {l.marca_nome}</> : null}
                <span className="aud-quando">{quandoAud(l.em)}</span>
              </div>
              {l.texto_antes && (
                <div className="aud-texto antes">
                  <span>{l.acao === "excluiu" ? "texto excluído" : "antes"}</span>
                  {l.texto_antes}
                </div>
              )}
              {l.texto_depois && (
                <div className="aud-texto depois">
                  <span>{l.acao === "criou" ? "texto" : "depois"}</span>
                  {l.texto_depois}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Drive ---------- */

function ConfigDrive({ ehAdmin, meuEmail }) {
  const { drive } = usePermissoes();
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  async function procurar() {
    const t = termo.trim();
    if (!t) return;
    setBuscando(true);
    setErro("");
    try {
      setAchados(await buscarPastas(t));
    } catch (e) {
      setErro(e.message || "erro na busca");
    } finally {
      setBuscando(false);
    }
  }

  async function gravar(novo) {
    setErro("");
    const r = await salvarDrive(novo, meuEmail);
    if (!r.ok) setErro(r.erro);
  }

  return (
    <>
      {erro && (
        <div className="banner" style={{ borderColor: "var(--danger)" }}>
          {erro}
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <div className="t">Pasta raiz do acervo</div>
        </div>

        {drive.raizId ? (
          <div className="row" style={{ cursor: "default" }}>
            <div className="bar" style={{ background: "var(--accent)" }} />
            <div className="body">
              <div className="ttl">{drive.raizNome || "(pasta sem nome)"}</div>
              <div className="meta">
                <span>id: {drive.raizId}</span>
              </div>
            </div>
            <div className="right">
              <button
                className="btn sm ghost danger"
                type="button"
                disabled={!ehAdmin}
                onClick={() => gravar({ ...drive, raizId: "", raizNome: "" })}
              >
                Remover
              </button>
            </div>
          </div>
        ) : (
          <div className="empty">
            Nenhuma raiz definida — a busca varre o Drive inteiro de quem está
            logado.
          </div>
        )}

        {ehAdmin && (
          <>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Buscar pasta no Drive para usar como raiz</label>
              <input
                type="text"
                value={termo}
                placeholder="Ex: Clientes, ou 01. GUIPA - REDE"
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && procurar()}
              />
            </div>
            <div className="chips">
              <button className="btn sm" type="button" onClick={procurar} disabled={buscando}>
                {buscando ? "buscando…" : "Buscar"}
              </button>
            </div>

            {achados && !achados.length && (
              <div className="empty">Nenhuma pasta com esse nome.</div>
            )}
            {achados && achados.length > 0 && (
              <div className="list" style={{ marginTop: 10 }}>
                {achados.map((f) => (
                  <button
                    className="row"
                    key={f.id}
                    onClick={() => gravar({ ...drive, raizId: f.id, raizNome: f.nome })}
                  >
                    <div className="bar" style={{ background: "var(--border)" }} />
                    <div className="body">
                      <div className="ttl">{f.nome}</div>
                      {f.caminho && <div className="meta"><span>{f.caminho}</span></div>}
                    </div>
                    <div className="right">
                      <span className="btn sm ghost">Usar esta</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

    </>
  );
}

/* ---------- a aba ---------- */

/* Mesma ideia da Central: sub-aba escondia metade da tela atras de um
   clique, e quem abre Configuracoes costuma mexer nas duas coisas na
   mesma sentada. Empilhado, as duas estao a uma rolagem. */
/* ---------- meu perfil ---------- */

function MeuPerfil() {
  const auth = useAuth();
  const { eu } = usePermissoes();
  const [tel, setTel] = useState(eu?.telefone || "");
  const [estado, setEstado] = useState(""); // "" | "salvando" | "salvo" | erro
  useEffect(() => setTel(eu?.telefone || ""), [eu?.telefone]);

  async function salvar() {
    if (tel.trim() === (eu?.telefone || "")) return;
    setEstado("salvando");
    const r = await salvarMeuTelefone(tel);
    setEstado(r.ok ? "salvo" : r.erro);
  }

  return (
    <div className="card perfil-card">
      <div className="perfil-linha">
        <span>Nome</span>
        <b>{auth.perfil?.nome || "—"}</b>
      </div>
      <div className="perfil-linha">
        <span>E-mail</span>
        <b>{auth.perfil?.email || "—"}</b>
      </div>
      <label className="perfil-linha">
        <span>Telefone</span>
        <input
          className="campo-resp"
          value={tel}
          placeholder="+55 (11) 9 0000-0000"
          onChange={(e) => {
            setTel(e.target.value);
            setEstado("");
          }}
          onBlur={salvar}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        {estado === "salvando" && <span className="perfil-estado">salvando…</span>}
        {estado === "salvo" && <span className="perfil-estado ok">salvo</span>}
      </label>
      {estado && estado !== "salvando" && estado !== "salvo" && (
        <div className="banner" style={{ borderColor: "var(--danger)", marginTop: 10 }}>{estado}</div>
      )}
    </div>
  );
}

/* ---------- ordem do menu ---------- */

/* Cada um põe no topo o que mais usa. Arrastar a linha ou usar as setas;
   vale na hora, e o app passa a abrir no primeiro item. */
function OrdemMenu() {
  const { abas, personalizada, email } = useMenu();
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);

  const chaves = abas.map((a) => a.key);
  function mover(de, para) {
    if (para < 0 || para >= chaves.length || de === para) return;
    const nova = [...chaves];
    const [k] = nova.splice(de, 1);
    nova.splice(para, 0, k);
    salvarOrdem(email, nova);
  }

  return (
    <div className="card">
      <ol className="ordem-lista">
        {abas.map((a, i) => (
          <li
            key={a.key}
            className={
              "ordem-item" +
              (arrastando === i ? " arrastando" : "") +
              (sobre === i && arrastando !== null && arrastando !== i ? " alvo" : "")
            }
            draggable
            onDragStart={(e) => {
              setArrastando(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(i);
            }}
            onDragLeave={() => setSobre((v) => (v === i ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastando !== null) mover(arrastando, i);
              setArrastando(null);
              setSobre(null);
            }}
            onDragEnd={() => {
              setArrastando(null);
              setSobre(null);
            }}
          >
            <span className="ordem-alca" aria-hidden="true">⋮⋮</span>
            <span className="ordem-n">{i + 1}</span>
            <span className="ordem-ico">{a.ico}</span>
            <span className="ordem-nome">{a.label}</span>
            <span className="ordem-setas">
              <button
                type="button"
                className="btn sm ghost"
                aria-label={"Subir " + a.label}
                disabled={i === 0}
                onClick={() => mover(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn sm ghost"
                aria-label={"Descer " + a.label}
                disabled={i === abas.length - 1}
                onClick={() => mover(i, i + 1)}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      {personalizada && (
        <button
          type="button"
          className="btn sm ghost"
          style={{ marginTop: 10 }}
          onClick={() => salvarOrdem(email, null)}
        >
          Voltar à ordem padrão
        </button>
      )}
    </div>
  );
}

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

export default function Configuracoes() {
  const auth = useAuth();
  const { eu, carregando, erro } = usePermissoes();
  const ehAdmin = !!eu?.admin;

  if (carregando) return <div className="empty">Carregando configurações…</div>;
  if (erro)
    return (
      <div className="banner" style={{ borderColor: "var(--danger)" }}>
        <b>Não consegui ler as configurações. </b>
        {erro}
      </div>
    );

  /* Quem não é admin só tem a ordem do menu para mexer aqui. Permissões,
     responsáveis, auditoria e Drive nem aparecem — e o banco recusa a
     escrita de quem não é admin de qualquer jeito. */
  const pessoais = (
    <>
      <Secao titulo="Meu perfil">
        <MeuPerfil />
      </Secao>
      <Secao titulo="Ordem do menu">
        <OrdemMenu />
      </Secao>
    </>
  );

  if (!ehAdmin) return pessoais;

  return (
    <>
      {pessoais}

      <Secao titulo="Permissões de usuário">
        <Permissoes ehAdmin={ehAdmin} meuEmail={auth.perfil?.email} />
      </Secao>

      <Secao titulo="Responsáveis do comercial">
        <Responsaveis ehAdmin={ehAdmin} meuEmail={auth.perfil?.email} />
      </Secao>

      <Secao titulo="Auditoria de comentários">
        <Auditoria />
      </Secao>

      <Secao titulo="Drive">
        <ConfigDrive ehAdmin={ehAdmin} meuEmail={auth.perfil?.email} />
      </Secao>
    </>
  );
}
