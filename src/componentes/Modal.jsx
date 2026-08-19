import { useEffect } from "react";

/* Modal genérico. Esc fecha, clique no fundo fecha, clique dentro não.
   No app antigo o Esc era um listener global que precisava saber se havia
   modal aberto; aqui o efeito só existe enquanto o componente está
   montado, então o problema some junto com ele. */
export default function Modal({
  titulo,
  aoFechar,
  children,
  acoes,
  largo = false,
}) {
  useEffect(() => {
    function esc(ev) {
      if (ev.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);

  return (
    <div className="overlay" onClick={aoFechar}>
      <div
        className={"modal" + (largo ? " wide" : "")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-h">
          <div className="t">{titulo}</div>
          <button className="btn sm ghost x" type="button" onClick={aoFechar}>
            ✕
          </button>
        </div>
        {children}
        {acoes && <div className="modal-f">{acoes}</div>}
      </div>
    </div>
  );
}

/* Confirmação destrutiva. Existe como componente próprio porque o texto
   do aviso é sempre a parte que se esquece de escrever — aqui ele é
   obrigatório por assinatura. */
export function Confirmar({ mensagem, aoConfirmar, aoFechar, rotulo = "Excluir" }) {
  return (
    <Modal
      titulo="Confirmar"
      aoFechar={aoFechar}
      acoes={
        <>
          <button className="btn ghost" type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              aoConfirmar();
              aoFechar();
            }}
          >
            {rotulo}
          </button>
        </>
      }
    >
      <div className="note">{mensagem}</div>
    </Modal>
  );
}
