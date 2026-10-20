import { useState } from "react";
import { PRIORIDADES, LISTA_CORES, hojeChave, fmtData, diasAte } from "../lib/constantes.js";
import Modal, { Confirmar } from "./Modal.jsx";
import { useArrastar, useArrastarColuna } from "../lib/useArrastar.js";
import CartaoEmVoo from "./CartaoEmVoo.jsx";

/* O quadro, sem saber de onde vêm os dados.

   Recebe `listas`, `demandas` e um objeto `api` com as operações. Isso é
   o que permite o mesmo componente servir o kanban pessoal (que grava no
   localStorage de quem usa) e o kanban de uma empresa (que grava no
   compartilhado) sem duplicar 300 linhas de arraste, colunas e modais.

   Quando o compartilhado virar Supabase, só as funções do `api` mudam. */

function TagPrazo({ prazo, concluida }) {
  if (!prazo || concluida) return null;
  const d = diasAte(prazo);
  if (d === null) return null;
  if (d < 0) return <span className="tag late">venceu</span>;
  if (d === 0) return <span className="tag">hoje</span>;
  if (d <= 3) return <span className="tag">em {d}d</span>;
  return null;
}

/* O que o quadro deixa fazer. O pessoal deixa tudo — é da pessoa, e
   permissão de time não tem o que dizer sobre a lista de tarefas de
   alguém. Os quadros de marca recebem o que o banco também cobra, para
   a tela não oferecer botão que sempre dá erro. */
export const TUDO = { criar: true, editar: true, mover: true, excluir: true, colunas: true };

