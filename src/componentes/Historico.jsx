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
import { LISTA_CORES } from "../lib/constantes.js";

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

/* Cor fixa por pessoa, tirada do e-mail: o mesmo colega tem sempre a
   mesma cor de avatar, e dá para achar as falas dele de relance. */
function corDe(email) {
  let h = 0;
  for (const c of String(email || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return LISTA_CORES[h % LISTA_CORES.length];
}

function iniciais(nome) {
  const p = String(nome || "?").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function Avatar({ email, nome }) {
  return (
    <span className="coment-avatar" style={{ background: corDe(email) }}>
      {iniciais(nome)}
    </span>
  );
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

/* Linha da atividade: o que aconteceu com o cartão, sem caixa de texto.
   No histórico do quadro inteiro o comentário também vem por aqui, com o
   texto embaixo; dentro do cartão ele vira balão (Comentario). */
function Linha({ e, comTitulo }) {
  return (
    <li className={"hist-item hist-" + e.tipo}>
      <span className="hist-ico">{ICONE[e.tipo] || "•"}</span>
      <div className="hist-corpo">
        <div className="hist-frase">
          <Frase e={e} comTitulo={comTitulo} />
        </div>
        {comTitulo && e.tipo === "comentou" && <div className="hist-comentario">{e.texto}</div>}
        <div className="hist-quando">{quando(e.em)}</div>
      </div>
    </li>
  );
}

/* Um comentário em balão. Quem escreveu edita e exclui; admin exclui
   qualquer um, mas não edita a fala de outra pessoa. Toda versão fica na
   auditoria (Configurações), que só admin lê. Mesmo assim excluir pede
   um segundo clique: a auditoria guarda o texto, mas quem apagou sem
   querer não sabe disso. */
function Comentario({ e, meuEmail, souAdmin, aoMudar }) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState(e.texto);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const meu = !!meuEmail && e.autor?.toLowerCase() === meuEmail.toLowerCase();
  const podeExcluir = meu || souAdmin;

  async function salvar() {
    if (!texto.trim()) return;
    if (texto.trim() === e.texto) return setEditando(false);
    setOcupado(true);
    const r = await editarComentario(e.id, texto);
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    setEditando(false);
    setErro("");
    aoMudar();
  }

  async function excluir() {
    setOcupado(true);
    const r = await excluirComentario(e.id);
    setOcupado(false);
    if (!r.ok) {
      setConfirmando(false);
      return setErro(r.erro);
    }
    aoMudar();
  }

  function cancelar() {
    setTexto(e.texto);
    setEditando(false);
  }

  return (
    <li className={"coment" + (meu ? " meu" : "")}>
      <Avatar email={e.autor} nome={e.autorNome} />
      <div className="coment-corpo">
        <div className="coment-topo">
          <b>{meu ? "Você" : e.autorNome || "Alguém"}</b>
          <span className="coment-quando">
            {quando(e.em)}
            {e.editadoEm && <span title={"editado " + quando(e.editadoEm)}> · editado</span>}
          </span>
        </div>

        {editando ? (
          <div className="coment-edita">
            <textarea
              value={texto}
              autoFocus
              onChange={(ev) => setTexto(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  salvar();
                }
                if (ev.key === "Escape") {
                  ev.stopPropagation();
                  cancelar();
                }
              }}
            />
            <div className="coment-botoes">
              <button className="btn sm ghost" type="button" onClick={cancelar}>
                Cancelar
              </button>
              <button className="btn sm primary" type="button" disabled={ocupado || !texto.trim()} onClick={salvar}>
                {ocupado ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="coment-balao">{e.texto}</div>
        )}

        {!editando && (meu || podeExcluir) && (
          <div className="coment-acoes">
            {confirmando ? (
              <>
                <span className="coment-pergunta">Excluir este comentário?</span>
                <button className="coment-btn perigo cheio" type="button" disabled={ocupado} onClick={excluir}>
                  {ocupado ? "Excluindo…" : "Sim, excluir"}
                </button>
                <button className="coment-btn" type="button" onClick={() => setConfirmando(false)}>
                  Não
                </button>
              </>
            ) : (
              <>
                {meu && (
                  <button className="coment-btn" type="button" onClick={() => setEditando(true)}>
                    ✎ Editar
                  </button>
                )}
                {podeExcluir && (
                  <button className="coment-btn perigo" type="button" onClick={() => setConfirmando(true)}>
                    🗑 Excluir
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {erro && <div className="msg-erro">{erro}</div>}
      </div>
    </li>
  );
}

/* ---------- painel do cartão: comentários e atividade ---------- */

/* Uma linha do tempo só: comentário em balão, e entre eles o que
   aconteceu com o cartão (criou, moveu, editou) numa linha discreta. Lida
   de cima para baixo, conta a história inteira sem trocar de aba. */
export function PainelCartao({ quadroId, cartao, podeComentar, perfil }) {
  const { eu } = usePermissoes();
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function ler() {
    const r = await historicoDoCartao(cartao.id);
    if (r.ok) setEventos(r.eventos);
    else setErro(r.erro);
  }

  useEffect(() => {
    let vivo = true;
    const lerSeVivo = () =>
      historicoDoCartao(cartao.id).then((r) => {
        if (!vivo) return;
        if (r.ok) setEventos(r.eventos);
        else setErro(r.erro);
      });
    lerSeVivo();
    /* Comentário ou movimento de outra pessoa aparece aqui sem
       recarregar. Só relê se o evento for deste cartão. */
    const sair = ouvirHistorico((linha) => {
      if (!linha || linha.cartao_id === cartao.id) lerSeVivo();
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
    if (!r.ok) return setErro(r.erro);
    setTexto("");
    ler();
  }

  /* Mais recente em cima: quem abre o cartão quer saber o que aconteceu
     por último, não reler desde o começo. */
  const todos = eventos ? [...eventos].reverse() : [];
  const nComentarios = todos.filter((e) => e.tipo === "comentou").length;

  return (
    <div className="painel">
      <div className="tarefa-secao painel-titulo">
        Comentários e atividade
        {nComentarios > 0 && <span className="painel-n">{nComentarios}</span>}
      </div>

      {erro && <div className="banner" style={{ borderColor: "var(--danger)" }}>{erro}</div>}

      {podeComentar && (
        <div className="coment-novo">
          <Avatar email={perfil?.email} nome={perfil?.nome} />
          <div className="coment-novo-caixa">
            <textarea
              value={texto}
              placeholder="Escreva um comentário…"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
            />
            <div className="coment-novo-pe">
              <button
                className="btn sm primary"
                type="button"
                disabled={!texto.trim() || enviando}
                onClick={enviar}
              >
                {enviando ? "Enviando…" : "Comentar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {eventos === null ? (
        <div className="empty">Lendo…</div>
      ) : !todos.length ? (
        <div className="painel-vazio">
          Nada por aqui ainda.
          {podeComentar && " Escreva o primeiro comentário aí em cima."}
        </div>
      ) : (
        <ul className="coment-lista">
          {todos.map((e) =>
            e.tipo === "comentou" ? (
              <Comentario
                key={e.id + (e.editadoEm || "")}
                e={e}
                meuEmail={perfil?.email}
                souAdmin={!!eu?.admin}
                aoMudar={ler}
              />
            ) : (
              <Linha key={e.id} e={e} />
            )
          )}
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
