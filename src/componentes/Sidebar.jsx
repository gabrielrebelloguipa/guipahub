import { useEstado, statusInfo } from "../lib/estado.js";
import { useCompartilhado } from "../lib/compartilhado.js";

export const SECOES = [
  { key: "hoje", label: "Hoje", ico: "◉" },
  { key: "demandas", label: "Kanban", ico: "≡" },
  { key: "central", label: "Central Guipa", ico: "◆" },
  { key: "marcas", label: "Marcas", ico: "◑" },
  { key: "clientes", label: "Clientes", ico: "▧" },
  { key: "prompts", label: "Prompts", ico: "✦" },
];

export default function Sidebar({ secao, aoTrocar }) {
  const estado = useEstado();
  const compartilhado = useCompartilhado();

  /* Cartão em coluna de concluído não conta como pendente — é o que faz
     "Finalizadas" se comportar direito sem regra especial. */
  function contagem(key) {
    if (key === "demandas")
      return estado.demandas.filter((d) => !statusInfo(estado, d.status).concluida)
        .length;
    if (key === "prompts") return estado.prompts.length;
    if (key === "marcas") return (compartilhado.marcas || []).length;
    if (key === "central") return estado.central.length;
    return 0;
  }

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <div className="mark">G</div>
        <div>
          <div className="name">GuipaHub</div>
          <div className="tag">interno</div>
        </div>
      </div>

      <nav className="side-nav">
        {SECOES.map((s) => {
          const n = contagem(s.key);
          return (
            <button
              key={s.key}
              type="button"
              className={"nav-item" + (secao === s.key ? " active" : "")}
              onClick={() => aoTrocar(s.key)}
            >
              <span className="ico">{s.ico}</span>
              <span>{s.label}</span>
              {n > 0 && <span className="count">{n}</span>}
            </button>
          );
        })}
      </nav>

      <div className="side-foot">
        <div className="hint">
          Clientes vêm do Drive. O resto fica só neste navegador.
        </div>
      </div>
    </aside>
  );
}
