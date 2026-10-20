import { useEstado, statusInfo } from "../lib/estado.js";
import { useCompartilhado } from "../lib/compartilhado.js";
import { usePermissoes, ABAS, abasDe } from "../lib/permissoes.js";

/* A lista canônica agora mora em permissoes.js, para a tela de
   permissões e a sidebar nunca discordarem sobre quais abas existem. */
export const SECOES = ABAS;

export const ABA_CONFIG = { key: "config", label: "Configurações", ico: "⚙" };

export default function Sidebar({ secao, aoTrocar }) {
  const estado = useEstado();
  const compartilhado = useCompartilhado();
  const { eu, abasPadrao, permissoesPadrao } = usePermissoes();

  /* Configurações só aparece para admin. Não é tranca — é tirar da
     frente de quem não tem o que fazer ali; o banco recusa a escrita
     de quem não é admin de qualquer jeito. */
  const visiveis = abasDe(eu, abasPadrao, permissoesPadrao);
  const lista = SECOES.filter((s) => visiveis.includes(s.key));
  if (eu?.admin) lista.push(ABA_CONFIG);

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

      <div className="side-foot">
        <div className="hint">
          As imagens vêm do Drive. O resto fica só neste navegador.
        </div>
      </div>
    </aside>
  );
}
