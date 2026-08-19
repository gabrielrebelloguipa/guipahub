/* Preencher UMA VEZ antes de publicar. Ficando aqui, ninguém precisa
   configurar nada para usar: quem entra só faz login.

   clientId — console.cloud.google.com › APIs e Serviços › Credenciais ›
   ID do cliente OAuth › Aplicativo da Web, com a URL do site em "Origens
   JavaScript autorizadas". Para desenvolver, autorize http://localhost:5173.

   Não é segredo: Client ID é público por definição. Quem protege o acesso
   é a lista de origens autorizadas e a tela de consentimento tipo Interno.

   driveRaizId — opcional. Vazio, a busca acha qualquer pasta que a pessoa
   enxergue no Drive. Preenchido, só acha o que descer dessa pasta. O id
   está na URL da pasta no Drive, depois de /folders/. */
export const CONFIG = {
  clientId: "",
  driveRaizId: "",
};

export const DOMINIO_OK = "guipabrasil.com";
