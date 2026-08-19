import { useState } from "react";
import { DOMINIO_OK } from "../config.js";
import { useAuth } from "../lib/useAuth.js";
import { pedirToken, definirClientId } from "../lib/auth.js";

export default function Login() {
  const auth = useAuth();
  const [rascunhoId, setRascunhoId] = useState(auth.clientId);
  const [trocando, setTrocando] = useState(false);

  const semClientId = !auth.clientId;
  const pedindoId = semClientId || trocando;

  return (
    <div id="loginRoot">
      <div className="login-card">
        <div className="login-marca">
          <div className="mark">G</div>
          <div className="login-nome">GuipaHub</div>
        </div>

        <div className="login-sub">
          Acesso interno da GUIPA. Entre com a sua conta @{DOMINIO_OK}.
        </div>

        {pedindoId ? (
          <>
            {semClientId && (
              <div className="banner">
                <b>Falta configurar o Client ID do Google.</b> Sem ele o botão de
                entrar não tem como falar com o Google. Crie um <i>OAuth client
                ID</i> do tipo <i>Aplicativo da Web</i> em console.cloud.google.com,
                autorize esta origem, e cole abaixo.
              </div>
            )}
            <div className="field">
              <label>Client ID</label>
              <input
                type="text"
                value={rascunhoId}
                placeholder="000000000-xxxx.apps.googleusercontent.com"
                onChange={(e) => setRascunhoId(e.target.value)}
              />
            </div>
            <button
              className="btn primary bloco"
              type="button"
              onClick={() => {
                definirClientId(rascunhoId);
                setTrocando(false);
              }}
            >
              Salvar e continuar
            </button>
          </>
        ) : (
          <>
            <button
              className="btn primary bloco"
              type="button"
              disabled={auth.entrando}
              onClick={() => pedirToken(false, null)}
            >
              {auth.entrando ? "abrindo o Google…" : "Entrar com Google"}
            </button>
            <button
              className="link"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => setTrocando(true)}
            >
              usar outro Client ID
            </button>
          </>
        )}

        {auth.erro && <div className="login-erro">{auth.erro}</div>}

        <div className="login-pe">
          O site lê o Drive com a sua própria conta — você vê exatamente as
          pastas que já vê no Drive, nem mais nem menos.
        </div>
      </div>
    </div>
  );
}
