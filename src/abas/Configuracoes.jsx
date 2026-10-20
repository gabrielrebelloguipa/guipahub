import { useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import {
  usePermissoes,
  ABAS,
  TODAS_AS_CHAVES,
  abasDe,
  salvarAbasDe,
  salvarAbasPadrao,
  definirAdmin,
  salvarDrive,
} from "../lib/permissoes.js";
import { buscarPastas } from "../lib/drive.js";

/* ---------- permissões ---------- */

function LinhaAba({ chave, marcada, aoMudar, desabilitada }) {
  const aba = ABAS.find((a) => a.key === chave);
  return (
    <label className={"chip" + (marcada ? " on" : "")} style={{ cursor: desabilitada ? "default" : "pointer" }}>
      <input
        type="checkbox"
        checked={marcada}
        disabled={desabilitada}
        onChange={(e) => aoMudar(e.target.checked)}
        style={{ marginRight: 6 }}
      />
      <span className="ico">{aba?.ico}</span>
      <span>{aba?.label}</span>
    </label>
  );
}

function Permissoes({ ehAdmin, meuEmail }) {
  const { perfis, abasPadrao } = usePermissoes();
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState("");

  async function mexer(fn, marca) {
    setSalvando(marca);
    setErro("");
    const r = await fn();
    setSalvando("");
    if (!r.ok) setErro(r.erro);
  }

  return (
    <>
      <div className="banner">
        <b>Isto organiza a tela, não tranca dado.</b> Esconder uma aba tira a
        poluição de quem não usa aquilo — mas quem souber abrir o console do
        navegador ainda alcança o conteúdo. O que protege de verdade é o Drive
        (cada um só vê as pastas que já vê lá) e as regras do banco.
      </div>

      {erro && (
        <div className="banner" style={{ borderColor: "var(--danger)" }}>
          <b>O banco recusou. </b>
          {erro}
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <div className="t">Abas padrão de quem entra pela primeira vez</div>
        </div>
        <div className="sub" style={{ marginBottom: 10 }}>
          Vale para todo mundo que não tiver exceção própria — inclusive quem
          já entrou e nunca foi personalizado. Mudar aqui muda para eles junto.
        </div>
        <div className="chips">
          {TODAS_AS_CHAVES.map((k) => (
            <LinhaAba
              key={k}
              chave={k}
              marcada={abasPadrao.includes(k)}
              desabilitada={!ehAdmin || salvando === "padrao"}
              aoMudar={(marcar) =>
                mexer(
                  () =>
                    salvarAbasPadrao(
                      marcar
                        ? TODAS_AS_CHAVES.filter((x) => abasPadrao.includes(x) || x === k)
                        : abasPadrao.filter((x) => x !== k),
                      meuEmail
                    ),
                  "padrao"
                )
              }
            />
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          <div className="t">Pessoas ({perfis.length})</div>
        </div>
        <div className="sub" style={{ marginBottom: 12 }}>
          Só aparece quem já entrou pelo menos uma vez. Não dá para preparar a
          permissão de alguém antes do primeiro login — a conta só passa a
          existir quando a pessoa entra.
        </div>

        {perfis.map((p) => {
          const personalizado = p.abas !== null;
          const atuais = abasDe(p, abasPadrao);
          const souEu = p.email?.toLowerCase() === String(meuEmail).toLowerCase();
          return (
            <div key={p.id} className="card" style={{ marginBottom: 10, background: "var(--bg)" }}>
              <div className="card-h">
                <div className="t" style={{ textTransform: "none", color: "var(--text)", fontSize: "0.9rem" }}>
                  {p.nome || p.email}
                  {p.admin && <span className="tag" style={{ marginLeft: 8 }}>admin</span>}
                  {souEu && <span className="tag" style={{ marginLeft: 6 }}>você</span>}
                </div>
                <div className="a">
                  {!personalizado ? (
                    <span className="sub">usando o padrão</span>
                  ) : (
                    <button
                      className="btn sm ghost"
                      type="button"
                      disabled={!ehAdmin}
                      onClick={() => mexer(() => salvarAbasDe(p.id, null), p.id)}
                    >
                      Voltar ao padrão
                    </button>
                  )}
                </div>
              </div>
              <div className="sub" style={{ marginBottom: 8 }}>{p.email}</div>

              <div className="chips">
                {TODAS_AS_CHAVES.map((k) => (
                  <LinhaAba
                    key={k}
                    chave={k}
                    marcada={atuais.includes(k)}
                    desabilitada={!ehAdmin || salvando === p.id}
                    aoMudar={(marcar) =>
                      mexer(
                        () =>
                          salvarAbasDe(
                            p.id,
                            marcar
                              ? TODAS_AS_CHAVES.filter((x) => atuais.includes(x) || x === k)
                              : atuais.filter((x) => x !== k)
                          ),
                        p.id
                      )
                    }
                  />
                ))}
              </div>

              {ehAdmin && !souEu && (
                <button
                  className="btn sm ghost"
                  type="button"
                  style={{ marginTop: 10 }}
                  onClick={() => mexer(() => definirAdmin(p.id, !p.admin), p.id)}
                >
                  {p.admin ? "Tirar de admin" : "Tornar admin"}
                </button>
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
