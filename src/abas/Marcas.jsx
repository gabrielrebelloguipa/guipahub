import { usePode, pode } from "../lib/permissoes.js";
import { useState } from "react";
import {
  useCompartilhado,
  salvarMarca,
  excluirMarca,
  validarMarca,
  nichosConhecidos,
  quadroDaMarca,
} from "../lib/compartilhado.js";
import { useAuth } from "../lib/useAuth.js";
import Modal, { Confirmar } from "../componentes/Modal.jsx";
import CampoNicho from "../componentes/CampoNicho.jsx";
import AvisoAlcance from "../componentes/AvisoAlcance.jsx";
import { fmtData } from "../lib/constantes.js";

const VAZIA = {
  nome: "", nicho: "", site: "", resumo: "", descricao: "", logo: "",
};

/* Logo vira data URL reduzida: ela é guardada junto do resto, e imagem
   grande estoura o armazenamento. SVG passa direto — já é leve, e
   rasterizar destruiria o vetor. */
function reduzirLogo(arquivo) {
  return new Promise((ok, falha) => {
    if (arquivo.type === "image/svg+xml") {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => falha(new Error("não consegui ler o arquivo"));
      fr.readAsDataURL(arquivo);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const max = 256;
      const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * escala);
      cv.height = Math.round(img.naturalHeight * escala);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      ok(cv.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falha(new Error("arquivo não é uma imagem válida"));
    };
    img.src = url;
  });
}

