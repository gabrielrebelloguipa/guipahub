import { useEffect, useState } from "react";
import Sidebar from "./componentes/Sidebar.jsx";
import Topbar from "./componentes/Topbar.jsx";
import Login from "./componentes/Login.jsx";
import Hoje from "./abas/Hoje.jsx";
import Kanban from "./abas/Kanban.jsx";
import Central from "./abas/Central.jsx";
import Clientes from "./abas/Clientes.jsx";
import Prompts from "./abas/Prompts.jsx";
import { useAuth } from "./lib/useAuth.js";
import { restaurarSessao, pedirToken, temSessao } from "./lib/auth.js";
import { verificarAcesso } from "./lib/drive.js";
import { DIAS, MESES } from "./lib/constantes.js";

const TITULOS = {
  hoje: ["Bom trabalho", ""],
  demandas: ["Kanban", "Arraste os cartões entre as colunas"],
  central: ["Central Guipa", "Material oficial da GUIPA"],
  clientes: ["Clientes", "Busque o cliente e veja tudo que já foi feito para ele"],
  prompts: ["Prompts", "Os prompts que você reusa, prontos pra copiar"],
};

export default function App() {
  const auth = useAuth();
  const [secao, setSecao] = useState("hoje");
  const [busca, setBusca] = useState("");

  /* O perfil sobrevive ao fechar a aba; o token de acesso não (vale 1h).
     Por isso a volta é: restaura quem era e pede um token novo em
     silêncio. Se o consentimento ainda valer, ninguém vê popup — e o
     "deixar logado" acontece. Se não valer, cai na tela de login. */
  useEffect(() => {
    restaurarSessao();
    if (temSessao()) pedirToken(true, null);
  }, []);

  /* A verificação de acesso ao Drive mora aqui, e não dentro do auth,
     porque auth não deve conhecer o Drive — senão os dois se importam em
     círculo. Quem entrou é o gatilho; o e-mail na dependência garante que
     trocar de conta refaz a pergunta. */
  useEffect(() => {
    if (auth.perfil) verificarAcesso();
  }, [auth.perfil?.email]);

  if (!auth.perfil) return <Login />;

  const [titulo, sub] = TITULOS[secao] || ["GuipaHub", ""];
  const hoje = new Date();
  const ehHoje = secao === "hoje";
  const cabecalho = ehHoje && auth.perfil.nome
    ? `Bom trabalho, ${auth.perfil.nome.split(" ")[0]}`
    : titulo;
  const subtitulo = ehHoje
    ? `${DIAS[hoje.getDay()]}, ${hoje.getDate()} de ${MESES[hoje.getMonth()]}`
    : sub;

  return (
    <div className="shell">
      <Sidebar secao={secao} aoTrocar={setSecao} />
      <div className="col">
        <Topbar busca={busca} aoBuscar={setBusca} />
        <div className="main">
          <div className="head">
            <div id="hLeft">
              <h1 className="h1">{cabecalho}</h1>
              <div className="sub">{subtitulo}</div>
            </div>
          </div>
          <div className="view" id="view">
            {secao === "hoje" && <Hoje aoIrPara={setSecao} />}
            {secao === "demandas" && <Kanban busca={busca} />}
            {secao === "central" && <Central busca={busca} />}
            {secao === "clientes" && <Clientes busca={busca} />}
            {secao === "prompts" && <Prompts busca={busca} />}
          </div>
        </div>
      </div>
    </div>
  );
}
