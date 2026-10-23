import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import { sair } from "../lib/auth.js";
import { useTema, definirTema } from "../lib/tema.js";

const TEMAS = [
  ["sistema", "Padrão do navegador", "⚙"],
  ["light", "Claro", "☀"],
  ["dark", "Escuro", "☾"],
];

export default function Topbar({ busca, aoBuscar }) {
  const auth = useAuth();
  const tema = useTema();
  const [menuAberto, setMenuAberto] = useState(false);
  const caixa = useRef(null);

  /* Clique fora fecha o menu. No app antigo isto era um listener global
     religado a cada render; aqui o efeito se desmonta sozinho. */
  useEffect(() => {
    if (!menuAberto) return;
    function fora(ev) {
      if (caixa.current && !caixa.current.contains(ev.target)) setMenuAberto(false);
    }
    function esc(ev) {
      if (ev.key === "Escape") setMenuAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menuAberto]);

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
        <button
          className={"user-btn" + (menuAberto ? " open" : "")}
          type="button"
          onClick={() => setMenuAberto((v) => !v)}
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
