import { useState } from "react";
import { useEstado, alterar, uid } from "../lib/estado.js";
import { fmtData, diasAte } from "../lib/constantes.js";
import Modal from "../componentes/Modal.jsx";
import { useCompartilhado as useCompartilhadoHoje, meuQuadro, infoDaLista, REMOTO } from "../lib/compartilhado.js";

function FormAtalho({ inicial, aoFechar }) {
  const novo = !inicial;
  const [a, setA] = useState(inicial || { nome: "", url: "", grupo: "Trabalho" });

  function salvar() {
    const nome = a.nome.trim();
    if (!nome) return;
    let url = a.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    const alvo = { ...a, id: a.id || uid("a"), nome, url };
    alterar((e) => ({
      atalhos: novo
        ? [...e.atalhos, alvo]
        : e.atalhos.map((x) => (x.id === alvo.id ? alvo : x)),
    }));
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Novo atalho" : "Editar atalho"}
      aoFechar={aoFechar}
      acoes={
        <>
          {!novo && (
            <button
              className="btn ghost danger"
              type="button"
              onClick={() => {
                alterar((e) => ({
                  atalhos: e.atalhos.filter((x) => x.id !== a.id),
                }));
                aoFechar();
              }}
            >
              Excluir
            </button>
          )}
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
          value={a.nome}
          onChange={(e) => setA({ ...a, nome: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Link</label>
        <input
          type="text"
          value={a.url}
          placeholder="drive.google.com"
          onChange={(e) => setA({ ...a, url: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Grupo</label>
        <input
          type="text"
          value={a.grupo}
          placeholder="Trabalho, IA, Referência…"
          onChange={(e) => setA({ ...a, grupo: e.target.value })}
        />
      </div>
    </Modal>
  );
}

export default function Hoje({ aoIrPara }) {
  const estado = useEstado();
  const compartilhadoHoje = useCompartilhadoHoje();
  const [editandoAtalho, setEditandoAtalho] = useState(null);
  const [criandoAtalho, setCriandoAtalho] = useState(false);

  /* Suas tarefas = o quadro pessoal, que mora no banco (20). */
  const q = REMOTO ? meuQuadro(compartilhadoHoje) || { listas: [], demandas: [] } : estado;
  const abertas = q.demandas.filter((d) => !infoDaLista(q, d.status).concluida);

  const prazos = abertas
    .filter((d) => {
      const n = diasAte(d.prazo);
      return n !== null && n <= 3;
    })
    .sort((a, b) => (a.prazo || "").localeCompare(b.prazo || ""));

  const grupos = {};
  for (const a of estado.atalhos) {
    const g = a.grupo || "Outros";
    (grupos[g] = grupos[g] || []).push(a);
  }

  return (
    <>
      <div className="grid g-dash">
        <div className="card">
          <div className="card-h">
            <div className="t">Suas tarefas</div>
            <div className="a">
              <button className="link" type="button" onClick={() => aoIrPara("demandas")}>
                ver quadro →
              </button>
            </div>
          </div>
          <div className="stat-row">
            {q.listas.map((L) => {
              const n = q.demandas.filter((d) => d.status === L.id).length;
              return (
                <button
                  className="stat"
                  key={L.id}
                  type="button"
                  onClick={() => aoIrPara("demandas")}
                >
                  <div className="n">{n}</div>
                  <div className="l">{L.nome}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <div className="t">Prazos</div>
          </div>
          {!prazos.length ? (
            <div className="empty">Nada vencendo nos próximos 3 dias.</div>
          ) : (
            <div className="list">
              {prazos.map((d) => {
                const n = diasAte(d.prazo);
                return (
                  <button className="row" key={d.id} onClick={() => aoIrPara("demandas")}>
                    <div
                      className="bar"
                      style={{ background: infoDaLista(q, d.status).color }}
                    />
                    <div className="body">
                      <div className="ttl">{d.titulo}</div>
                      <div className="meta">
                        <span>{fmtData(d.prazo)}</span>
                        <span>{n < 0 ? "venceu" : n === 0 ? "hoje" : `em ${n}d`}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <div className="t">Acesso rápido</div>
            <div className="a">
              <button
                className="btn sm ghost"
                type="button"
                onClick={() => setCriandoAtalho(true)}
              >
                ＋ Adicionar
              </button>
            </div>
          </div>
          {Object.entries(grupos).map(([g, itens]) => (
            <div key={g} style={{ marginBottom: 12 }}>
              <div className="sub" style={{ marginBottom: 6 }}>
                {g}
              </div>
              <div className="sw-grid">
                {itens.map((a) => (
                  <a
                    key={a.id}
                    className="shortcut"
                    href={a.url}
                    target="_blank"
                    rel="noopener"
                    title={a.url + " · clique direito para editar"}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setEditandoAtalho(a);
                    }}
                  >
                    <span className="fav">{(a.nome || "?")[0].toUpperCase()}</span>
                    <span className="nm">{a.nome}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>

      {criandoAtalho && <FormAtalho aoFechar={() => setCriandoAtalho(false)} />}
      {editandoAtalho && (
        <FormAtalho inicial={editandoAtalho} aoFechar={() => setEditandoAtalho(null)} />
      )}
    </>
  );
}
