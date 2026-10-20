import { useEffect, useState } from "react";
import {
  historicoDoCartao,
  historicoDoQuadro,
  ouvirHistorico,
  comentar,
  editarComentario,
  excluirComentario,
} from "../lib/compartilhado.js";
import { usePermissoes } from "../lib/permissoes.js";

/* Data e hora no jeito que se fala: "hoje 14:32", "ontem 09:10",
   "12/10 16:45". Histórico é lido para responder "quando foi isso?", e
   a resposta útil quase sempre é relativa. */
function quando(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje)) return "hoje " + hora;
  if (mesmoDia(d, ontem)) return "ontem " + hora;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + hora;
}

/* Uma frase por acontecimento, com o nome de quem fez sempre primeiro:
   é a pergunta que o histórico existe para responder. */
function Frase({ e, comTitulo }) {
  const quem = <b>{e.autorNome || "Alguém"}</b>;
  const doCartao = comTitulo ? <> em <i>“{e.titulo}”</i></> : null;
  switch (e.tipo) {
    case "criou":
      return <>{quem} criou{comTitulo ? <> <i>“{e.titulo}”</i></> : " o cartão"}{e.para ? <> em <b>{e.para}</b></> : null}</>;
    case "moveu":
      return <>{quem} moveu{comTitulo ? <> <i>“{e.titulo}”</i></> : null} de <b>{e.de || "?"}</b> para <b>{e.para || "?"}</b></>;
    case "editou":
      return <>{quem} editou {e.texto || "o cartão"}{doCartao}</>;
    case "comentou":
      return <>{quem} comentou{doCartao}</>;
    case "excluiu":
      return <>{quem} excluiu <i>“{e.titulo}”</i></>;
    default:
      return <>{quem} mexeu{doCartao}</>;
  }
}

const ICONE = { criou: "＋", moveu: "→", editou: "✎", comentou: "❝", excluiu: "✕" };

/* Comentário pode ser editado e excluído por quem escreveu; admin
   exclui qualquer um, mas não edita a fala de outra pessoa. Toda versão
   fica na auditoria (Configurações), que só admin lê — então aqui não há
   "tem certeza?" pesando a mão: apagar não some com nada de verdade. */
