import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { useAuth } from "./useAuth.js";
import { usePermissoes } from "./permissoes.js";
import { useCompartilhado, meuQuadro, infoDaLista, REMOTO } from "./compartilhado.js";
import { diasAte, hojeChave } from "./constantes.js";

/* Notificações do sininho. Não são guardadas: são calculadas do que já
   existe, então nunca ficam desatualizadas nem duplicadas.

   · telefone: enquanto a pessoa não preencher em Meu perfil (sai na
     proposta da Calculadora);
   · prazo: cartão aberto (fora de coluna de concluído) que vence em até
     3 dias ou já venceu — do quadro pessoal e dos quadros de marca em que
     a pessoa está envolvida: cartões que ela criou e marcas da carteira
     dela. O quadro de marca do time inteiro avisaria todo mundo de tudo. */

const JANELA_DIAS = 3;

function maisDias(n) {
  const d = new Date(hojeChave() + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Cartões de marca com prazo próximo em que a pessoa está envolvida.
   Uma consulta só, filtrada pelo prazo no banco — não depende de o
   quadro estar aberto. */
async function prazosDeMarca(email, marcas, quadros) {
  if (!REMOTO || !email) return [];
  const { data, error } = await supabase
    .from("cartoes")
    .select("id, titulo, prazo, quadro_id, lista_id, criado_por")
    .not("prazo", "is", null)
    .lte("prazo", maisDias(JANELA_DIAS));
  if (error || !data?.length) return [];

  const quadroPorId = new Map(quadros.map((q) => [q.id, q]));
  const marcaPorId = new Map(marcas.map((m) => [m.id, m]));
  const eu = email.toLowerCase();
  const daMarca = data
    .map((c) => {
      const q = quadroPorId.get(c.quadro_id);
      const m = q?.marcaId ? marcaPorId.get(q.marcaId) : null;
      return m ? { c, m } : null;
    })
    .filter(Boolean)
    .filter(({ c, m }) =>
      (c.criado_por || "").toLowerCase() === eu || (m.responsavel || "").toLowerCase() === eu
    );
  if (!daMarca.length) return [];

  /* Coluna de concluído não avisa. */
  const ids = [...new Set(daMarca.map(({ c }) => c.lista_id))];
  const { data: listas } = await supabase.from("listas").select("id, concluida").in("id", ids);
  const concluida = new Set((listas || []).filter((l) => l.concluida).map((l) => l.id));

  return daMarca
    .filter(({ c }) => !concluida.has(c.lista_id))
    .map(({ c, m }) => ({
      id: "prazo:" + c.id + ":" + c.prazo,
      tipo: "prazo",
      titulo: c.titulo,
      onde: m.nome,
      prazo: c.prazo,
      dias: diasAte(c.prazo),
      destino: { aba: "demandas", kanbanModo: "empresas", kanbanMarcaId: m.id },
    }));
}

export function useNotificacoes() {
  const auth = useAuth();
  const email = auth.perfil?.email || "";
  const { eu } = usePermissoes();
  const comp = useCompartilhado();
  const [deMarca, setDeMarca] = useState([]);

  /* Relê ao entrar e a cada 10 minutos; e quando as marcas/quadros
     chegam (a carteira e o quadro de cada cartão vêm de lá). */
  const nMarcas = comp.marcas.length;
  const nQuadros = comp.quadros.length;
  useEffect(() => {
    if (!email || !nMarcas) return;
    let vivo = true;
    const ler = () =>
      prazosDeMarca(email, comp.marcas, comp.quadros).then((x) => vivo && setDeMarca(x));
    ler();
    const t = setInterval(ler, 10 * 60 * 1000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, nMarcas, nQuadros]);

  const itens = [];

  if (eu && !String(eu.telefone || "").trim()) {
    itens.push({
      id: "telefone",
      tipo: "perfil",
      titulo: "Preencha seu telefone",
      onde: "Ele sai na proposta da Calculadora",
      destino: { aba: "config" },
    });
  }

  const pessoal = meuQuadro(comp);
  for (const d of pessoal?.demandas || []) {
    const n = diasAte(d.prazo);
    if (n === null || n > JANELA_DIAS) continue;
    if (infoDaLista(pessoal, d.status).concluida) continue;
    itens.push({
      id: "prazo:" + d.id + ":" + d.prazo,
      tipo: "prazo",
      titulo: d.titulo,
      onde: "Seu quadro",
      prazo: d.prazo,
      dias: n,
      destino: { aba: "demandas", kanbanModo: "pessoal" },
    });
  }
  itens.push(...deMarca);

  /* Vencidos e mais urgentes primeiro; o aviso de perfil por último. */
  itens.sort((a, b) => (a.dias ?? 999) - (b.dias ?? 999));
  return itens;
}
