import { useEffect, useMemo, useRef, useState } from "react";
import { normaliza } from "../lib/compartilhado.js";

/* Campo de busca que abre a lista de marcas filtrada enquanto se digita.
   Substitui um <select> de 272 opções, em que achar a marca era rolar.

   A busca ignora acento e caixa ("sao judas" acha "SÃO JUDAS") e casa
   em qualquer ponto do nome, não só no começo ("kibon" e "bon" acham a
   mesma). Nicho também entra, para "cerveja" listar as cervejarias. */
const MAX = 40;

export default function EscolheMarca({ marcas, valor, aoEscolher, nomeResponsavel }) {
  const atual = marcas.find((m) => m.id === valor) || null;
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const caixa = useRef(null);
  const campo = useRef(null);

  const lista = useMemo(() => {
    const t = normaliza(texto);
    const filtradas = !t
      ? marcas
      : marcas.filter((m) => normaliza(m.nome + " " + (m.nicho || "")).includes(t));
    /* Quem começa com o que foi digitado vem antes de quem só contém:
       digitando "petr", Petra aparece antes de Grupo Petrópolis. */
    return filtradas
      .slice()
      .sort((a, b) => {
        const ia = normaliza(a.nome).startsWith(t) ? 0 : 1;
        const ib = normaliza(b.nome).startsWith(t) ? 0 : 1;
        return ia - ib || a.nome.localeCompare(b.nome, "pt-BR");
      })
      .slice(0, MAX);
  }, [marcas, texto]);

  useEffect(() => setFoco(0), [texto]);

  /* Clicar fora fecha. Sem isso a lista ficaria aberta por cima do
     quadro depois de escolher. */
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (caixa.current && !caixa.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  function escolher(m) {
    aoEscolher(m ? m.id : "");
    setTexto("");
    setAberto(false);
    campo.current?.blur();
  }

  function teclas(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setFoco((f) => Math.min(f + 1, lista.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFoco((f) => Math.max(f - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (lista[foco]) escolher(lista[foco]);
    } else if (e.key === "Escape") {
      setAberto(false);
      setTexto("");
      campo.current?.blur();
    }
  }

  return (
    <div className="escolhe-marca" ref={caixa}>
      <input
        ref={campo}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-autocomplete="list"
        value={aberto ? texto : atual ? atual.nome : texto}
        placeholder={atual ? atual.nome : "Digite o nome da marca…"}
        onFocus={() => {
          setAberto(true);
          setTexto("");
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
        }}
        onKeyDown={teclas}
      />
      {aberto && (
        <ul className="em-lista" role="listbox">
          {!lista.length ? (
            <li className="em-vazio">Nenhuma marca com “{texto}”.</li>
          ) : (
            lista.map((m, i) => (
              <li
                key={m.id}
                role="option"
                aria-selected={i === foco}
                className={"em-item" + (i === foco ? " foco" : "") + (m.id === valor ? " atual" : "")}
                onPointerDown={(e) => {
                  e.preventDefault();
                  escolher(m);
                }}
                onMouseEnter={() => setFoco(i)}
              >
                <span className="em-nome">{m.nome}</span>
                <span className="em-meta">
                  {m.nicho}
                  {m.responsavel && nomeResponsavel ? " · " + nomeResponsavel(m.responsavel) : ""}
                </span>
              </li>
            ))
          )}
          {lista.length === MAX && (
            <li className="em-vazio">Mostrando as primeiras {MAX}. Digite mais para filtrar.</li>
          )}
        </ul>
      )}
    </div>
  );
}
