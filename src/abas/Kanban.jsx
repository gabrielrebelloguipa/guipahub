import { useEffect, useMemo, useState } from "react";
import { useEstado, alterar as alterarPessoal, pegarEstado, uid } from "../lib/estado.js";
import {
  useCompartilhado,
  quadroDaMarca,
  criarQuadro,
  apiQuadro,
  carregarQuadro,
  meuQuadro,
  pessoas,
  nomeDe,
  REMOTO,
} from "../lib/compartilhado.js";
import { useAuth } from "../lib/useAuth.js";
import { usePode, usePermissoes, nomeDoResponsavel } from "../lib/permissoes.js";
import Quadro, { criarApi } from "../componentes/Quadro.jsx";
import EscolheMarca from "../componentes/EscolheMarca.jsx";
import { HistoricoQuadro } from "../componentes/Historico.jsx";

export default function Kanban({ busca }) {
  const estado = useEstado();
  const compartilhado = useCompartilhado();
  const auth = useAuth();

  const modo = estado.kanbanModo || "pessoal";
  const marcaId = estado.kanbanMarcaId || "";

  /* Permissoes valem so nos quadros de marca: o pessoal e da pessoa. */
  const podeFazer = usePode();
  const { eu: euPerfil } = usePermissoes();
  const podeQuadro = {
    criar: podeFazer("demandas", "criar"),
    editar: podeFazer("demandas", "editar"),
    mover: podeFazer("demandas", "mover"),
    /* "Excluir" vale para o cartão que a própria pessoa criou; o dos
       outros só com "Excluir de outros" (ver 17-excluir-cartao-proprio). */
    excluir: podeFazer("demandas", "excluir"),
    excluirOutros: podeFazer("demandas", "excluir_outros"),
    eu: (auth.perfil?.email || "").toLowerCase(),
    /* Colunas dos quadros de marca: só admin cria, exclui e mexe (20). */
    colunas: !!euPerfil?.admin,
  };

  const marcas = compartilhado.marcas || [];
  const marca = marcas.find((m) => m.id === marcaId) || null;
  const quadro = marca ? quadroDaMarca(compartilhado, marca.id) : null;

  /* O quadro pessoal é um quadro do banco com dono (20): só a pessoa vê,
     e cada cartão é gravado sozinho. Sem banco, cai no navegador. */
  const pessoal = meuQuadro(compartilhado);
  const apiLocal = useMemo(
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
  const apiPessoal = useMemo(
    () => (REMOTO ? (pessoal ? apiQuadro(pessoal.id) : null) : apiLocal),
    [pessoal?.id, apiLocal]
  );
  const apiEmpresa = useMemo(() => (quadro ? apiQuadro(quadro.id) : null), [quadro?.id]);

  /* Colunas e cartões só do quadro que está aberto. */
  useEffect(() => {
    if (modo === "empresas" && quadro) carregarQuadro(quadro.id);
  }, [modo, quadro?.id]);

  /* Nomes do time, para mostrar "Ana" em vez de "ana.souza@guipabrasil.com"
     no responsável e em quem criou cada cartão. */
  const [time, setTime] = useState([]);
  useEffect(() => {
    pessoas().then(setTime);
  }, []);
  const nome = (email) => nomeDe(email, time);
  /* Responsável vem da lista do comercial, não de quem já entrou: parte
     do time de vendas ainda não fez login, e apareceria pelo e-mail. */
  const { responsaveis } = usePermissoes();
  const nomeResp = (email) => nomeDoResponsavel(email, responsaveis);

  const [verHistorico, setVerHistorico] = useState(false);
  useEffect(() => setVerHistorico(false), [quadro?.id]);

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
            <EscolheMarca
              marcas={marcas}
              valor={marcaId}
              aoEscolher={(id) => alterarPessoal({ kanbanMarcaId: id })}
              nomeResponsavel={nomeResp}
            />

            {marca && !quadro && euPerfil?.admin && (
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
        !REMOTO ? (
          <Quadro listas={estado.listas} demandas={estado.demandas} api={apiLocal} busca={busca} />
        ) : !pessoal?.carregado || !apiPessoal ? (
          compartilhado.erro ? (
            <div className="banner" style={{ borderColor: "var(--danger)" }}>{compartilhado.erro}</div>
          ) : (
            <div className="empty">Carregando…</div>
          )
        ) : (
          <Quadro listas={pessoal.listas} demandas={pessoal.demandas} api={apiPessoal} busca={busca} />
        )
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
          <div className="quadro-topo">
            <div className="qt-marca">
              <div className="qt-nome">{marca.nome}</div>
              <div className="qt-meta">
                {marca.nicho}
                {" · "}
                {marca.responsavel ? (
                  <>Conta com <b>{nomeResp(marca.responsavel)}</b></>
                ) : (
                  <span className="qt-sem">sem responsável — defina na aba Marcas</span>
                )}
              </div>
            </div>
            <button
              className={"btn sm" + (verHistorico ? " primary" : " ghost")}
              type="button"
              onClick={() => setVerHistorico((v) => !v)}
            >
              {verHistorico ? "Voltar ao quadro" : "Histórico do quadro"}
            </button>
          </div>

          {compartilhado.erro && (
            <div className="banner" style={{ borderColor: "var(--danger)" }}>{compartilhado.erro}</div>
          )}

          {verHistorico ? (
            <div className="card">
              <HistoricoQuadro quadroId={quadro.id} />
            </div>
          ) : !quadro.carregado ? (
            <div className="empty">Carregando…</div>
          ) : (
            <Quadro
              listas={quadro.listas}
              demandas={quadro.demandas}
              api={apiEmpresa}
              busca={busca}
              pode={podeQuadro}
              historico={{
                quadroId: quadro.id,
                perfil: auth.perfil,
                podeComentar: podeFazer("demandas", "comentar"),
                nome,
              }}
            />
          )}
        </>
      )}
    </>
  );
}
