import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/useAuth.js";
import {
  calcularCircuito,
  calcularEspeciais,
  PRACAS_PADRAO,
  LINHAS_ESPECIAIS_PADRAO,
  PREMISSAS_PADRAO,
  PERIODOS,
  NOTAS,
  fmt,
} from "../lib/calculo.js";
import { exportarXlsx, exportarImagem } from "../lib/exporta.js";
import logoGuipa from "../assets/logo-guipa.png";
import { usePermissoes } from "../lib/permissoes.js";

/* A proposta em andamento fica guardada no navegador de quem está
   montando: fechar a aba no meio de uma negociação não pode apagar o que
   já foi digitado. É conveniência de uma pessoa só — proposta não é dado
   do time, então não vai para o banco. */
const CHAVE = "guipahub_calculadora_v1";

function lerGuardado() {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE) || "null");
    return g && typeof g === "object" ? g : null;
  } catch {
    return null;
  }
}

let seq = 0;
const novoId = () => "x" + Date.now().toString(36) + (seq++).toString(36);

/* Número digitado no jeito brasileiro ("220.000", "1.234,5") ou no
   americano ("220000", "1234.5"). Ponto seguido de três dígitos no fim
   é milhar; vírgula é decimal. */
function numero(txt) {
  const s = String(txt ?? "").trim().replace(/\s|R\$/g, "");
  if (!s) return 0;
  const br = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(br);
  return Number.isFinite(n) ? n : 0;
}

/* Campo numérico que mostra o número formatado quando não está em uso e
   o valor cru quando está. Com type=number puro, "220.000" seria lido
   como 220 por quem digita no jeito brasileiro. */
