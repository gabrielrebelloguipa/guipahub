import { DOMINIO_OK } from "../config.js";
import { useAuth } from "../lib/useAuth.js";
import { pedirToken } from "../lib/auth.js";
import simbolo from "../assets/simbolo-guipa.png";

/* Um botão. Só isso.

   Quem entra aqui é gente do comercial e do design abrindo o site pela
   primeira vez — não pode existir nada para configurar, colar ou decidir.
   O Client ID e a chave do banco vivem no código, já preenchidos por quem
   publicou; a pessoa clica, escolhe a conta da GUIPA e está dentro.

   A versão anterior tinha uma tela pedindo o Client ID. Fazia sentido
   enquanto era protótipo de uma pessoa só, e virou um erro no instante em
   que o site passou a ser do time. */
export default function Login() {
  const auth = useAuth();

  return (
    <div id="loginRoot">
      <div className="login-card">
        <div className="login-marca">
          <img className="mark" src={simbolo} alt="GUIPA" />
          <div className="login-nome">GuipaHub</div>
        </div>

        <div className="login-sub">
          Conta @{DOMINIO_OK}
        </div>

        <button
          className="btn primary bloco"
          type="button"
          disabled={auth.entrando}
          onClick={() => pedirToken(false, null)}
        >
          {auth.entrando ? "abrindo o Google…" : "Entrar com Google"}
        </button>

        {auth.erro && <div className="login-erro">{auth.erro}</div>}
      </div>
    </div>
  );
}
