# GuipaHub

Ferramenta interna da GUIPA. React + Vite.

## Rodar

```bash
npm install
```

```bash
npm run dev
```

E abrir `http://localhost:5173`. Salvar um arquivo recarrega a tela sozinho.

Tem que ser por servidor, não por duplo clique: `localhost` conta como origem segura pro Google, `file://` não.

## O que tem

| Aba | O que faz | Onde ficam os dados |
|---|---|---|
| **Hoje** | Tarefas por status, prazos vencendo, atalhos, prompts favoritos | Navegador de quem usa |
| **Kanban** | Quadro próprio, colunas editáveis, cartão arrastável | Navegador de quem usa |
| **Central Guipa** | Materiais · Imagens GUIPA · Guias e medidas · Cores do brandbook | Navegador de quem usa |
| **Clientes** | Busca o cliente e mostra imagens e vídeos **direto do Google Drive** | Google Drive |
| **Prompts** | Biblioteca de prompts, com categoria e "onde usar" | Navegador de quem usa |

**Atenção à diferença.** As quatro primeiras guardam dados no `localStorage`, **por navegador**: o que cada um cadastra não aparece pra mais ninguém. Só a aba **Clientes** é compartilhada de verdade, porque não guarda nada — lê o Drive na hora.

Se um dia o Kanban tiver que ser do time, aí sim entra backend (Supabase ou equivalente). Hoje, não precisa.

## Login

Entra quem tem conta **@guipabrasil.com**, pelo "Entrar com Google" da conta que a pessoa já usa no Gmail.

Fica logado entre visitas. O que é guardado é só o perfil (nome e e-mail) — **nunca o token**, que vale 1 hora e é pedido de novo em silêncio a cada abertura.

**A checagem de domínio é conveniência, não é a tranca.** Ela evita entrar com o Gmail pessoal por engano. A segurança de verdade é o Drive: o site lê os arquivos **com a conta de quem entrou**, então cada um vê exatamente as pastas que já veria no Drive. Não existe um segundo sistema de permissão pra manter.

Consequência prática: **se o comercial não enxergar a pasta no Drive, abre o site e vê vazio.** Compartilhar a pasta com o time é parte da instalação.

## Como o Drive precisa estar organizado

A profundidade não importa — `Setor > Subsetor > Cliente` funciona igual a uma pasta solta. A API acha uma pasta pelo nome numa consulta só.

Três regras de que o site depende:

1. **A pasta do cliente é o último nível com nome de cliente.** Dentro dela pode ter o que for.
2. **O nome da pasta é exatamente o nome do cliente** — `iFood`, não `iFood - 2026`. A lista de clientes sai dos nomes das pastas.
3. **O mesmo cliente não aparece em dois setores**, senão racha em dois resultados.

Limites da varredura: **1.500 arquivos** ou **200 pastas** por cliente. Batendo o teto, a tela avisa em vez de fingir que terminou.

## Instalação (uma vez)

### 1. Client ID do Google

1. [console.cloud.google.com](https://console.cloud.google.com) com a conta @guipabrasil.com
2. Criar um projeto (ou usar um da empresa)
3. **APIs e Serviços → Biblioteca** → ativar a **Google Drive API**
4. **Tela de permissão OAuth** → tipo **Interno** (só aparece se for Workspace — é o que trava o acesso no domínio do lado do Google)
5. **Credenciais → Criar credenciais → ID do cliente OAuth** → **Aplicativo da Web**
6. Em **Origens JavaScript autorizadas**: `http://localhost:5173` para desenvolver, e a URL final quando publicar
7. Copiar o Client ID

O Client ID **não é segredo** — é público por definição. Quem protege o acesso são as origens autorizadas e o tipo "Interno".

### 2. Colar em `src/config.js`

```js
export const CONFIG = {
  clientId: "cole-aqui.apps.googleusercontent.com",
  driveRaizId: "",
};
```

`driveRaizId` é opcional: vazio, a busca acha qualquer pasta que a pessoa enxergue; preenchido, só o que descer dela. O id está na URL da pasta, depois de `/folders/`.

Dá pra colar o Client ID pela tela de login também, mas aí **cada pessoa** teria que fazer isso. No arquivo é o certo pra publicar.

### 3. Publicar

```bash
npm run build
```

Sai a pasta `dist/`, que é HTML/CSS/JS estático. Vercel, Netlify e Cloudflare Pages fazem o build sozinhos a partir do repositório. Precisa ser `https://`.

### 4. Compartilhar a pasta no Drive

Dar leitura ao time (ou ao domínio) na pasta dos materiais de cliente.

## Como o código está organizado

```
src/
├── config.js          Client ID e pasta raiz — o que se edita antes de publicar
├── main.jsx           entrada, tema claro/escuro
├── App.jsx            shell e troca de abas
├── estilo.css         CSS herdado do app antigo (brandbook aplicado)
├── lib/
│   ├── auth.js        login Google — NÃO sabe o que é React
│   ├── drive.js       chamadas ao Drive — NÃO sabe o que é React
│   ├── estado.js      dados no localStorage, loja observável
│   ├── arquivos.js    binários no IndexedDB
│   ├── constantes.js  categorias, prioridades, datas
│   ├── useArrastar.js o arraste do kanban (lógica pura, sem JSX)
│   └── useAuth.js     ponte entre a loja de auth e o React
├── componentes/       Sidebar, Topbar, Login, Modal, CartaoEmVoo
└── abas/              Hoje, Kanban, Central, Clientes, Prompts
```

`auth.js` e `drive.js` são de propósito ignorantes de React: mantêm estado e avisam quem escuta (`useSyncExternalStore`). É a camada que menos deve mudar se a interface for reescrita de novo — e é testável sem montar componente nenhum.

Os dois **não se importam em círculo**: `drive` importa `auth`, nunca o contrário. A verificação de acesso ao Drive é disparada pelo `App`, que conhece os dois.

## Backup

O que mora no navegador (tarefas, prompts, materiais) some se limpar os dados do navegador. O que está na aba Clientes não precisa de backup: mora no Drive.

> ⚠ A exportação em JSON do app antigo ainda não foi portada. Enquanto isso, o que é cadastrado aqui não tem backup.

## Versão antiga

O arquivo único continua em `Desktop\GUIPA\GuipaHub\index.html`, funcionando. Os dados **não passam** de um para o outro: são chaves de `localStorage` diferentes, em origens diferentes.
