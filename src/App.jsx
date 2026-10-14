import { useEffect, useState } from "react";
import Sidebar from "./componentes/Sidebar.jsx";
import Topbar from "./componentes/Topbar.jsx";
import Login from "./componentes/Login.jsx";
import Hoje from "./abas/Hoje.jsx";
import Kanban from "./abas/Kanban.jsx";
import Central from "./abas/Central.jsx";
import Marcas from "./abas/Marcas.jsx";
import Imagens from "./abas/Clientes.jsx";
import Prompts from "./abas/Prompts.jsx";
import Configuracoes from "./abas/Configuracoes.jsx";
import { useAuth } from "./lib/useAuth.js";
import { restaurarSessao, pedirToken, temSessao } from "./lib/auth.js";
import { verificarAcesso } from "./lib/drive.js";
import { iniciar as iniciarCompartilhado } from "./lib/compartilhado.js";
import {
  carregar as carregarPermissoes,
  ouvir as ouvirPermissoes,
  usePermissoes,
  abasDe,
} from "./lib/permissoes.js";
import { definirRaiz } from "./lib/drive.js";
import { DIAS, MESES } from "./lib/constantes.js";

const TITULOS = {
  hoje: ["Bom trabalho", ""],
  demandas: ["Kanban", "Arraste os cartões entre as colunas"],
  central: ["Central Guipa", "Material oficial da GUIPA"],
  marcas: ["Marcas", "Cadastro compartilhado — alimenta os quadros por empresa"],
  clientes: ["Imagens", "O acervo de imagens dos clientes, direto do Drive"],
  prompts: ["Prompts", "Os prompts que você reusa, prontos pra copiar"],
  config: ["Configurações", "Permissões do time e de onde vem o acervo"],
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

  /* Carrega os dados compartilhados uma vez, depois de ter sessao —
     sem sessao o banco recusa tudo, entao pedir antes seria uma ida
     garantida a lugar nenhum. */
  useEffect(() => {
    if (!auth.perfil) return;
    iniciarCompartilhado();
    carregarPermissoes(auth.perfil.email);
    ouvirPermissoes(auth.perfil.email);
  }, [auth.perfil?.email]);

  /* A verificação de acesso ao Drive mora aqui, e não dentro do auth,
     porque auth não deve conhecer o Drive — senão os dois se importam em
     círculo. Quem entrou é o gatilho; o e-mail na dependência garante que
     trocar de conta refaz a pergunta. */
  useEffect(() => {
    if (auth.perfil) verificarAcesso();
  }, [auth.perfil?.email]);

  /* A raiz do Drive vive no banco; o drive.js nao conhece o banco. O App,
     que conhece os dois, faz a ponte sempre que a configuracao muda. */
  const { drive: confDrive } = usePermissoes();
  useEffect(() => {
    definirRaiz(confDrive);
    /* Quem dispara a indexacao e a aba Imagens, e so depois de ja ter
       desenhado as pastas. Fazer isso aqui, no login, punia quem nem ia
       usar a aba: 30 chamadas competindo com o carregamento da tela. */
  }, [confDrive.raizId, confDrive.raizNome]);

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
            {secao === "marcas" && <Marcas busca={busca} />}
            {secao === "clientes" && <Imagens busca={busca} />}
            {secao === "prompts" && <Prompts busca={busca} />}
            {secao === "config" && <Configuracoes />}
          </div>
        </div>
      </div>
    </div>
  );
}