function CampoNum({ valor, aoMudar, sufixo, largo, capturando, formato = fmt.num }) {
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState("");
  if (capturando) return <span className="calc-val">{formato(valor)}{sufixo || ""}</span>;
  return (
    <input
      className={"calc-in" + (largo ? " largo" : "")}
      inputMode="decimal"
      value={editando ? txt : formato(valor) + (sufixo || "")}
      onFocus={(e) => {
        setEditando(true);
        setTxt(String(valor ?? ""));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        setEditando(false);
        aoMudar(numero(txt));
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function CampoTxt({ valor, aoMudar, capturando, placeholder }) {
  if (capturando) return <span className="calc-val">{valor}</span>;
  return (
    <input
      className="calc-in txt"
      value={valor}
      placeholder={placeholder}
      onChange={(e) => aoMudar(e.target.value)}
    />
  );
}

/* Desconto é digitado em porcentagem inteira (50) e guardado como fração
   (0,5), que é como a planilha faz a conta. */
const pct = (v) => fmt.num(Math.round((v || 0) * 1000) / 10);

export default function Calculadora() {
  const auth = useAuth();
  const guardado = lerGuardado();

  const [modo, setModo] = useState(guardado?.modo || "especiais");
  const [cab, setCab] = useState(
    guardado?.cab || {
      agencia: "", cliente: "", campanha: "", periodo: "",
    }
  );
  /* Quem atende sai do login (nome e e-mail, fixos) e do perfil
     (telefone, editável em Configurações › Meu perfil). Não se digita na
     proposta, e o que tenha ficado guardado de antes é ignorado. */
  const { eu } = usePermissoes();
  const cabFinal = {
    ...cab,
    atendimento: auth.perfil?.nome || "",
    email: auth.perfil?.email || "",
    telefone: eu?.telefone || "",
  };
  const [pracas, setPracas] = useState(guardado?.pracas || PRACAS_PADRAO);
  const [especiais, setEspeciais] = useState(guardado?.especiais || LINHAS_ESPECIAIS_PADRAO);
  /* Premissas são fixas: os números da tabela de preços vigente. Não
     ficam editáveis na tela, e um valor alterado que tenha sobrado no
     navegador de alguém é ignorado. Reajuste da tabela = mudar
     PREMISSAS_PADRAO no código. */
  const premissas = PREMISSAS_PADRAO;
  const [capturando, setCapturando] = useState(false);
  const [exportando, setExportando] = useState("");
  const [erro, setErro] = useState("");
  const folha = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ modo, cab, pracas, especiais }));
    } catch {
      /* sem espaço: a proposta vale só enquanto a aba estiver aberta */
    }
  }, [modo, cab, pracas, especiais]);

  const circ = calcularCircuito(pracas, premissas);
  const esp = calcularEspeciais(especiais, premissas);

  const mudaCab = (k) => (v) => setCab((c) => ({ ...c, [k]: v }));
  const mudaPraca = (id, patch) =>
    setPracas((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const mudaEsp = (id, patch) =>
    setEspeciais((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  async function exportar(tipo) {
    setErro("");
    setExportando(tipo);
    try {
      if (tipo === "xlsx") {
        await exportarXlsx({ modo, cab: cabFinal, pracas, especiais, premissas, logoUrl: logoGuipa });
      } else {
        /* Troca os campos por texto, espera o navegador redesenhar, e só
           então fotografa. Sem a espera, a imagem sairia com as caixas
           de digitação no meio da proposta. */
        setCapturando(true);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await exportarImagem(folha.current, { cab: cabFinal, modo });
      }
    } catch (e) {
      setErro("Não consegui exportar: " + (e?.message || "erro"));
    } finally {
      setCapturando(false);
      setExportando("");
    }
  }

  function recomecar() {
    setPracas(PRACAS_PADRAO);
    setEspeciais(LINHAS_ESPECIAIS_PADRAO);
    setCab((c) => ({ ...c, agencia: "", cliente: "", campanha: "", periodo: "" }));
  }

  return (
    <>
      <div className="chips" style={{ alignItems: "center" }}>
        <div className="seg">
          <button type="button" className={modo === "especiais" ? "on" : ""} onClick={() => setModo("especiais")}>
            Projetos Especiais
          </button>
          <button type="button" className={modo === "circuito" ? "on" : ""} onClick={() => setModo("circuito")}>
            Circuito SP/RJ
          </button>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn sm ghost" type="button" onClick={recomecar}>
            Recomeçar
          </button>
          <button className="btn sm" type="button" disabled={!!exportando} onClick={() => exportar("png")}>
            {exportando === "png" ? "gerando…" : "Exportar imagem"}
          </button>
          <button className="btn sm primary" type="button" disabled={!!exportando} onClick={() => exportar("xlsx")}>
            {exportando === "xlsx" ? "gerando…" : "Exportar Excel"}
          </button>
        </div>
      </div>

      {erro && <div className="banner" style={{ borderColor: "var(--danger)" }}>{erro}</div>}

      <div className="calc-rola" style={{ marginTop: 12 }}>
        <div className={"calc-folha" + (capturando ? " capturando" : "")} ref={folha}>
          <div className="calc-topo">
            <div className="calc-cab">
              {[
                ["agencia", "Agência"], ["cliente", "Cliente"], ["campanha", "Campanha"], ["periodo", "Período"],
              ].map(([k, rot]) => (
                <label key={k} className="calc-cab-item">
                  <span>{rot}:</span>
                  <CampoTxt valor={cab[k]} aoMudar={mudaCab(k)} capturando={capturando} />
                </label>
              ))}
            </div>
            <div className="calc-cab">
              {[
                ["atendimento", "Atendimento Comercial"], ["email", "E-mail"], ["telefone", "Telefone"],
              ].map(([k, rot]) => (
                <div key={k} className="calc-cab-item">
                  <span>{rot}:</span>
                  <span className="calc-val">{cabFinal[k]}</span>
                </div>
              ))}
            </div>
            <img className="calc-marca" src={logoGuipa} alt="GUIPA" />
          </div>

          {modo === "circuito" ? (
            <table className="calc-tab">
              <thead>
                <tr>
                  <th>Praça</th><th>Ativos / Circuito</th><th>Faces / Ativos</th><th>Período</th>
                  <th>Inserções / Dia</th><th>Inserções no período</th><th>Valor Tabela</th>
                  <th>Desconto</th><th>Valor Negociado</th><th>Valor Líquido</th>
                  <th>Custo / Inserção</th><th>Impactos</th><th>CPM</th>
                  {!capturando && <th className="so-tela" />}
                </tr>
              </thead>
              <tbody>
                {circ.linhas.map((l) => {
                  const pr = pracas.find((p) => p.id === l.pracaId);
                  const s1 = l.slot === 1;
                  return (
                    <tr key={l.chave} className={s1 ? "" : "slot2"}>
                      <td>{s1 ? <CampoTxt valor={pr.praca} aoMudar={(v) => mudaPraca(pr.id, { praca: v })} capturando={capturando} /> : <span className="calc-val dim">{l.praca}</span>}</td>
                      <td>
                        {s1 ? (
                          <span className="calc-ativos">
                            Digital 1:1 -{" "}
                            <CampoNum valor={pr.ativos} aoMudar={(v) => mudaPraca(pr.id, { ativos: v })} capturando={capturando} />
                          </span>
                        ) : (
                          <span className="calc-val">{l.ativos}</span>
                        )}
                      </td>
                      <td>{s1 ? <CampoNum valor={pr.faces} aoMudar={(v) => mudaPraca(pr.id, { faces: v })} capturando={capturando} /> : <span className="calc-val">{fmt.num(l.faces)}</span>}</td>
                      <td>
                        {s1 && !capturando ? (
                          <select className="calc-in" value={pr.periodo} onChange={(e) => mudaPraca(pr.id, { periodo: e.target.value })}>
                            {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                          </select>
                        ) : (
                          <span className="calc-val">{l.periodo}</span>
                        )}
                      </td>
                      <td>{s1 ? <CampoNum valor={pr.insercoesDia} aoMudar={(v) => mudaPraca(pr.id, { insercoesDia: v })} capturando={capturando} /> : <span className="calc-val calc-deriv" title="Metade do slot 1:1">{fmt.num(l.insercoesDia)}</span>}</td>
                      <td className="calc-conta">{fmt.num(l.insercoesPeriodo)}</td>
                      <td>{s1 ? <CampoNum valor={pr.tabela} aoMudar={(v) => mudaPraca(pr.id, { tabela: v })} capturando={capturando} formato={fmt.brl} largo /> : <span className="calc-val calc-deriv" title="70% da tabela do slot 1:1">{fmt.brl(l.tabela)}</span>}</td>
                      <td>
                        <CampoNum
                          valor={Math.round(l.desconto * 1000) / 10}
                          aoMudar={(v) => mudaPraca(pr.id, s1 ? { desconto1: v / 100 } : { desconto2: v / 100 })}
                          capturando={capturando}
                          sufixo="%"
                          formato={(v) => fmt.num(v)}
                        />
                      </td>
                      <td className="calc-conta">{fmt.brl(l.negociado)}</td>
                      <td className="calc-conta forte">{fmt.brl(l.liquido)}</td>
                      <td className="calc-conta">{fmt.brlFino(l.custoInsercao)}</td>
                      <td>{s1 ? <CampoNum valor={pr.impactos} aoMudar={(v) => mudaPraca(pr.id, { impactos: v })} capturando={capturando} largo /> : <span className="calc-val calc-deriv" title="Metade do slot 1:1">{fmt.num(l.impactos)}</span>}</td>
                      <td className="calc-conta">{fmt.brl(l.cpm)}</td>
                      {!capturando && (
                        <td className="so-tela calc-acoes">
                          {s1 ? (
                            <>
                              <button className="btn sm ghost" type="button" title={pr.comSlot2 ? "Tirar o slot 1:2" : "Incluir o slot 1:2"} onClick={() => mudaPraca(pr.id, { comSlot2: !pr.comSlot2 })}>
                                {pr.comSlot2 ? "−1:2" : "+1:2"}
                              </button>
                              {pracas.length > 1 && (
                                <button className="btn sm ghost danger" type="button" title="Remover praça" onClick={() => setPracas((ps) => ps.filter((p) => p.id !== pr.id))}>✕</button>
                              )}
                            </>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Total</td>
                  <td>{fmt.num(circ.total.insercoesPeriodo)}</td>
                  <td>{fmt.brl(circ.total.tabela)}</td>
                  <td>{pct(circ.total.desconto)}%</td>
                  <td>{fmt.brl(circ.total.negociado)}</td>
                  <td>{fmt.brl(circ.total.liquido)}</td>
                  <td>{fmt.brlFino(circ.total.custoInsercao)}</td>
                  <td>{fmt.num(circ.total.impactos)}</td>
                  <td>{fmt.brl(circ.total.cpm)}</td>
                  {!capturando && <td className="so-tela" />}
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="calc-tab">
              <thead>
                <tr>
                  <th>Praça</th><th>Período</th><th>N° de Motos</th><th>N° de Faces</th>
                  <th>Inserções/dia</th><th>Inserções Totais</th><th>Custo/Inserção</th>
                  <th>Valor Tabela</th><th>Desconto</th><th>Valor Negociado</th>
                  <th>Valor Líquido</th><th>Valor/Dia/Moto</th>
                  {!capturando && <th className="so-tela" />}
                </tr>
              </thead>
              <tbody>
                {esp.linhas.map((l) => (
                  <tr key={l.id}>
                    <td><CampoTxt valor={l.praca} aoMudar={(v) => mudaEsp(l.id, { praca: v })} capturando={capturando} /></td>
                    <td>
                      <span className="calc-ativos">
                        <CampoNum valor={l.dias} aoMudar={(v) => mudaEsp(l.id, { dias: v })} capturando={capturando} /> Dia(s)
                      </span>
                    </td>
                    <td><CampoNum valor={l.motos} aoMudar={(v) => mudaEsp(l.id, { motos: v })} capturando={capturando} /></td>
                    <td className="calc-conta">{fmt.num(l.faces)}</td>
                    <td className="calc-conta">{fmt.num(l.insercoesDia)}</td>
                    <td className="calc-conta">{fmt.num(l.insercoesTotais)}</td>
                    <td className="calc-conta">{fmt.brlFino(l.custoInsercao)}</td>
                    <td className="calc-conta">{fmt.brl(l.tabela)}</td>
                    <td>
                      <CampoNum
                        valor={Math.round(l.desconto * 1000) / 10}
                        aoMudar={(v) => mudaEsp(l.id, { desconto: v / 100 })}
                        capturando={capturando}
                        sufixo="%"
                        formato={(v) => fmt.num(v)}
                      />
                    </td>
                    <td className="calc-conta">{fmt.brl(l.negociado)}</td>
                    <td className="calc-conta forte">{fmt.brl(l.liquido)}</td>
                    <td className="calc-conta">{fmt.brl(l.valorDiaMoto)}</td>
                    {!capturando && (
                      <td className="so-tela calc-acoes">
                        {especiais.length > 1 && (
                          <button className="btn sm ghost danger" type="button" title="Remover linha" onClick={() => setEspeciais((ls) => ls.filter((x) => x.id !== l.id))}>✕</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {esp.linhas.length > 1 && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td>{fmt.num(esp.total.motos)}</td>
                    <td>{fmt.num(esp.total.faces)}</td>
                    <td />
                    <td>{fmt.num(esp.total.insercoesTotais)}</td>
                    <td>{fmt.brlFino(esp.total.custoInsercao)}</td>
                    <td>{fmt.brl(esp.total.tabela)}</td>
                    <td>{pct(esp.total.desconto)}%</td>
                    <td>{fmt.brl(esp.total.negociado)}</td>
                    <td>{fmt.brl(esp.total.liquido)}</td>
                    <td />
                    {!capturando && <td className="so-tela" />}
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          <ul className="calc-notas">
            {(modo === "circuito" ? NOTAS.circuito : NOTAS.especiais).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="chips" style={{ marginTop: 12 }}>
        {modo === "circuito" ? (
          <button
            className="btn sm"
            type="button"
            onClick={() =>
              setPracas((ps) => [
                ...ps,
                { id: novoId(), praca: "", ativos: 50, faces: 150, periodo: "semanal", insercoesDia: 90000, tabela: 0, impactos: 0, desconto1: 0.5, desconto2: 0.5, comSlot2: true },
              ])
            }
          >
            ＋ Praça
          </button>
        ) : (
          <button
            className="btn sm"
            type="button"
            onClick={() => setEspeciais((ls) => [...ls, { id: novoId(), praca: "", dias: 1, motos: 1, desconto: 0.6 }])}
          >
            ＋ Linha
          </button>
        )}
      </div>
    </>
  );
}
