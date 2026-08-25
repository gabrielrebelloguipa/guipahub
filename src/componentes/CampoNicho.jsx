import { useMemo, useRef, useState } from "react";
import { normaliza } from "../lib/compartilhado.js";

/* Campo de nicho com sugestão.

   O objetivo não é limitar a escolha, é evitar que "Alimentação",
   "Alimentício" e "Alimentos" virem três nichos para a mesma coisa. Por
   isso: sugere enquanto digita, mas aceita qualquer texto novo no Enter.

   Não é um <datalist>. O datalist do navegador não deixa navegar com as
   setas de forma previsível, não mostra "criar novo" e some em alguns
   navegadores quando o campo já tem texto — exatamente quando a sugestão
   é mais útil. */
export default function CampoNicho({ valor, aoMudar, sugestoes, id }) {
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const caixa = useRef(null);

  const filtradas = useMemo(() => {
    const t = normaliza(valor);
    if (!t) return sugestoes.slice(0, 8);
    return sugestoes.filter((s) => normaliza(s).includes(t)).slice(0, 8);
  }, [valor, sugestoes]);

  /* "Já existe" compara sem acento e sem maiúscula: digitar "alimentacao"
     não deve oferecer criar um nicho novo se "Alimentação" já existe. */
  const jaExiste = sugestoes.some((s) => normaliza(s) === normaliza(valor));
  const podeCriar = !!valor.trim() && !jaExiste;

  function escolher(s) {
    aoMudar(s);
    setAberto(false);
  }

  function teclado(e) {
    if (!aberto && (e.key === "ArrowDown" || e.key === "Enter")) {
      setAberto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      /* Enter com algo destacado escolhe a sugestão; sem nada destacado,
         aceita o que foi digitado como nicho novo. */
      if (filtradas[destaque]) escolher(filtradas[destaque]);
      else setAberto(false);
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <div
      className="nicho-wrap"
      ref={caixa}
      onBlur={(e) => {
        /* Só fecha quando o foco sai da caixa inteira. Sem isso, clicar
           numa sugestão fecharia a lista antes do clique registrar. */
        if (!caixa.current?.contains(e.relatedTarget)) setAberto(false);
      }}
    >
      <input
        id={id}
        type="text"
        value={valor}
        placeholder="Comece a digitar — ex: aliment…"
        autoComplete="off"
        onChange={(e) => {
          aoMudar(e.target.value);
          setAberto(true);
          setDestaque(0);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={teclado}
      />

      {aberto && (filtradas.length > 0 || podeCriar) && (
        <div className="nicho-lista">
          {filtradas.map((s, i) => (
            <button
              key={s}
              type="button"
              className={"nicho-op" + (i === destaque ? " on" : "")}
              onMouseEnter={() => setDestaque(i)}
              onClick={() => escolher(s)}
            >
              {s}
            </button>
          ))}
          {podeCriar && (
            <button
              type="button"
              className="nicho-op novo"
              onClick={() => escolher(valor.trim())}
            >
              Criar nicho “{valor.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
