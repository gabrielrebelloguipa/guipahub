import { useEffect, useState } from "react";
import Modal, { Confirmar } from "../componentes/Modal.jsx";
import { Avatar, Comentario } from "../componentes/Historico.jsx";
import { usePode, usePermissoes } from "../lib/permissoes.js";
import { useAuth } from "../lib/useAuth.js";
import { MESES } from "../lib/constantes.js";
import {
  CATEGORIAS,
  useCalendario,
  iniciarCalendario,
  salvarItem,
  excluirItem,
  comentarItem,
  editarComentarioItem,
  excluirComentarioItem,
} from "../lib/calendario.js";

const CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CAT = Object.fromEntries(CATEGORIAS.map((c) => [c.key, c]));

/* "2026-07-01" — o banco guarda o mês como o dia 1. */
const chaveMes = (ano, m) => `${ano}-${String(m + 1).padStart(2, "0")}-01`;

/* Semestre como no PPT do comercial: jan–jun e jul–dez. */
function semestreDe(d) {
  return { ano: d.getFullYear(), sem: d.getMonth() < 6 ? 0 : 1 };
}
function andar({ ano, sem }, passo) {
  const n = ano * 2 + sem + passo;
  return { ano: Math.floor(n / 2), sem: n % 2 };
}

function useEstreito() {
  const q = "(max-width: 900px)";
  const [v, setV] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setV(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return v;
}

const nomeDoMes = (mes) => {
  const [a, m] = String(mes).split("-").map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} de ${a}` : "";
};
const dataBr = (d) => (d ? d.split("-").reverse().join("/") : "");
function periodo(i) {
  if (i.inicio && i.fim && i.inicio !== i.fim) return `${dataBr(i.inicio)} a ${dataBr(i.fim)}`;
  return dataBr(i.inicio || i.fim);
}
const linkSeguro = (u) => (/^https?:\/\//i.test(u) ? u : "https://" + u);

export default function Calendario({ busca }) {
  const { itens, comentarios, carregando, erro } = useCalendario();
  const podeFazer = usePode();
  const podeCriar = podeFazer("calendario", "criar");
  const estreito = useEstreito();
  const hoje = new Date();
  const mesAtual = chaveMes(hoje.getFullYear(), hoje.getMonth());
  const [periodoAtual, setPeriodo] = useState(() => semestreDe(hoje));
  /* { id } abre um item; { novo: { mes, categoria } } abre um em branco */
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    iniciarCalendario();
  }, []);

  const meses = Array.from({ length: 6 }, (_, i) => {
    const m = periodoAtual.sem * 6 + i;
    return { chave: chaveMes(periodoAtual.ano, m), rotulo: CURTO[m], ano: periodoAtual.ano };
  });
  const noSemestreAtual =
    periodoAtual.ano === hoje.getFullYear() && periodoAtual.sem === (hoje.getMonth() < 6 ? 0 : 1);

  const termo = (busca || "").trim().toLowerCase();
  const daCelula = (mes, cat) => itens.filter((i) => i.mes === mes && i.categoria === cat);
  const nComent = {};
  for (const c of comentarios) nComent[c.item_id] = (nComent[c.item_id] || 0) + 1;

  function Item({ i }) {
    const fora = termo && !i.titulo.toLowerCase().includes(termo);
    const n = nComent[i.id] || 0;
    return (
      <button
        type="button"
        className={"cal-item c-" + i.categoria + (fora ? " fora" : "")}
        onClick={() => setAberto({ id: i.id })}
      >
        {i.titulo}
        {n > 0 && <span className="cal-item-n">❝ {n}</span>}
      </button>
    );
  }

  function Mais({ mes, categoria }) {
    if (!podeCriar) return null;
    return (
      <button
        type="button"
        className="cal-add"
        aria-label="Adicionar"
        onClick={() => setAberto({ novo: { mes, categoria } })}
      >
        +
      </button>
    );
  }

  const barra = (
    <div className="cal-barra">
      <button className="btn sm" type="button" aria-label="Semestre anterior" onClick={() => setPeriodo(andar(periodoAtual, -1))}>
        ‹
      </button>
      <div className="cal-periodo">
        {periodoAtual.sem ? "Jul – Dez" : "Jan – Jun"} {periodoAtual.ano}
      </div>
      <button className="btn sm" type="button" aria-label="Próximo semestre" onClick={() => setPeriodo(andar(periodoAtual, 1))}>
        ›
      </button>
      {!noSemestreAtual && (
        <button className="btn sm ghost" type="button" onClick={() => setPeriodo(semestreDe(hoje))}>
          Hoje
        </button>
      )}
    </div>
  );

  if (carregando) return <div className="empty">Carregando…</div>;

  return (
    <div className="cal">
      {erro && <div className="msg-erro">{erro}</div>}
      {barra}

      {estreito ? (
        <div className="cal-lista">
          {meses.map((m) => (
            <div key={m.chave} className={"cal-mes-card" + (m.chave === mesAtual ? " atual" : "")}>
              <div className="cal-mes-t">
                {m.rotulo}/{String(m.ano).slice(2)}
              </div>
              {CATEGORIAS.map((c) => {
                const lista = daCelula(m.chave, c.key);
                if (!lista.length && !podeCriar) return null;
                return (
                  <div key={c.key} className="cal-bloco">
                    <div className={"cal-cat-t c-" + c.key}>{c.label}</div>
                    <div className="cal-itens">
                      {lista.map((i) => (
                        <Item key={i.id} i={i} />
                      ))}
                      <Mais mes={m.chave} categoria={c.key} />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="cal-grade">
          <div className="cal-canto" />
          {meses.map((m) => (
            <div key={m.chave} className={"cal-mes" + (m.chave === mesAtual ? " atual" : "")}>
              {m.rotulo}/{String(m.ano).slice(2)}
            </div>
          ))}
          {CATEGORIAS.map((c) => (
            <div key={c.key} className="cal-linha">
              <div className={"cal-cat c-" + c.key}>{c.label}</div>
              {meses.map((m) => (
                <div key={m.chave} className={"cal-cel" + (m.chave === mesAtual ? " atual" : "")}>
                  {daCelula(m.chave, c.key).map((i) => (
                    <Item key={i.id} i={i} />
                  ))}
                  <Mais mes={m.chave} categoria={c.key} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {aberto && (
        <DetalheItem
          id={aberto.id}
          novo={aberto.novo}
          aoAbrir={(id) => setAberto({ id })}
          aoFechar={() => setAberto(null)}
        />
      )}
    </div>
  );
}

/* O item aberto: quem vê lê os detalhes e conversa; quem pode editar
   aperta Editar para os campos virarem formulário. Item novo já abre no
   formulário, e a conversa aparece depois de salvo. */
function DetalheItem({ id, novo, aoAbrir, aoFechar }) {
  const { itens, comentarios } = useCalendario();
  const podeFazer = usePode();
  const item = id ? itens.find((i) => i.id === id) : null;
  const [editando, setEditando] = useState(!!novo);
  const [rascunho, setRascunho] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  /* Excluído por outra pessoa enquanto estava aberto. */
  const sumiu = !!id && !item;
  useEffect(() => {
    if (sumiu) aoFechar();
  }, [sumiu, aoFechar]);
  if (sumiu) return null;

  const base = item || {
    titulo: "", mes: novo.mes, categoria: novo.categoria,
    descricao: "", inicio: "", fim: "", local: "", link: "",
  };
  const d = editando
    ? rascunho || { ...base, mes: base.mes.slice(0, 7), inicio: base.inicio || "", fim: base.fim || "" }
    : base;
  const muda = (patch) => setRascunho({ ...d, ...patch });
  const cat = CAT[d.categoria] || CATEGORIAS[0];
  const podeExcluir = !!item && podeFazer("calendario", "excluir");

  function editar() {
    setRascunho(null);
    setErro("");
    setEditando(true);
  }

  function cancelar() {
    if (!item) return aoFechar();
    setRascunho(null);
    setEditando(false);
    setErro("");
  }

  async function salvar() {
    if (!d.titulo.trim() || !d.mes) return;
    setSalvando(true);
    const r = await salvarItem({ ...d, id: item?.id, mes: d.mes + "-01" });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    setRascunho(null);
    setEditando(false);
    if (!item && r.id) aoAbrir(r.id);
  }

  async function excluir() {
    const r = await excluirItem(item.id);
    if (!r.ok) {
      setExcluindo(false);
      return setErro(r.erro);
    }
    aoFechar();
  }

  return (
    <>
      <Modal
        titulo={
          <span className="tarefa-titulo-modal">
            <span className="dot" style={{ background: "var(--cat)" }} />
            {cat.label}
          </span>
        }
        aoFechar={editando ? cancelar : aoFechar}
        classe={"tarefa cal-det c-" + d.categoria + (item ? "" : " sem-painel")}
        acoes={
          <>
            {podeExcluir && (
              <button
                className="btn sm ghost danger"
                type="button"
                style={{ marginRight: "auto" }}
                onClick={() => setExcluindo(true)}
              >
                Excluir
              </button>
            )}
            {erro && <div className="msg-erro" style={{ marginRight: "auto", marginTop: 0 }}>{erro}</div>}
            {editando ? (
              <>
                <button className="btn ghost" type="button" onClick={cancelar}>
                  Cancelar
                </button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={salvando || !d.titulo.trim() || !d.mes}
                  onClick={salvar}
                >
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
              </>
            ) : (
              <>
                {podeFazer("calendario", "editar") && (
                  <button className="btn" type="button" onClick={editar}>
                    ✎ Editar
                  </button>
                )}
                <button className="btn primary" type="button" onClick={aoFechar}>
                  Fechar
                </button>
              </>
            )}
          </>
        }
      >
        <div className="tarefa-grid">
          <div className="tarefa-esq">
            {editando ? <FormDetalhe d={d} muda={muda} salvar={salvar} /> : <VerDetalhe i={base} />}
          </div>
          {item && (
            <aside className="tarefa-dir">
              <Conversa
                item={item}
                lista={comentarios.filter((c) => c.item_id === item.id)}
                podeComentar={podeFazer("calendario", "comentar")}
              />
            </aside>
          )}
        </div>
      </Modal>

      {excluindo && (
        <Confirmar
          mensagem={`Excluir “${base.titulo}” do calendário? Os comentários saem junto.`}
          aoConfirmar={excluir}
          aoFechar={() => setExcluindo(false)}
        />
      )}
    </>
  );
}

function VerDetalhe({ i }) {
  const quando = periodo(i);
  return (
    <div className="cal-ver">
      <div className="cal-ver-mes">{nomeDoMes(i.mes)}</div>
      <h2 className="cal-ver-titulo">{i.titulo}</h2>

      {(quando || i.local || i.link) && (
        <div className="cal-ver-fatos">
          {quando && (
            <div className="cal-fato">
              <span className="cal-fato-k">Quando</span>
              <span className="cal-fato-v">{quando}</span>
            </div>
          )}
          {i.local && (
            <div className="cal-fato">
              <span className="cal-fato-k">Onde</span>
              <span className="cal-fato-v">{i.local}</span>
            </div>
          )}
          {i.link && (
            <div className="cal-fato">
              <span className="cal-fato-k">Link</span>
              <a className="cal-fato-v" href={linkSeguro(i.link)} target="_blank" rel="noreferrer">
                {i.link.replace(/^https?:\/\//i, "")}
              </a>
            </div>
          )}
        </div>
      )}

      {i.descricao && (
        <>
          <div className="tarefa-secao">Sobre</div>
          <div className="cal-ver-desc">{i.descricao}</div>
        </>
      )}
    </div>
  );
}

function FormDetalhe({ d, muda, salvar }) {
  return (
    <>
      <input
        className="tarefa-nome"
        type="text"
        autoFocus
        value={d.titulo}
        placeholder="Título"
        onChange={(e) => muda({ titulo: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && salvar()}
      />

      <div className="tarefa-secao">Detalhes</div>
      <div className="f-row">
        <div className="field">
          <label>Categoria</label>
          <select value={d.categoria} onChange={(e) => muda({ categoria: e.target.value })}>
            {CATEGORIAS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Mês</label>
          <input type="month" value={d.mes} onChange={(e) => muda({ mes: e.target.value })} />
        </div>
      </div>
      <div className="f-row">
        <div className="field">
          <label>Início</label>
          <input type="date" value={d.inicio || ""} onChange={(e) => muda({ inicio: e.target.value })} />
        </div>
        <div className="field">
          <label>Fim</label>
          <input type="date" value={d.fim || ""} onChange={(e) => muda({ fim: e.target.value })} />
        </div>
      </div>
      <div className="f-row">
        <div className="field">
          <label>Local</label>
          <input type="text" value={d.local || ""} onChange={(e) => muda({ local: e.target.value })} />
        </div>
        <div className="field">
          <label>Link</label>
          <input type="text" value={d.link || ""} onChange={(e) => muda({ link: e.target.value })} />
        </div>
      </div>

      <div className="tarefa-secao">Sobre</div>
      <div className="field">
        <textarea
          className="tarefa-notas"
          value={d.descricao || ""}
          onChange={(e) => muda({ descricao: e.target.value })}
        />
      </div>
    </>
  );
}

/* A conversa do item: mesmo balão e mesmas regras do kanban de marca. */
const API_COMENT = { editar: editarComentarioItem, excluir: excluirComentarioItem };

function Conversa({ item, lista, podeComentar }) {
  const auth = useAuth();
  const { eu } = usePermissoes();
  const perfil = auth.perfil;
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setErro("");
    const r = await comentarItem(item.id, texto);
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setTexto("");
  }

  /* Mais recente em cima, como no kanban. */
  const recentes = [...lista].reverse();

  return (
    <div className="painel">
      <div className="tarefa-secao painel-titulo">
        Comentários
        {lista.length > 0 && <span className="painel-n">{lista.length}</span>}
      </div>

      {erro && <div className="banner" style={{ borderColor: "var(--danger)" }}>{erro}</div>}

      {podeComentar && (
        <div className="coment-novo">
          <Avatar email={perfil?.email} nome={perfil?.nome} />
          <div className="coment-novo-caixa">
            <textarea
              value={texto}
              placeholder="Escreva um comentário…"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
            />
            <div className="coment-novo-pe">
              <button className="btn sm primary" type="button" disabled={!texto.trim() || enviando} onClick={enviar}>
                {enviando ? "Enviando…" : "Comentar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {recentes.length > 0 && (
        <ul className="coment-lista">
          {recentes.map((c) => (
            <Comentario
              key={c.id + (c.editado_em || "")}
              e={{
                id: c.id,
                texto: c.texto,
                autor: c.autor,
                autorNome: c.autor_nome,
                em: c.criado_em,
                editadoEm: c.editado_em,
              }}
              meuEmail={perfil?.email}
              souAdmin={!!eu?.admin}
              aoMudar={() => {}}
              api={API_COMENT}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
