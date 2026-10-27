import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import { sair } from "../lib/auth.js";
import { useTema, definirTema } from "../lib/tema.js";
import { useNotificacoes } from "../lib/notificacoes.js";
import { useEstado, alterar } from "../lib/estado.js";
import { fmtData } from "../lib/constantes.js";

const TEMAS = [
  ["sistema", "Padrão do navegador", "⚙"],
  ["light", "Claro", "☀"],
  ["dark", "Escuro", "☾"],
];

function quandoVence(n) {
  if (n < 0) return n === -1 ? "venceu ontem" : `venceu há ${-n} dias`;
  if (n === 0) return "vence hoje";
  if (n === 1) return "vence amanhã";
  return `vence em ${n} dias`;
}

/* O sininho: avisos calculados em notificacoes.js. O número conta só os
   que a pessoa ainda não viu; abrir a lista marca todos como vistos. */
function Sininho({ aberto, aoAlternar, aoIrPara }) {
  const itens = useNotificacoes();
  const estado = useEstado();
  const vistas = estado.notifVistas || [];
  const novas = itens.filter((i) => !vistas.includes(i.id)).length;

  function abrir() {
    aoAlternar();
    if (!aberto && novas) {
      /* guarda só os ids que ainda existem: a lista não cresce para sempre */
      alterar({ notifVistas: itens.map((i) => i.id) });
    }
  }

  function ir(i) {
    const { aba, ...resto } = i.destino;
    if (Object.keys(resto).length) alterar(resto);
    aoIrPara(aba);
    aoAlternar();
  }

  return (
    <>
      <button
        className={"icon-ghost sino" + (aberto ? " on" : "")}
        type="button"
        aria-label={novas ? `Notificações (${novas} novas)` : "Notificações"}
        onClick={abrir}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.6V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z"
            fill="currentColor"
          />
        </svg>
        {novas > 0 && <span className="sino-n">{novas > 9 ? "9+" : novas}</span>}
      </button>
      {aberto && (
        <div className="menu avisos">
          <div className="menu-head">
            <div className="n">Notificações</div>
          </div>
          {!itens.length ? (
            <div className="avisos-vazio">Nada por aqui.</div>
          ) : (
            itens.map((i) => (
              <button key={i.id} type="button" className="aviso" onClick={() => ir(i)}>
                <span className={"aviso-ico " + (i.tipo === "prazo" ? (i.dias < 0 ? "venceu" : "prazo") : "perfil")}>
                  {i.tipo === "prazo" ? (i.dias < 0 ? "!" : "◷") : "✎"}
                </span>
                <span className="aviso-corpo">
                  <span className="aviso-titulo">{i.titulo}</span>
                  <span className="aviso-meta">
                    {i.tipo === "prazo" ? `${quandoVence(i.dias)} · ${fmtData(i.prazo)} · ${i.onde}` : i.onde}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
}

export default function Topbar({ busca, aoBuscar, aoIrPara }) {
  const auth = useAuth();
  const tema = useTema();
  const [menuAberto, setMenuAberto] = useState(false);
  const [avisosAberto, setAvisosAberto] = useState(false);
  const caixa = useRef(null);

  /* Clique fora fecha o menu. No app antigo isto era um listener global
     religado a cada render; aqui o efeito se desmonta sozinho. */
  useEffect(() => {
    if (!menuAberto && !avisosAberto) return;
    function fechar() {
      setMenuAberto(false);
      setAvisosAberto(false);
    }
    function fora(ev) {
      if (caixa.current && !caixa.current.contains(ev.target)) fechar();
    }
    function esc(ev) {
      if (ev.key === "Escape") fechar();
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuAberto, avisosAberto]);

  return (
    <div className="topbar">
      <div className="search-wrap">
        <input
          type="text"
          placeholder="Buscar tarefas, materiais, prompts…"
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
        />
      </div>

      <div className="top-right" ref={caixa}>
        {auth.perfil && (
          <Sininho
            aberto={avisosAberto}
            aoAlternar={() => {
              setMenuAberto(false);
              setAvisosAberto((v) => !v);
            }}
            aoIrPara={aoIrPara}
          />
        )}
        <button
          className={"user-btn" + (menuAberto ? " open" : "")}
          type="button"
          onClick={() => {
            setAvisosAberto(false);
            setMenuAberto((v) => !v);
          }}
        >
          <span className="avatar">{auth.perfil?.iniciais || "—"}</span>
          <span className="uname">{auth.perfil?.nome || "Entrar"}</span>
          <span className="caret">▾</span>
        </button>

        {menuAberto && (
          <div className="menu">
            <div className="menu-head">
              <div className="n">{auth.perfil?.nome || "Sem sessão"}</div>
              <div className="e">{auth.perfil?.email || "—"}</div>
            </div>
            <div className="menu-tema">
              <span>Tema</span>
              <div
                className="tema-slide"
                role="radiogroup"
                aria-label="Tema"
                style={{ "--pos": Math.max(0, TEMAS.findIndex(([k]) => k === tema)) }}
              >
                <span className="tema-bola" aria-hidden="true" />
                {TEMAS.map(([chave, rotulo, icone]) => (
                  <button
                    key={chave}
                    type="button"
                    role="radio"
                    aria-checked={tema === chave}
                    aria-label={rotulo}
                    title={rotulo}
                    className={tema === chave ? "on" : ""}
                    onClick={() => definirTema(chave)}
                  >
                    {icone}
                  </button>
                ))}
              </div>
            </div>
            {auth.perfil && (
              <>
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  type="button"
                  onClick={() => {
                    setMenuAberto(false);
                    sair();
                  }}
                >
                  <span className="mi">⏻</span>
                  <span>Sair da conta</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
