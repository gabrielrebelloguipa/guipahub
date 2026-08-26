/* O alcance real do que está na tela, dito em voz alta.

   Enquanto o Supabase não estiver configurado, "compartilhado" é uma
   promessa que o app não cumpre: o dado fica no navegador de quem
   cadastrou. Sem este aviso, alguém cadastraria trinta marcas achando
   que o time está vendo — e o trabalho evaporaria na primeira limpeza
   de cache. Quando o banco entra, o aviso some sozinho. */
import { useCompartilhado } from "../lib/compartilhado.js";

export default function AvisoAlcance({ children }) {
  const { remoto, carregando, erro } = useCompartilhado();

  if (erro)
    return (
      <div className="banner" style={{ borderColor: "var(--danger)" }}>
        <b>O banco recusou a operação. </b>
        {erro}
      </div>
    );

  if (remoto && carregando)
    return <div className="banner">Carregando os dados do time…</div>;

  if (remoto) return null;

  return (
    <div className="banner">
      {children}{" "}
      <b>Ainda não está ligado ao servidor</b>, então por enquanto isto fica
      só neste navegador e o time não vê.
    </div>
  );
}
