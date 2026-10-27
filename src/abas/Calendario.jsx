import { useEffect, useState } from "react";
import Modal from "../componentes/Modal.jsx";
import { usePode } from "../lib/permissoes.js";
import {
  CATEGORIAS,
  useCalendario,
  iniciarCalendario,
  salvarItem,
  excluirItem,
} from "../lib/calendario.js";

const CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

export default function Calendario({ busca }) {
  const { itens, carregando, erro } = useCalendario();
  const podeFazer = usePode();
  const podeCriar = podeFazer("calendario", "criar");
  const podeEditar = podeFazer("calendario", "editar");
  const estreito = useEstreito();
  const hoje = new Date();
  const mesAtual = chaveMes(hoje.getFullYear(), hoje.getMonth());
  const [periodo, setPeriodo] = useState(() => semestreDe(hoje));
  const [form, setForm] = useState(null);

  useEffect(() => {
    iniciarCalendario();
  }, []);

  const meses = Array.from({ length: 6 }, (_, i) => {
    const m = periodo.sem * 6 + i;
    return { chave: chaveMes(periodo.ano, m), rotulo: CURTO[m], ano: periodo.ano };
  });
  const noSemestreAtual =
    periodo.ano === hoje.getFullYear() && periodo.sem === (hoje.getMonth() < 6 ? 0 : 1);

  const termo = (busca || "").trim().toLowerCase();
  const daCelula = (mes, cat) => itens.filter((i) => i.mes === mes && i.categoria === cat);

  function Item({ i }) {
    const fora = termo && !i.titulo.toLowerCase().includes(termo);
    const cls = "cal-item c-" + i.categoria + (fora ? " fora" : "");
    return podeEditar ? (
      <button type="button" className={cls} onClick={() => setForm(i)}>
        {i.titulo}
      </button>
    ) : (
      <div className={cls}>{i.titulo}</div>
    );
  }

  function Mais({ mes, categoria }) {
    if (!podeCriar) return null;
    return (
      <button
        type="button"
        className="cal-add"
        aria-label="Adicionar"
        onClick={() => setForm({ mes, categoria, titulo: "" })}
      >
        +
      </button>
    );
  }

  const barra = (
    <div className="cal-barra">
      <button className="btn sm" type="button" aria-label="Semestre anterior" onClick={() => setPeriodo(andar(periodo, -1))}>
        ‹
      </button>
      <div className="cal-periodo">
        {periodo.sem ? "Jul – Dez" : "Jan – Jun"} {periodo.ano}
      </div>
      <button className="btn sm" type="button" aria-label="Próximo semestre" onClick={() => setPeriodo(andar(periodo, 1))}>
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

      {form && <FormItem inicial={form} aoFechar={() => setForm(null)} />}
    </div>
  );
}

function FormItem({ inicial, aoFechar }) {
  const novo = !inicial.id;
  const [it, setIt] = useState({ ...inicial, mes: inicial.mes.slice(0, 7) });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const podeFazer = usePode();

  async function salvar() {
    if (!it.titulo.trim() || !it.mes) return;
    setSalvando(true);
    const r = await salvarItem({ ...it, mes: it.mes + "-01" });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  async function excluir() {
    setSalvando(true);
    const r = await excluirItem(it.id);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Novo item" : "Editar item"}
      aoFechar={aoFechar}
      acoes={
        <>
          {!novo && podeFazer("calendario", "excluir") && (
            <button
              className="btn sm ghost danger"
              type="button"
              style={{ marginRight: "auto" }}
              disabled={salvando}
              onClick={excluir}
            >
              Excluir
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
      <div className="field">
        <label>Título</label>
        <input
          type="text"
          autoFocus
          value={it.titulo}
          onChange={(e) => setIt({ ...it, titulo: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && salvar()}
        />
      </div>
      <div className="f-row">
        <div className="field">
          <label>Mês</label>
          <input type="month" value={it.mes} onChange={(e) => setIt({ ...it, mes: e.target.value })} />
        </div>
        <div className="field">
          <label>Categoria</label>
          <select value={it.categoria} onChange={(e) => setIt({ ...it, categoria: e.target.value })}>
            {CATEGORIAS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