function FormMarca({ inicial, aoFechar }) {
  const compartilhado = useCompartilhado();
  const auth = useAuth();
  const novo = !inicial;
  const [m, setM] = useState(inicial || VAZIA);
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const faltando = validarMarca(m);
  const nichos = nichosConhecidos(compartilhado);

  /* O erro só aparece depois da primeira tentativa de salvar. Marcar tudo
     de vermelho num formulário que a pessoa acabou de abrir é hostil. */
  function erroDe(campo, label) {
    return tentouSalvar && faltando.includes(label);
  }

  function campo(chave, label, obrigatorio, extra) {
    const temErro = erroDe(chave, label);
    return (
      <div className={"field" + (temErro ? " erro" : "")}>
        <label htmlFor={"mc-" + chave}>
          {label}
          {obrigatorio && <span className="obrig">*</span>}
        </label>
        {extra}
        {temErro && <div className="msg-erro">Preencha este campo</div>}
      </div>
    );
  }

  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");

  async function salvar() {
    setTentouSalvar(true);
    if (faltando.length) return;

    let site = m.site.trim();
    if (site && !/^https?:\/\//i.test(site)) site = "https://" + site;

    setSalvando(true);
    setErroSalvar("");
    const r = await salvarMarca(
      { ...m, site, nome: m.nome.trim(), nicho: m.nicho.trim() },
      auth.perfil?.email || ""
    );
    setSalvando(false);
    /* O banco recusa nome repetido. Sem mostrar isso aqui, o modal
       fecharia como se tivesse dado certo e a marca sumiria. */
    if (!r.ok) { setErroSalvar(r.erro); return; }
    aoFechar();
  }

  return (
    <Modal
      titulo={novo ? "Nova marca" : "Editar marca"}
      aoFechar={aoFechar}
      largo
      acoes={
        <>
          {tentouSalvar && faltando.length > 0 && (
            <div className="msg-erro" style={{ marginRight: "auto", marginTop: 0 }}>
              Falta preencher: {faltando.join(", ")}
            </div>
          )}
          {erroSalvar && (
            <div className="msg-erro" style={{ marginRight: "auto", marginTop: 0 }}>
              {erroSalvar}
            </div>
          )}
          <button className="btn ghost" type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primary" type="button" onClick={salvar} disabled={salvando}>
            {salvando ? "salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <div className="f-row">
        {campo("nome", "Nome", true,
          <input
            id="mc-nome"
            type="text"
            value={m.nome}
            placeholder="Ex: iFood"
            onChange={(e) => setM({ ...m, nome: e.target.value })}
          />
        )}
        {campo("nicho", "Nicho", true,
          <CampoNicho
            id="mc-nicho"
            valor={m.nicho}
            sugestoes={nichos}
            aoMudar={(v) => setM({ ...m, nicho: v })}
          />
        )}
      </div>

      {campo("site", "Site", true,
        <input
          id="mc-site"
          type="text"
          value={m.site}
          placeholder="ifood.com.br"
          onChange={(e) => setM({ ...m, site: e.target.value })}
        />
      )}

      {campo("resumo", "Resumo", true,
        <input
          id="mc-resumo"
          type="text"
          value={m.resumo}
          placeholder="Uma linha: o que a marca é"
          onChange={(e) => setM({ ...m, resumo: e.target.value })}
        />
      )}

      {campo("descricao", "Descrição completa", true,
        <textarea
          id="mc-descricao"
          value={m.descricao}
          style={{ minHeight: 140 }}
          placeholder="O que a marca faz, público, tom, o que já foi feito para ela, contatos…"
          onChange={(e) => setM({ ...m, descricao: e.target.value })}
        />
      )}

      <div className="field">
        <label>Logo</label>
        <div className="chips">
          {m.logo && (
            <span className="marca-logo">
              <img src={m.logo} alt="" />
            </span>
          )}
          <label className="btn sm" style={{ cursor: "pointer" }}>
            {m.logo ? "Trocar" : "Escolher imagem"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setM((atual) => ({ ...atual, logo: "" }));
                  const url = await reduzirLogo(f);
                  setM((atual) => ({ ...atual, logo: url }));
                } catch (err) {
                  alert("Não consegui usar essa imagem: " + err.message);
                }
              }}
            />
          </label>
          {m.logo && (
            <button
              className="btn sm ghost"
              type="button"
              onClick={() => setM({ ...m, logo: "" })}
            >
              Remover
            </button>
          )}
        </div>
        <div className="msg-erro" style={{ color: "var(--text-dim)" }}>
          Opcional. Sem logo, aparece a inicial do nome.
        </div>
      </div>
    </Modal>
  );
}

function Detalhe({ marca, aoFechar, aoEditar, aoExcluir }) {
  const compartilhado = useCompartilhado();
  const podeFazer = usePode();
  const temQuadro = !!quadroDaMarca(compartilhado, marca.id);

  return (
    <Modal
      titulo={marca.nome}
      aoFechar={aoFechar}
      largo
      acoes={
        <>
          {podeFazer("marcas", "excluir") && (
            <button
              className="btn sm ghost danger"
              type="button"
              style={{ marginRight: "auto" }}
              onClick={aoExcluir}
            >
              Excluir marca
            </button>
          )}
          <button className="btn ghost" type="button" onClick={aoFechar}>
            Fechar
          </button>
          {podeFazer("marcas", "editar") && (
            <button className="btn primary" type="button" onClick={aoEditar}>
              Editar
            </button>
          )}
        </>
      }
    >
      <div className="marca-topo">
        <span className="marca-logo">
          {marca.logo ? <img src={marca.logo} alt="" /> : marca.nome[0]?.toUpperCase()}
        </span>
        <div>
          <div className="marca-nome">{marca.nome}</div>
          <div className="sub">{marca.nicho}</div>
        </div>
      </div>

      <div className="kv">
        <div className="k">Site</div>
        <div className="v">
          <a href={marca.site} target="_blank" rel="noopener">
            {marca.site}
          </a>
        </div>
      </div>
      <div className="kv">
        <div className="k">Resumo</div>
        <div className="v">{marca.resumo}</div>
      </div>
      <div className="kv">
        <div className="k">Quadro</div>
        <div className="v">
          {temQuadro ? "tem kanban próprio" : "ainda sem kanban"}
        </div>
      </div>
      <div className="kv">
        <div className="k">Cadastrada</div>
        <div className="v">
          {fmtData(marca.criadoEm)}
          {marca.criadoPor ? ` · por ${marca.criadoPor}` : ""}
        </div>
      </div>

      <div className="card-h" style={{ marginTop: 16 }}>
        <div className="t">Descrição completa</div>
      </div>
      <div className="note">{marca.descricao}</div>
    </Modal>
  );
}

export default function Marcas({ busca }) {
  const compartilhado = useCompartilhado();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [filtroNicho, setFiltroNicho] = useState("");

  const marcas = (compartilhado.marcas || [])
    .filter((m) => (filtroNicho ? m.nicho === filtroNicho : true))
    .filter((m) =>
      busca
        ? [m.nome, m.nicho, m.resumo, m.descricao, m.site]
            .join(" ")
            .toLowerCase()
            .includes(busca.toLowerCase())
        : true
    );

  const nichosEmUso = [...new Set((compartilhado.marcas || []).map((m) => m.nicho))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <>
      <AvisoAlcance>
        <b>Cadastro compartilhado.</b> Marca criada aqui vale para o time
        inteiro — é a mesma lista que alimenta os quadros por empresa.
      </AvisoAlcance>

      <div className="chips">
        <button
          className={"chip" + (!filtroNicho ? " on" : "")}
          type="button"
          onClick={() => setFiltroNicho("")}
        >
          Todos
        </button>
        {nichosEmUso.map((n) => (
          <button
            key={n}
            type="button"
            className={"chip" + (filtroNicho === n ? " on" : "")}
            onClick={() => setFiltroNicho(filtroNicho === n ? "" : n)}
          >
            {n} ({compartilhado.marcas.filter((m) => m.nicho === n).length})
          </button>
        ))}
        {pode("marcas", "criar") && (
          <button
            className="btn primary sm"
            type="button"
            style={{ marginLeft: "auto" }}
            onClick={() => setCriando(true)}
          >
            ＋ Nova marca
          </button>
        )}
      </div>

      {!marcas.length ? (
        <div className="empty">
          {busca || filtroNicho
            ? "Nenhuma marca com esse filtro."
            : "Nenhuma marca cadastrada. Comece pelas que o time já atende."}
        </div>
      ) : (
        <div className="grid g-cards">
          {marcas.map((m) => (
            <button
              key={m.id}
              type="button"
              className="card marca-card"
              onClick={() => setAberta(m)}
            >
              <div className="marca-topo">
                <span className="marca-logo">
                  {m.logo ? <img src={m.logo} alt="" /> : m.nome[0]?.toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="marca-nome">{m.nome}</div>
                  <div className="sub">{m.nicho}</div>
                </div>
              </div>
              <div className="marca-resumo">{m.resumo}</div>
            </button>
          ))}
        </div>
      )}

      {criando && <FormMarca aoFechar={() => setCriando(false)} />}
      {editando && <FormMarca inicial={editando} aoFechar={() => setEditando(null)} />}

      {aberta && !editando && (
        <Detalhe
          marca={aberta}
          aoFechar={() => setAberta(null)}
          aoEditar={() => {
            setEditando(aberta);
            setAberta(null);
          }}
          aoExcluir={() => {
            setExcluindo(aberta);
            setAberta(null);
          }}
        />
      )}

      {excluindo && (
        <Confirmar
          mensagem={`Excluir a marca “${excluindo.nome}”? O quadro dela, se existir, some junto. Isso não tem volta.`}
          aoConfirmar={() => excluirMarca(excluindo.id)}
          aoFechar={() => setExcluindo(null)}
        />
      )}
    </>
  );
}
