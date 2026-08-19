import { useCallback, useRef, useState } from "react";

/* Arraste próprio, com eventos de ponteiro.

   Por que não o drag-and-drop nativo do HTML: o navegador tira um retrato
   do elemento no início do arraste e ignora transformações depois — não
   há como inclinar o cartão em voo. Com pointer events o cartão em voo é
   um elemento de verdade, que aceita rotação e opacidade.

   Um arraste só começa depois de 6px de movimento; abaixo disso é clique,
   e o cartão abre normalmente. Sem essa folga, todo clique viraria um
   arraste de 1px e o cartão nunca abriria. */

const FOLGA = 6;

export function useArrastar({ aoSoltar }) {
  const [voando, setVoando] = useState(null); /* { id, x, y, w, texto } */
  const [alvo, setAlvo] = useState(null); /* { colunaId, indice } */
  const ref = useRef({ ativo: false, id: null, x0: 0, y0: 0, largura: 0, texto: "" });
  /* O alvo também vive num ref, além do state. O state é para desenhar;
     o ref é para o `soltar` ler o destino sem depender de um updater —
     React roda updater DURANTE a renderização, e gravar no estado da
     aplicação lá dentro atualiza outro componente no meio do render. */
  const alvoRef = useRef(null);

  const mover = useCallback((ev) => {
    const st = ref.current;
    if (!st.id) return;

    if (!st.ativo) {
      const dist = Math.hypot(ev.clientX - st.x0, ev.clientY - st.y0);
      if (dist < FOLGA) return;
      st.ativo = true;
      setVoando({ id: st.id, x: ev.clientX, y: ev.clientY, w: st.largura, texto: st.texto });
    } else {
      setVoando((v) => (v ? { ...v, x: ev.clientX, y: ev.clientY } : v));
    }

    /* Onde isto vai cair: acha a coluna sob o cursor e, dentro dela,
       compara o cursor com o MEIO de cada cartão — igual ao Trello. É o
       que permite reordenar dentro da mesma coluna, não só trocar. */
    const colunas = document.querySelectorAll("[data-coluna]");
    let achou = null;
    for (const col of colunas) {
      const r = col.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right) {
        const cartoes = [...col.querySelectorAll("[data-cartao]")].filter(
          (c) => c.getAttribute("data-cartao") !== st.id
        );
        let indice = cartoes.length;
        for (let i = 0; i < cartoes.length; i++) {
          const rc = cartoes[i].getBoundingClientRect();
          if (ev.clientY < rc.top + rc.height / 2) {
            indice = i;
            break;
          }
        }
        achou = { colunaId: col.getAttribute("data-coluna"), indice };
        break;
      }
    }
    alvoRef.current = achou;
    setAlvo(achou);
  }, []);

  const soltar = useCallback(() => {
    const st = ref.current;
    const eraArraste = st.ativo;
    const destino = alvoRef.current;
    ref.current = { ativo: false, id: null, x0: 0, y0: 0, largura: 0, texto: "" };
    alvoRef.current = null;
    document.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerup", soltar);
    setVoando(null);
    setAlvo(null);
    if (eraArraste && destino && st.id) {
      aoSoltar(st.id, destino.colunaId, destino.indice);
    }
  }, [mover, aoSoltar]);

  const pegar = useCallback(
    (ev, id, texto) => {
      /* Botão dentro do cartão não inicia arraste — senão não daria para
         clicar em nada que viva dentro dele. */
      if (ev.target.closest("button") !== ev.currentTarget) return;
      if (ev.button !== 0) return;
      const r = ev.currentTarget.getBoundingClientRect();
      ref.current = {
        ativo: false,
        id,
        x0: ev.clientX,
        y0: ev.clientY,
        largura: r.width,
        texto,
      };
      document.addEventListener("pointermove", mover);
      document.addEventListener("pointerup", soltar);
    },
    [mover, soltar]
  );

  return { pegar, voando, alvo, arrastando: !!voando };
}
