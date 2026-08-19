import { useState } from "react";
import { useEstado, alterar, uid, statusInfo } from "../lib/estado.js";
import {
  PRIORIDADES,
  LISTA_CORES,
  hojeChave,
  fmtData,
  diasAte,
} from "../lib/constantes.js";
import Modal, { Confirmar } from "../componentes/Modal.jsx";
import { useArrastar } from "../lib/useArrastar.js";
import CartaoEmVoo from "../componentes/CartaoEmVoo.jsx";

function TagPrazo({ prazo, concluida }) {
  if (!prazo || concluida) return null;
  const d = diasAte(prazo);
  if (d === null) return null;
  if (d < 0) return <span className="tag late">venceu</span>;
  if (d === 0) return <span className="tag">hoje</span>;
  if (d <= 3) return <span className="tag">em {d}d</span>;
  return null;
}

function CartaoModal({ tarefa, aoFechar }) {
  const estado = useEstado();
  const [d, setD] = useState(tarefa);
  const [excluindo, setExcluindo] = useState(false);

  /* Salva a cada mudança, como o quadro faz — não existe botão "Salvar".
     Fechar sem gravar seria a surpresa, não o contrário. */
  function grava(patch) {
    const novo = { ...d, ...patch };
    setD(novo);
    alterar((e) => ({
      demandas: e.demandas.map((x) => (x.id === novo.id ? novo : x)),
    }));
  }

  return (
    <>
      <Modal
        titulo="Tarefa"
        aoFechar={aoFechar}
        largo
        acoes={
          <>
            <button
              className="btn sm ghost danger"
              type="button"
              onClick={() => setExcluindo(true)}
            >
              Excluir tarefa
            </button>
            <button className="btn" type="button" onClick={aoFechar}>
              Fechar
            </button>
          </>
        }
      >
        <div className="field">
          <input
            type="text"
            value={d.titulo}
            placeholder="Título da tarefa"
            style={{ fontSize: "1rem", fontWeight: 700 }}
            onChange={(e) => grava({ titulo: e.target.value })}
          />
        </div>
        <div className="f-row">
          <div className="field">
            <label>Solicitante</label>
            <input
              type="text"
              value={d.solicitante || ""}
              placeholder="Quem pediu"
              onChange={(e) => grava({ solicitante: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Prazo</label>
            <input
              type="date"
              value={d.prazo || ""}
              onChange={(e) => grava({ prazo: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Prioridade</label>
            <select
              value={d.prioridade || "normal"}
              onChange={(e) => grava({ prioridade: e.target.value })}
            >
              {PRIORIDADES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Lista</label>
          <select value={d.status} onChange={(e) => grava({ status: e.target.value })}>
            {estado.listas.map((L) => (
              <option key={L.id} value={L.id}>
                {L.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea
            value={d.notas || ""}
            style={{ minHeight: 150 }}
            placeholder="Briefing, links, o que ficou combinado…"
            onChange={(e) => grava({ notas: e.target.value })}
          />
        </div>
        <div className="kv">
          <div className="k">Criada em</div>
          <div className="v">{fmtData(d.criadoEm)}</div>
        </div>
      </Modal>

      {excluindo && (
        <Confirmar
          mensagem={`Excluir “${d.titulo}”? Isso não tem volta.`}
          aoConfirmar={() => {
            alterar((e) => ({ demandas: e.demandas.filter((x) => x.id !== d.id) }));
            aoFechar();
          }}
          aoFechar={() => setExcluindo(false)}
        />
      )}
    </>
  );
}

function MenuLista({ lista, aoFechar }) {
  const estado = useEstado();
  const i = estado.listas.findIndex((x) => x.id === lista.id);

  function mover(delta) {
    const arr = [...estado.listas];
    const j = i + delta;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    alterar({ listas: arr });
    aoFechar();
  }

  return (
    <div className="lista-menu" onClick={(e) => e.stopPropagation()}>
      <div className="menu-item" style={{ cursor: "default", color: "var(--text-dim)", fontSize: "0.72rem" }}>
        Cor
      </div>
      <div className="chips" style={{ padding: "0 8px 8px" }}>
        {LISTA_CORES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => {
              alterar({
                listas: estado.listas.map((x) =>
                  x.id === lista.id ? { ...x, cor: c } : x
                ),
              });
              aoFechar();
            }}
            style={{
              width: 20, height: 20, borderRadius: 6, background: c,
              border: lista.cor === c ? "2px solid var(--text)" : "1px solid var(--border)",
              cursor: "pointer", padding: 0,
            }}
          />
        ))}
      </div>
      <div className="menu-sep" />
      <button className="menu-item" type="button" onClick={() => mover(-1)}>
        <span className="mi">←</span>
        <span>Mover para a esquerda</span>
      </button>
      <button className="menu-item" type="button" onClick={() => mover(1)}>
        <span className="mi">→</span>
        <span>Mover para a direita</span>
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item"
        type="button"
        onClick={() => {
          alterar({
            listas: estado.listas.map((x) =>
              x.id === lista.id ? { ...x, concluida: !x.concluida } : x
            ),
          });
          aoFechar();
        }}
      >
        <span className="mi">{lista.concluida ? "✓" : "○"}</span>
        <span>{lista.concluida ? "É coluna de concluído" : "Marcar como concluído"}</span>
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item danger"
        type="button"
        onClick={() => {
          const restantes = estado.listas.filter((x) => x.id !== lista.id);
          if (!restantes.length) {
            alert("O quadro precisa de pelo menos uma coluna.");
            return;
          }
          /* Cartões da coluna apagada não somem: vão para a primeira
             coluna que sobrou. Perder tarefa por apagar uma coluna seria
             destruição silenciosa. */
          alterar((e) => ({
            listas: restantes,
            demandas: e.demandas.map((d) =>
              d.status === lista.id ? { ...d, status: restantes[0].id } : d
            ),
          }));
          aoFechar();
        }}
      >
        <span className="mi">✕</span>
        <span>Excluir lista</span>
      </button>
    </div>
  );
}

function Coluna({ lista, tarefas, alvo, pegar, aoAbrir }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [editandoNome, setEditandoNome] = useState(false);
  const [novoCartao, setNovoCartao] = useState(null);

  const destaque = alvo?.colunaId === lista.id;
  const antes = destaque ? alvo.indice : -1;

  function criar() {
    const t = (novoCartao || "").trim();
    if (!t) {
      setNovoCartao(null);
      return;
    }
    alterar((e) => ({
      demandas: [
        {
          id: uid("d"),
          titulo: t,
          solicitante: "",
          prazo: "",
          prioridade: "normal",
          status: lista.id,
          notas: "",
          criadoEm: hojeChave(),
        },
        ...e.demandas,
      ],
    }));
    setNovoCartao("");
  }

  return (
    <div className={"lista" + (destaque ? " alvo" : "")} data-coluna={lista.id}>
      <div className="lista-h" onClick={() => setMenuAberto(false)}>
        <span className="dot" style={{ background: lista.cor }} />
        {editandoNome ? (
          <input
            className="nm-edit"
            autoFocus
            defaultValue={lista.nome}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v)
                alterar((s) => ({
                  listas: s.listas.map((x) =>
                    x.id === lista.id ? { ...x, nome: v } : x
                  ),
                }));
              setEditandoNome(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.target.blur();
              if (e.key === "Escape") setEditandoNome(false);
            }}
          />
        ) : (
          <div
            className="nm"
            title="Duplo clique para renomear"
            onDoubleClick={() => setEditandoNome(true)}
          >
            {lista.nome}
          </div>
        )}
        <span className="qt">{tarefas.length}</span>
        <button
          className="btn sm ghost"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuAberto((v) => !v);
          }}
        >
          ⋯
        </button>
        {menuAberto && <MenuLista lista={lista} aoFechar={() => setMenuAberto(false)} />}
      </div>

      <div className="lista-corpo">
        {tarefas.map((d, i) => (
          <div key={d.id}>
            {antes === i && <div className="placeholder" style={{ height: 34 }} />}
            <button
              className="cartao"
              data-cartao={d.id}
              style={{ borderLeftColor: lista.cor }}
              onPointerDown={(e) => pegar(e, d.id, d.titulo)}
              onClick={() => aoAbrir(d)}
            >
              <div className="tx">{d.titulo}</div>
              <div className="mt">
                <TagPrazo prazo={d.prazo} concluida={lista.concluida} />
                {d.prioridade && d.prioridade !== "normal" && (
                  <span className="tag">{d.prioridade}</span>
                )}
                {d.notas && <span>≡</span>}
              </div>
            </button>
          </div>
        ))}
        {antes >= tarefas.length && <div className="placeholder" style={{ height: 34 }} />}

        {novoCartao !== null ? (
          <div>
            <input
              type="text"
              autoFocus
              value={novoCartao}
              placeholder="Título da tarefa"
              onChange={(e) => setNovoCartao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") criar();
                if (e.key === "Escape") setNovoCartao(null);
              }}
              style={{
                width: "100%", background: "var(--bg)", color: "var(--text)",
                border: "1px solid var(--accent)", borderRadius: 8,
                padding: "9px 11px", fontSize: "0.83rem", fontFamily: "inherit",
              }}
            />
            <div className="chips" style={{ marginTop: 6 }}>
              <button className="btn sm primary" type="button" onClick={criar}>
                Adicionar
              </button>
              <button
                className="btn sm ghost"
                type="button"
                onClick={() => setNovoCartao(null)}
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn sm ghost"
            type="button"
            onClick={() => setNovoCartao("")}
            style={{ justifyContent: "flex-start" }}
          >
            ＋ Adicionar um cartão
          </button>
        )}
      </div>
    </div>
  );
}

export default function Kanban({ busca }) {
  const estado = useEstado();
  const [aberta, setAberta] = useState(null);

  const { pegar, voando, alvo } = useArrastar({
    aoSoltar: (id, colunaId, indice) => {
      if (!colunaId) return;
      alterar((e) => {
        const arr = e.demandas.filter((d) => d.id !== id);
        const item = e.demandas.find((d) => d.id === id);
        if (!item) return {};
        const movido = { ...item, status: colunaId };
        /* Posição dentro da coluna: reinsere na lista global logo antes do
           cartão que hoje ocupa aquele índice na coluna de destino. */
        const naColuna = arr.filter((d) => d.status === colunaId);
        const vizinho = naColuna[indice];
        const pos = vizinho ? arr.indexOf(vizinho) : arr.length;
        arr.splice(pos, 0, movido);
        return { demandas: arr };
      });
    },
  });

  const filtradas = estado.demandas.filter((d) =>
    busca
      ? (d.titulo + " " + (d.solicitante || "") + " " + (d.notas || ""))
          .toLowerCase()
          .includes(busca.toLowerCase())
      : true
  );

  const lista = estado.demandaVista === "lista";

  return (
    <>
      <div className="chips">
        <button
          className="btn sm"
          type="button"
          onClick={() =>
            alterar({ demandaVista: lista ? "quadro" : "lista" })
          }
        >
          {lista ? "▦ Quadro" : "≡ Lista"}
        </button>
        {!lista && (
          <button
            className="btn sm ghost"
            type="button"
            onClick={() =>
              alterar((e) => ({
                listas: [
                  ...e.listas,
                  {
                    id: uid("l"),
                    nome: "Nova lista",
                    cor: LISTA_CORES[e.listas.length % LISTA_CORES.length],
                    concluida: false,
                  },
                ],
              }))
            }
          >
            ＋ Adicionar outra lista
          </button>
        )}
      </div>

      {lista ? (
        !filtradas.length ? (
          <div className="empty">
            Nenhuma tarefa. Clique em “Adicionar um cartão” no quadro para começar.
          </div>
        ) : (
          <div className="list">
            {[...filtradas]
              .sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999"))
              .map((d) => {
                const st = statusInfo(estado, d.status);
                return (
                  <button className="row" key={d.id} onClick={() => setAberta(d)}>
                    <div className="bar" style={{ background: st.color }} />
                    <div className="body">
                      <div className="ttl">{d.titulo}</div>
                      <div className="meta">
                        <span>{st.label}</span>
                        {d.prazo && <span>{fmtData(d.prazo)}</span>}
                        {d.solicitante && <span>pedido por {d.solicitante}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        )
      ) : (
        <div className="board">
          {estado.listas.map((L) => (
            <Coluna
              key={L.id}
              lista={L}
              tarefas={filtradas.filter((d) => d.status === L.id)}
              alvo={alvo}
              pegar={pegar}
              aoAbrir={setAberta}
            />
          ))}
        </div>
      )}

      <CartaoEmVoo voando={voando} />
      {aberta && <CartaoModal tarefa={aberta} aoFechar={() => setAberta(null)} />}
    </>
  );
}
