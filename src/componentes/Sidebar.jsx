import { useEstado, statusInfo } from "../lib/estado.js";
import { useCompartilhado } from "../lib/compartilhado.js";
import { useCentral } from "../lib/central.js";
import { useMenu } from "../lib/menu.js";
import { usePrompts } from "../lib/prompts.js";
import simbolo from "../assets/simbolo-guipa.png";

export default function Sidebar({ secao, aoTrocar }) {
  const estado = useEstado();
  const compartilhado = useCompartilhado();
  const central = useCentral();
  const prompts = usePrompts();
  /* Abas permitidas, na ordem que a pessoa escolheu. Configurações
     aparece para todo mundo por causa da ordem do menu; o resto dela
     (permissões, Drive…) só admin vê. */
  const lista = useMenu().todas;

  /* Cartão em coluna de concluído não conta como pendente — é o que faz
     "Finalizadas" se comportar direito sem regra especial. */
  function contagem(key) {
    if (key === "demandas")
      return estado.demandas.filter((d) => !statusInfo(estado, d.status).concluida)
        .length;
    if (key === "prompts") return prompts.meus.length + prompts.favoritos.length;
    if (key === "marcas") return (compartilhado.marcas || []).length;
    if (key === "central") return central.materiais.length + central.guias.length + central.imagens.length;
    return 0;
  }

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <img className="mark" src={simbolo} alt="GUIPA" />
        <div>
          <div className="name">GuipaHub</div>
          <div className="tag">interno</div>
        </div>
      </div>

      <nav className="side-nav">
        {lista.map((s) => {
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
    </aside>
  );
}
