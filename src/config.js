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

  /* Supabase — Project Settings > API no painel do projeto.
     Enquanto estiverem vazios, os dados compartilhados (marcas,
     biblioteca de prompts, quadros por empresa) ficam no navegador de
     cada um e NAO sao compartilhados de verdade. A interface avisa.

     A anon key nao e segredo: ela vai dentro do JavaScript do site de
     proposito. Quem protege o banco sao as politicas de acesso criadas
     por supabase/schema.sql. */
  supabaseUrl: "",
  supabaseAnonKey: "",
};

export const DOMINIO_OK = "guipabrasil.com";
