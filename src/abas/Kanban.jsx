import { useMemo, useState } from "react";
import { useEstado, alterar as alterarPessoal, pegarEstado, uid } from "../lib/estado.js";
import {
  useCompartilhado,
  quadroDaMarca,
  criarQuadro,
  apiQuadroEmpresa,
} from "../lib/compartilhado.js";
import { useAuth } from "../lib/useAuth.js";
import Quadro, { criarApi } from "../componentes/Quadro.jsx";
import AvisoAlcance from "../componentes/AvisoAlcance.jsx";

export default function Kanban({ busca }) {
  const estado = useEstado();
  const compartilhado = useCompartilhado();
  const auth = useAuth();

  const modo = estado.kanbanModo || "pessoal";
  const marcaId = estado.kanbanMarcaId || "";

  const marcas = compartilhado.marcas || [];
  const marca = marcas.find((m) => m.id === marcaId) || null;
  const quadro = marca ? quadroDaMarca(compartilhado, marca.id) : null;

  /* Duas fontes de dados, uma interface. O `api` do quadro é montado com
     o par ler/gravar de cada lado — o componente Quadro não sabe se está
     mexendo no localStorage de quem usa ou no quadro de uma marca. */
  const apiPessoal = useMemo(
    () =>
      criarApi(
        () => {
          const e = pegarEstado();
          return { listas: e.listas, demandas: e.demandas };
        },
        (patch) => alterarPessoal(patch),
        uid
      ),
    []
  );

  /* As operacoes do quadro de marca moram no compartilhado: elas
     precisam saber falar SQL quando o Supabase estiver ligado, o que
     o criarApi generico (que so troca objetos) nao faz. */
  const apiEmpresa = useMemo(
    () => (quadro ? apiQuadroEmpresa(quadro.id) : null),
    [quadro?.id]
  );

  return (
    <>
      <div className="chips" style={{ alignItems: "center" }}>
        <div className="seg">
          <button
            type="button"
            className={modo === "pessoal" ? "on" : ""}
            onClick={() => alterarPessoal({ kanbanModo: "pessoal" })}
          >
            Pessoal
          </button>
          <button
            type="button"
            className={modo === "empresas" ? "on" : ""}
            onClick={() => alterarPessoal({ kanbanModo: "empresas" })}
          >
            Marcas
          </button>
        </div>

        {modo === "empresas" && (
          <>
            <select
              value={marcaId}
              onChange={(e) => alterarPessoal({ kanbanMarcaId: e.target.value })}
              style={{
                background: "var(--bg)", color: "var(--text)",
                border: "1px solid var(--border)", borderRadius: 8,
                padding: "7px 10px", fontSize: "0.84rem", fontFamily: "inherit",
              }}
            >
              <option value="">— escolha a marca —</option>
              {marcas.map((m) => {
                const tem = !!quadroDaMarca(compartilhado, m.id);
                return (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                    {tem ? "" : "  (sem quadro)"}
                  </option>
                );
              })}
            </select>

            {marca && !quadro && (
              <button
                className="btn primary sm"
                type="button"
                onClick={() => criarQuadro(marca.id, auth.perfil?.email)}
              >
                ＋ Criar quadro para {marca.nome}
              </button>
            )}
          </>
        )}
      </div>

      {modo === "pessoal" ? (
        <>
          <div className="sub" style={{ marginBottom: 12 }}>
            Só você vê este quadro. É a sua rotina.
          </div>
          <Quadro
            listas={estado.listas}
            demandas={estado.demandas}
            api={apiPessoal}
            busca={busca}
          />
        </>
      ) : !marcas.length ? (
        <div className="empty">
          Nenhuma marca cadastrada ainda. Os quadros saem do cadastro de
          marcas — cadastre a primeira na aba Marcas.
        </div>
      ) : !marca ? (
        <div className="empty">
          Escolha uma marca no seletor acima para ver o quadro dela.
        </div>
      ) : !quadro ? (
        <div className="empty">
          <b>{marca.nome}</b> ainda não tem quadro. Clique em “Criar quadro”
          acima para começar um do zero, com as colunas padrão.
        </div>
      ) : (
        <>
          <AvisoAlcance>
            <b>Quadro de {marca.nome}.</b> É compartilhado: o que você mexer
            aqui vale para o time.
          </AvisoAlcance>
          <Quadro
            listas={quadro.listas}
            demandas={quadro.demandas}
            api={apiEmpresa}
            busca={busca}
          />
        </>
      )}
    </>
  );
}
