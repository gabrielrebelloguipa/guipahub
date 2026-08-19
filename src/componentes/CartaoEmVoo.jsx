/* O cartão que segue o cursor durante o arraste.

   Fica fora do fluxo, em position:fixed, com a mesma inclinação e
   opacidade do app antigo — é justamente o efeito que o drag-and-drop
   nativo do HTML não permite, e a razão de o arraste ser próprio.

   Mora num .jsx separado do hook de propósito: useArrastar.js é lógica
   pura e continua importável por um teste sem React no meio. */
export default function CartaoEmVoo({ voando }) {
  if (!voando) return null;
  return (
    <div
      className="cartao"
      style={{
        position: "fixed",
        left: voando.x - voando.w / 2,
        top: voando.y - 20,
        width: voando.w,
        pointerEvents: "none",
        zIndex: 300,
        transform: "scale(0.9) rotate(10deg)",
        opacity: 0.8,
      }}
    >
      <div className="tx">{voando.texto}</div>
    </div>
  );
}