function CartaoModal({ tarefa, listas, api, aoFechar, pode = TUDO }) {
  const [d, setD] = useState(tarefa);
  const [excluindo, setExcluindo] = useState(false);

  /* Salva a cada mudança — não existe botão "Salvar". Fechar sem gravar
     seria a surpresa, não o contrário. */
  function grava(patch) {
    const novo = { ...d, ...patch };
    setD(novo);
    api.atualizarTarefa(novo);
  }

  /* Quem só pode mover ainda troca a lista pelo seletor — é o mesmo
     gesto do arraste, em outro lugar. Os outros campos ficam travados. */
  const soLe = !pode.editar;

  return (
    <>
      <Modal
        titulo="Tarefa"
        aoFechar={aoFechar}
        largo
        acoes={
          <>
            {pode.excluir && (
              <button
                className="btn sm ghost danger"
                type="button"
                style={{ marginRight: "auto" }}
                onClick={() => setExcluindo(true)}
              >
                Excluir tarefa
              </button>
            )}
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
              readOnly={soLe}
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
              readOnly={soLe}
              onChange={(e) => grava({ solicitante: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Prazo</label>
            <input
              type="date"
              value={d.prazo || ""}
              readOnly={soLe}
              onChange={(e) => grava({ prazo: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Prioridade</label>
            <select
              disabled={soLe}
              value={d.prioridade || "normal"}
              onChange={(e) => grava({ prioridade: e.target.value })}
            >
              {PRIORIDADES.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Lista</label>
          <select
            value={d.status}
            disabled={!pode.mover && !pode.editar}
            onChange={(e) => grava({ status: e.target.value })}
          >
            {listas.map((L) => (
              <option key={L.id} value={L.id}>{L.nome}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea
            value={d.notas || ""}
            style={{ minHeight: 150 }}
            placeholder="Briefing, links, o que ficou combinado…"
            readOnly={soLe}
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
            api.excluirTarefa(d.id);
            aoFechar();
          }}
          aoFechar={() => setExcluindo(false)}
        />
      )}
    </>
  );
}

function MenuLista({ lista, listas, api, aoFechar }) {
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
            onClick={() => { api.atualizarLista(lista.id, { cor: c }); aoFechar(); }}
            style={{
              width: 20, height: 20, borderRadius: 6, background: c,
              border: lista.cor === c ? "2px solid var(--text)" : "1px solid var(--border)",
              cursor: "pointer", padding: 0,
            }}
          />
        ))}
      </div>
      <div className="menu-sep" />
      <button className="menu-item" type="button" onClick={() => { api.moverLista(lista.id, -1); aoFechar(); }}>
        <span className="mi">←</span><span>Mover para a esquerda</span>
      </button>
      <button className="menu-item" type="button" onClick={() => { api.moverLista(lista.id, 1); aoFechar(); }}>
        <span className="mi">→</span><span>Mover para a direita</span>
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item"
        type="button"
        onClick={() => { api.atualizarLista(lista.id, { concluida: !lista.concluida }); aoFechar(); }}
      >
        <span className="mi">{lista.concluida ? "✓" : "○"}</span>
        <span>{lista.concluida ? "É coluna de concluído" : "Marcar como concluído"}</span>
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item danger"
        type="button"
        onClick={() => {
          if (listas.length <= 1) {
            alert("O quadro precisa de pelo menos uma coluna.");
            return;
          }
          api.excluirLista(lista.id);
          aoFechar();
        }}
      >
        <span className="mi">✕</span><span>Excluir lista</span>
      </button>
    </div>
  );
}

function Coluna({ lista, listas, tarefas, alvo, pegar, pegarColuna, api, aoAbrir, pode = TUDO }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [editandoNome, setEditandoNome] = useState(false);
  const [novoCartao, setNovoCartao] = useState(null);

  const destaque = alvo?.colunaId === lista.id;
  const antes = destaque ? alvo.indice : -1;

  function criar() {
    const t = (novoCartao || "").trim();
    if (!t) { setNovoCartao(null); return; }
    api.criarTarefa(lista.id, t);
    setNovoCartao("");
  }

  return (
    <div
      className={"lista" + (destaque ? " alvo" : "")}
      data-coluna={lista.id}
    >
      <div
        className="lista-h"
        onClick={() => setMenuAberto(false)}
        onPointerDown={pode.colunas ? (e) => pegarColuna(e, lista.id, lista.nome) : undefined}
        title={pode.colunas ? "Arraste pelo cabeçalho para reordenar" : ""}
        style={pode.colunas ? undefined : { cursor: "default" }}
      >
        <span className="dot" style={{ background: lista.cor }} />
        {editandoNome ? (
          <input
            className="nm-edit"
            autoFocus
            defaultValue={lista.nome}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) api.atualizarLista(lista.id, { nome: v });
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
            title={pode.colunas ? "Duplo clique para renomear" : ""}
            onDoubleClick={pode.colunas ? () => setEditandoNome(true) : undefined}
          >
            {lista.nome}
          </div>
        )}
        <span className="qt">{tarefas.length}</span>
        {pode.colunas && (
          <button
            className="btn sm ghost"
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuAberto((v) => !v); }}
          >
            ⋯
          </button>
        )}
        {menuAberto && (
          <MenuLista lista={lista} listas={listas} api={api} aoFechar={() => setMenuAberto(false)} />
        )}
      </div>

      <div className="lista-corpo">
        {tarefas.map((d, i) => (
          <div key={d.id}>
            {antes === i && <div className="placeholder" style={{ height: 34 }} />}
            <button
              className="cartao"
              data-cartao={d.id}
              style={{ borderLeftColor: lista.cor }}
              onPointerDown={pode.mover ? (e) => pegar(e, d.id, d.titulo) : undefined}
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

        {!pode.criar ? null : novoCartao !== null ? (
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
              <button className="btn sm primary" type="button" onClick={criar}>Adicionar</button>
              <button className="btn sm ghost" type="button" onClick={() => setNovoCartao(null)}>✕</button>
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

export default function Quadro({ listas, demandas, api, busca, pode = TUDO }) {
  const [aberta, setAberta] = useState(null);
  const { pegar, voando, alvo } = useArrastar({ aoSoltar: api.moverTarefa });
  const col = useArrastarColuna({ aoSoltar: api.reordenarLista });

  const filtradas = demandas.filter((d) =>
    busca
      ? (d.titulo + " " + (d.solicitante || "") + " " + (d.notas || ""))
          .toLowerCase()
          .includes(busca.toLowerCase())
      : true
  );

  return (
    <>
      {pode.colunas && (
        <div className="chips">
          <button className="btn sm ghost" type="button" onClick={api.criarLista}>
            ＋ Adicionar outra lista
          </button>
        </div>
      )}

      <div className="board">
        {(() => {
          /* A coluna em voo some da fila e o vazio onde ela vai cair é
             desenhado na posição do índice. Sem isso o arraste não diz
             onde vai parar — a pessoa solta no escuro. */
          const semEla = col.voando
            ? listas.filter((L) => L.id !== col.voando.id)
            : listas;
          const saida = [];
          semEla.forEach((L, i) => {
            if (col.indice === i)
              saida.push(<div className="placeholder-lista" key="ph" />);
            saida.push(
              <Coluna
                key={L.id}
                lista={L}
                listas={listas}
                tarefas={filtradas.filter((d) => d.status === L.id)}
                alvo={alvo}
                pegar={pegar}
                pegarColuna={col.pegar}
                pode={pode}
                api={api}
                aoAbrir={setAberta}
              />
            );
          });
          if (col.indice === semEla.length)
            saida.push(<div className="placeholder-lista" key="ph-fim" />);
          return saida;
        })()}
      </div>

      <CartaoEmVoo voando={voando} />
      {col.voando && (
        <div
          className="lista-em-voo"
          style={{
            left: col.voando.x,
            top: col.voando.y,
            width: col.voando.w,
          }}
        >
          {col.voando.nome}
        </div>
      )}
      {aberta && (
        <CartaoModal
          pode={pode}
          tarefa={aberta}
          listas={listas}
          api={api}
          aoFechar={() => setAberta(null)}
        />
      )}
    </>
  );
}

/* Fábrica das operações do quadro.

   `ler` devolve { listas, demandas } e `gravar(patch)` aplica a mudança.
   Quem chama decide para onde isso vai — localStorage pessoal ou o
   quadro compartilhado de uma empresa. A lógica de mover cartão,
   reordenar coluna e não perder tarefa ao apagar coluna fica escrita
   uma vez só, aqui. */
export function criarApi(ler, gravar, uid) {
  return {
    criarTarefa(listaId, titulo) {
      const { demandas } = ler();
      gravar({
        demandas: [
          {
            id: uid("d"), titulo, solicitante: "", prazo: "",
            prioridade: "normal", status: listaId, notas: "", criadoEm: hojeChave(),
          },
          ...demandas,
        ],
      });
    },

    atualizarTarefa(t) {
      const { demandas } = ler();
      gravar({ demandas: demandas.map((x) => (x.id === t.id ? t : x)) });
    },

    excluirTarefa(id) {
      const { demandas } = ler();
      gravar({ demandas: demandas.filter((x) => x.id !== id) });
    },

    moverTarefa(id, colunaId, indice) {
      if (!colunaId) return;
      const { demandas } = ler();
      const item = demandas.find((d) => d.id === id);
      if (!item) return;
      const arr = demandas.filter((d) => d.id !== id);
      const movido = { ...item, status: colunaId };
      /* Posição dentro da coluna: reinsere na lista global logo antes do
         cartão que hoje ocupa aquele índice na coluna de destino. */
      const naColuna = arr.filter((d) => d.status === colunaId);
      const vizinho = naColuna[indice];
      const pos = vizinho ? arr.indexOf(vizinho) : arr.length;
      arr.splice(pos, 0, movido);
      gravar({ demandas: arr });
    },

    criarLista() {
      const { listas } = ler();
      gravar({
        listas: [
          ...listas,
          {
            id: uid("l"), nome: "Nova lista",
            cor: LISTA_CORES[listas.length % LISTA_CORES.length],
            concluida: false,
          },
        ],
      });
    },

    atualizarLista(id, patch) {
      const { listas } = ler();
      gravar({ listas: listas.map((L) => (L.id === id ? { ...L, ...patch } : L)) });
    },

    moverLista(id, delta) {
      const { listas } = ler();
      const i = listas.findIndex((L) => L.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= listas.length) return;
      const arr = [...listas];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      gravar({ listas: arr });
    },

    /* No quadro pessoal a ordem e a da propria lista, entao reordenar e
       tirar e por de volta. `indice` ja conta a fila sem a arrastada. */
    reordenarLista(id, indice) {
      const { listas } = ler();
      const i = listas.findIndex((L) => L.id === id);
      if (i < 0) return;
      const arr = [...listas];
      const [L] = arr.splice(i, 1);
      arr.splice(indice, 0, L);
      gravar({ listas: arr });
    },

    excluirLista(id) {
      const { listas, demandas } = ler();
      const restantes = listas.filter((L) => L.id !== id);
      if (!restantes.length) return;
      /* Cartões da coluna apagada não somem: vão para a primeira coluna
         que sobrou. Perder tarefa por apagar coluna seria destruição
         silenciosa. */
      gravar({
        listas: restantes,
        demandas: demandas.map((d) =>
          d.status === id ? { ...d, status: restantes[0].id } : d
        ),
      });
    },
  };
}
