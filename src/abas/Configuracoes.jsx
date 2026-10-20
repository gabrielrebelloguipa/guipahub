import { useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import {
  usePermissoes,
  AREAS,
  ROTULO_ACAO,
  ACOES_SEM_TRANCA,
  podeNoPerfil,
  salvarPermissoesDe,
  salvarPermissoesPadrao,
  definirAdmin,
  salvarDrive,
} from "../lib/permissoes.js";
import { buscarPastas } from "../lib/drive.js";

/* ---------- permissões ---------- */

/* Colunas na ordem em que a pessoa pensa: primeiro "enxergo?", depois
   o que faço, do mais leve ao mais destrutivo. */
const COLUNAS = ["ver", "criar", "editar", "mover", "comentar", "excluir", "colunas", "baixar", "publicar"];
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
                        {semTranca && <span className="mz-asterisco">*</span>}
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
      <div className="banner">
        <b>Isto vale de verdade.</b> Desmarcar "Excluir" no Kanban não só
        esconde o botão: o banco passa a recusar a exclusão, mesmo de quem
        tentar pelo console. Admin passa por cima de tudo, para nunca ficar
        sem como desfazer.
      </div>

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
        <div className="sub" style={{ marginBottom: 12 }}>
          Vale para todo mundo sem exceção própria, inclusive quem já entrou e
          nunca foi personalizado. Mudar aqui muda para eles junto.
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
        <div className="sub" style={{ marginTop: 10 }}>
          <span className="mz-asterisco">*</span> Mover cartão é separado só na
          tela. Para o banco, mover e editar são a mesma operação: quem pode
          um consegue o outro pelo console.
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          <div className="t">Pessoas ({perfis.length})</div>
        </div>
        <div className="sub" style={{ marginBottom: 12 }}>
          Só aparece quem já entrou pelo menos uma vez. A conta passa a existir
          no primeiro login, então não dá para preparar a permissão antes.
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
      <div className="banner">
        <b>De onde a aba Clientes lê o acervo.</b> A aba só enxerga o que
        estiver dentro desta pasta, em qualquer profundidade — nunca nada fora
        dela. Sem uma pasta escolhida aqui, a aba Clientes não tem onde
        procurar, e avisa isso para quem abrir.
      </div>

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

  return (
    <>
      {!ehAdmin && (
        <div className="banner">
          <b>Você está vendo em modo leitura.</b> Só quem é admin altera
          permissões e a configuração do Drive. Peça a um admin se precisar
          mudar algo.
        </div>
      )}

      <Secao titulo="Permissões de usuário" sub="Quem vê o quê, e o padrão de quem entra">
        <Permissoes ehAdmin={ehAdmin} meuEmail={auth.perfil?.email} />
      </Secao>

      <Secao titulo="Drive" sub="De onde a aba Imagens lê o acervo">
        <ConfigDrive ehAdmin={ehAdmin} meuEmail={auth.perfil?.email} />
      </Secao>
    </>
  );
}