function Linha({ e, comTitulo, meuEmail, souAdmin, aoMudar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(e.texto);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const ehComentario = e.tipo === "comentou";
  const meu = ehComentario && meuEmail && e.autor?.toLowerCase() === meuEmail.toLowerCase();
  const podeEditar = meu;
  const podeExcluir = ehComentario && (meu || souAdmin);

  async function salvar() {
    if (texto.trim() === e.texto) return setEditando(false);
    setOcupado(true);
    const r = await editarComentario(e.id, texto);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    setEditando(false);
    setErro("");
    aoMudar && aoMudar();
  }

  async function excluir() {
    setOcupado(true);
    const r = await excluirComentario(e.id);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    aoMudar && aoMudar();
  }

  return (
    <li className={"hist-item hist-" + e.tipo}>
      <span className="hist-ico">{ICONE[e.tipo] || "•"}</span>
      <div className="hist-corpo">
        <div className="hist-frase">
          <Frase e={e} comTitulo={comTitulo} />
        </div>
        {ehComentario &&
          (editando ? (
            <div className="hist-novo" style={{ marginTop: 4, marginBottom: 0 }}>
              <textarea
                value={texto}
                autoFocus
                onChange={(ev) => setTexto(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) salvar();
                  if (ev.key === "Escape") { setTexto(e.texto); setEditando(false); }
                }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="btn sm ghost" type="button" onClick={() => { setTexto(e.texto); setEditando(false); }}>
                  Cancelar
                </button>
                <button className="btn sm primary" type="button" disabled={ocupado || !texto.trim()} onClick={salvar}>
                  {ocupado ? "salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          ) : (
            <div className="hist-comentario">{e.texto}</div>
          ))}
        <div className="hist-quando">
          {quando(e.em)}
          {e.editadoEm && <span title={"editado " + quando(e.editadoEm)}> · editado</span>}
          {!editando && podeEditar && (
            <button className="hist-acao" type="button" onClick={() => setEditando(true)}>
              Editar
            </button>
          )}
          {!editando && podeExcluir && (
            <button className="hist-acao perigo" type="button" disabled={ocupado} onClick={excluir}>
              Excluir
            </button>
          )}
        </div>
        {erro && <div className="msg-erro">{erro}</div>}
      </div>
    </li>
  );
}

/* ---------- histórico de um cartão, com caixa de comentário ---------- */

export function HistoricoCartao({ quadroId, cartao, podeComentar, perfil }) {
  const { eu } = usePermissoes();
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const ler = () =>
      historicoDoCartao(cartao.id).then((r) => {
        if (!vivo) return;
        if (r.ok) setEventos(r.eventos);
        else setErro(r.erro);
      });
    ler();
    /* Comentário ou movimento de outra pessoa aparece aqui sem
       recarregar. Só relê se o evento for deste cartão. */
    const sair = ouvirHistorico((linha) => {
      if (!linha || linha.cartao_id === cartao.id) ler();
    });
    return () => {
      vivo = false;
      sair();
    };
  }, [cartao.id]);

  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setErro("");
    const r = await comentar(quadroId, cartao, texto, perfil);
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setTexto("");
    const h = await historicoDoCartao(cartao.id);
    if (h.ok) setEventos(h.eventos);
  }

  return (
    <div className="hist">
      <div className="hist-titulo">Histórico</div>

      {podeComentar && (
        <div className="hist-novo">
          <textarea
            value={texto}
            placeholder="Escreva um comentário…  (Ctrl+Enter envia)"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar();
            }}
          />
          <button
            className="btn sm primary"
            type="button"
            disabled={!texto.trim() || enviando}
            onClick={enviar}
          >
            {enviando ? "enviando…" : "Comentar"}
          </button>
        </div>
      )}

      {erro && <div className="banner" style={{ borderColor: "var(--danger)" }}>{erro}</div>}

      {eventos === null ? (
        <div className="empty">Lendo o histórico…</div>
      ) : !eventos.length ? (
        <div className="empty">
          Nada registrado ainda. Cartões criados antes do histórico existir
          começam a contar a partir da próxima mudança.
        </div>
      ) : (
        /* Mais recente em cima: quem abre o cartão quer saber o que
           aconteceu por último, não reler desde o começo. */
        <ul className="hist-lista">
          {[...eventos].reverse().map((e) => (
            <Linha
              key={e.id}
              e={e}
              meuEmail={perfil?.email}
              souAdmin={!!eu?.admin}
              aoMudar={() => historicoDoCartao(cartao.id).then((h) => h.ok && setEventos(h.eventos))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- histórico do quadro inteiro ---------- */

/* Inclui cartões já excluídos, que só existem mais aqui. É o "quem fez
   o quê nesse cliente" sem precisar abrir cartão por cartão. */
export function HistoricoQuadro({ quadroId }) {
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    const ler = () =>
      historicoDoQuadro(quadroId).then((r) => {
        if (!vivo) return;
        if (r.ok) setEventos(r.eventos);
        else setErro(r.erro);
      });
    ler();
    const sair = ouvirHistorico((linha) => {
      if (!linha || linha.quadro_id === quadroId) ler();
    });
    return () => {
      vivo = false;
      sair();
    };
  }, [quadroId]);

  if (erro) return <div className="banner" style={{ borderColor: "var(--danger)" }}>{erro}</div>;
  if (eventos === null) return <div className="empty">Lendo o histórico…</div>;
  if (!eventos.length)
    return <div className="empty">Nenhuma movimentação neste quadro ainda.</div>;

  return (
    <ul className="hist-lista">
      {eventos.map((e) => (
        <Linha key={e.id} e={e} comTitulo />
      ))}
    </ul>
  );
}
