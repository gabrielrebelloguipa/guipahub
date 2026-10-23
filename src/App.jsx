import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import Sidebar from "./componentes/Sidebar.jsx";
import Topbar from "./componentes/Topbar.jsx";
import Login from "./componentes/Login.jsx";
/* Cada aba é baixada quando é aberta pela primeira vez, não todas na
   entrada: a primeira tela chega mais rápido. */
const Hoje = lazy(() => import("./abas/Hoje.jsx"));
const Kanban = lazy(() => import("./abas/Kanban.jsx"));
const Central = lazy(() => import("./abas/Central.jsx"));
const Marcas = lazy(() => import("./abas/Marcas.jsx"));
const Imagens = lazy(() => import("./abas/Clientes.jsx"));
const Prompts = lazy(() => import("./abas/Prompts.jsx"));
const Configuracoes = lazy(() => import("./abas/Configuracoes.jsx"));
const Calculadora = lazy(() => import("./abas/Calculadora.jsx"));
import { useAuth } from "./lib/useAuth.js";
import { useMenu } from "./lib/menu.js";
import { restaurarSessao } from "./lib/auth.js";
import { iniciar as iniciarCompartilhado } from "./lib/compartilhado.js";
import { iniciarCentral } from "./lib/central.js";
import { iniciarPrompts, migrarLocais } from "./lib/prompts.js";
import { pegarEstado, alterar, usarConta } from "./lib/estado.js";
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
  demandas: ["Kanban", ""],
  central: ["Central Guipa", ""],
  marcas: ["Marcas", ""],
  clientes: ["Imagens", ""],
  prompts: ["Prompts", ""],
  config: ["Configurações", ""],
  calculadora: ["Calculadora comercial", ""],
};

/* Fora do componente: o StrictMode roda o efeito duas vezes, e subir os
   mesmos prompts duas vezes duplicaria tudo. */
let migrandoPrompts = false;
const ABA_KEY = "guipahub_aba";

export default function App() {
  const auth = useAuth();
  /* Sem escolha ainda, abre no primeiro item do menu da pessoa: quem pôs
     a Calculadora no topo cai direto nela. */
  const [escolhida, setEscolhida] = useState(() => {
    try {
      return sessionStorage.getItem(ABA_KEY) || null;
    } catch {
      return null;
    }
  });
  /* A aba aberta é lembrada nesta janela: quando a página recarrega (ou
     vai ao Google renovar o Drive e volta), a pessoa continua onde estava. */
  function setSecao(aba) {
    setEscolhida(aba);
    try {
      sessionStorage.setItem(ABA_KEY, aba);
    } catch {
      /* sem sessionStorage: só não lembra */
    }
  }
  const menu = useMenu();
  /* Aba lembrada só vale se a pessoa ainda pode ver essa aba. */
  const secao =
    (escolhida && menu.todas.some((a) => a.key === escolhida) ? escolhida : null) ??
    menu.todas[0]?.key ??
    "hoje";
  const [busca, setBusca] = useState("");

  useEffect(() => {
    restaurarSessao();
  }, []);

  /* O acesso ao Drive (que o Google dá por 1 hora) NÃO é renovado aqui.
     Renovar é uma ida ao Google e volta — o "piscar" — e só a aba Imagens
     precisa do Drive. Antes isso acontecia em toda abertura do app depois
     de uma hora, mesmo para quem nem ia abrir Imagens. Agora quem pede é
     a própria aba, quando é aberta (ver Clientes.jsx). O login do
     GuipaHub em si não depende disso e não expira. */

  /* Carrega os dados compartilhados uma vez, depois de ter sessao —
     sem sessao o banco recusa tudo, entao pedir antes seria uma ida
     garantida a lugar nenhum. */
  useEffect(() => {
    if (!auth.perfil) return;
    iniciarCompartilhado();
    iniciarCentral();
    iniciarPrompts();
    carregarPermissoes(auth.perfil.email);
    ouvirPermissoes(auth.perfil.email);
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

  /* Prompts que ainda estejam no navegador (versão antiga) sobem uma vez
     para o banco, como da pessoa logada, e saem do local. */
  /* O que fica no navegador é separado por conta: troca ao entrar e
     volta ao vazio ao sair. Antes de pintar, para ninguém ver nem por um
     instante o que é de quem usou o computador antes. */
  useLayoutEffect(() => {
    usarConta(auth.perfil?.email || "");
  }, [auth.perfil?.email]);

  useEffect(() => {
    const email = auth.perfil?.email;
    const locais = pegarEstado().prompts || [];
    if (!email || !locais.length || migrandoPrompts) return;
    migrandoPrompts = true;
    migrarLocais(locais, email).then((r) => {
      if (r.ok) alterar({ prompts: [] });
      migrandoPrompts = false;
    });
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
              {subtitulo && <div className="sub">{subtitulo}</div>}
            </div>
          </div>
          <div className="view" id="view">
            <Suspense fallback={<div className="empty">Carregando…</div>}>
            {secao === "hoje" && <Hoje aoIrPara={setSecao} />}
            {secao === "demandas" && <Kanban busca={busca} />}
            {secao === "central" && <Central busca={busca} />}
            {secao === "marcas" && <Marcas busca={busca} />}
            {secao === "clientes" && <Imagens busca={busca} />}
            {secao === "prompts" && <Prompts busca={busca} />}
            {secao === "config" && <Configuracoes />}
            {secao === "calculadora" && <Calculadora />}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
