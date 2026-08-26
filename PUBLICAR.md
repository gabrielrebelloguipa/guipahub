# Publicar o GuipaHub — passo a passo

Do computador até o time entrando com a conta @guipabrasil.com.

Feito com calma dá 40 minutos. Cada parte termina com um **✅ Confira antes de seguir** — se aquilo não estiver na tela, pare ali, porque o passo seguinte não vai funcionar.

---

## O mapa: o que se liga em quê

Antes dos cliques, entenda o desenho. São **três serviços** e uma corrente que passa por todos:

```
   SEU PC                    GITHUB                    RENDER
┌────────────┐           ┌────────────┐           ┌────────────┐
│ a pasta    │  git push │ cópia do   │ conectar  │ transforma │
│ GuipaHub-  │──────────▶│ código na  │──────────▶│ em site no │
│ react      │           │ nuvem      │  o repo   │ ar (https) │
└────────────┘           └────────────┘           └─────┬──────┘
      ▲                                                 │
      │                                                 │ dá uma URL
      │  colar o Client ID em src/config.js             ▼
      │                                        https://guipahub...
      │                                                 │
      │                                                 │ autorizar
      │                    GOOGLE CLOUD                 │ essa URL
      │                  ┌────────────┐                 │
      └──────────────────│ Client ID  │◀────────────────┘
         devolve a chave └────────────┘
```

**Por que nessa ordem:** o Google só emite a chave depois de saber em qual endereço o site vai morar. E o endereço só existe depois do Render publicar. E o Render só publica o que estiver no GitHub. Fazer fora de ordem trava.

### As contas

| Serviço | Precisa criar conta? | Com qual e-mail | Para quê |
|---|---|---|---|
| **Git** (no seu PC) | Não — é um programa | — | Guardar o histórico local |
| **GitHub** | **Sim, criar** | @guipabrasil.com | Guardar o código na nuvem |
| **Render** | Sim — mas **entrando com o GitHub**, não é conta separada | — | Transformar o código em site |
| **Google Cloud** | Não — usa sua conta Google que já existe | @guipabrasil.com | Emitir o Client ID do login |

> **Use o e-mail da GUIPA no GitHub.** É código da empresa. Se um dia outra pessoa assumir, a conta não fica presa no seu e-mail pessoal.

---

## Parte 0 — O que já está pronto

Nada a fazer aqui, é só pra você saber onde está pisando.

Dentro de `Desktop\GUIPA\GuipaHub-react` já existe um repositório Git **local** com 2 commits. "Local" quer dizer: o histórico está numa pasta escondida no seu PC, e **ninguém mais no mundo tem acesso**. Não precisou de conta nenhuma pra isso.

O que falta é a cópia na nuvem. É a Parte 2.

---

## Parte 1 — Criar a conta no GitHub

**Se você já tem uma conta com o e-mail da GUIPA, pule para a Parte 2.**

**1.1** Abrir [github.com/signup](https://github.com/signup)

**1.2** Preencher:
- **Email:** o seu **@guipabrasil.com**
- **Password:** uma senha forte — guarde no gerenciador de senhas, você vai precisar
- **Username:** algo como `gabriel-guipa` ou `guipabrasil`. Fica público e aparece na URL do repositório, então escolha algo que não te constranja daqui a dois anos

**1.3** O GitHub manda um código de 8 dígitos no e-mail. Colar.

**1.4** Se perguntar plano, escolher **Free**. Repositório privado é gratuito e ilimitado.

**✅ Confira antes de seguir:** você consegue abrir [github.com](https://github.com) e vê seu avatar no canto superior direito.

---

## Parte 2 — Subir o código pro GitHub

### 2a. Ajustar quem assina os commits

O Git local está configurado com `gabrieldelpi@gmail.com` (peguei do seu ambiente). Se o repositório vai viver na conta da GUIPA, os commits devem ser assinados com o e-mail da GUIPA.

No terminal, dentro de `Desktop\GUIPA\GuipaHub-react`:

```bash
git config user.email "seu-email@guipabrasil.com"
```

Isso vale só para os **próximos** commits. Os 2 que já existem ficam com o e-mail antigo — não é problema, é só histórico.

### 2b. Criar o repositório vazio

**2.1** Abrir [github.com/new](https://github.com/new)

**2.2** Preencher **exatamente** assim:

| Campo | O que pôr |
|---|---|
| **Repository name** | `guipahub` |
| **Description** | pode deixar vazio |
| **Public / Private** | **Private** ⚠️ |
| **Add a README file** | **desmarcado** |
| **Add .gitignore** | **None** |
| **Choose a license** | **None** |

> **Por que desmarcar os três últimos:** eles criam arquivos no repositório da nuvem. Como o seu repositório local já tem arquivos e histórico próprio, os dois passam a ter históricos diferentes — e o `push` é recusado com um erro confuso sobre "unrelated histories". Deixando vazio, o seu código entra limpo.

**2.3** Clicar em **Create repository**

**2.4** A tela seguinte mostra comandos e uma URL assim:

```
https://github.com/SEU-USUARIO/guipahub.git
```

**Copie essa URL.** É o que liga a pasta do seu PC ao GitHub.

### 2c. Ligar e enviar

No terminal, dentro de `Desktop\GUIPA\GuipaHub-react`. Trocar `SEU-USUARIO` pelo seu:

```bash
git remote add origin https://github.com/SEU-USUARIO/guipahub.git
```

Esse comando não devolve nada. É normal — ele só anota o endereço.

```bash
git branch -M main
```

```bash
git push -u origin main
```

**Aqui vai pedir autenticação.** No Windows, o mais comum é abrir uma janela do navegador pedindo pra autorizar — é só clicar em autorizar e pronto.

*Se em vez disso pedir usuário e senha no terminal:* a senha **não é a senha da conta** (o GitHub não aceita mais isso). É um token:
1. [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token** → **classic**
2. **Note:** `guipahub` · **Expiration:** 90 days · marcar a caixa **`repo`**
3. **Generate token**, copiar (só aparece uma vez!) e colar no lugar da senha

**✅ Confira antes de seguir:** recarregue a página do repositório no GitHub. Você deve ver as pastas `src`, `public`, e os arquivos `package.json`, `LEIA-ME.md`. Se a página ainda diz "Quick setup", o push não chegou.

### 2d. Daqui pra frente

Toda vez que quiser salvar o trabalho:

```bash
git add -A && git commit -m "descreva o que mudou" && git push
```

---

## Parte 3 — Render: pôr o site no ar

**3.1** Abrir [dashboard.render.com/register](https://dashboard.render.com/register)

**3.2** Escolher **GitHub** como forma de entrar — **não** crie uma conta com e-mail e senha. Entrando pelo GitHub, o Render já nasce com permissão de ler seus repositórios, que é justamente o que ele precisa.

**3.3** O GitHub vai pedir autorização. Aceitar. Se perguntar **quais repositórios** o Render pode ver, escolher `guipahub` (ou "All repositories", tanto faz).

**3.4** No painel do Render: botão **New +** (canto superior direito) → **Static Site**

> É aqui que "estático" aparece. Não quer dizer que o site é parado: quer dizer que o Render só **entrega arquivos**, sem rodar código do lado dele. É exatamente o que um site React precisa — o React roda no navegador de quem abre.

**3.5** Aparece a lista dos seus repositórios. Ao lado de `guipahub`, clicar em **Connect**.

**3.6** Preencher. **Os dois do meio são os que erram sozinhos:**

| Campo | Valor |
|---|---|
| **Name** | `guipahub` |
| **Branch** | `main` |
| **Root Directory** | *deixar vazio* |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

**3.7** **Create Static Site**. O primeiro build leva 1 a 3 minutos. Dá pra acompanhar o log rolando na tela.

**3.8** Quando aparecer **Live** com um ✓ verde, no topo da página tem a URL:

```
https://guipahub.onrender.com
```

**Copie e guarde. É a peça que a Parte 4 precisa.**

**✅ Confira antes de seguir:** abra essa URL. O site tem que carregar mostrando a tela **"Falta configurar o Client ID do Google"**. Ver essa mensagem é sucesso — significa que o React subiu e rodou. Se der página em branco ou erro 404, pare e me chame.

---

## Parte 4 — Google Cloud: o Client ID

Esta é a parte que faz o login existir. É a mais longa, mas é toda clicar e avançar.

**4.1** Abrir [console.cloud.google.com](https://console.cloud.google.com) — **confira no canto superior direito que você está com a conta @guipabrasil.com**, não a pessoal. Se estiver errada, troque antes de continuar.

### 4a. Criar o projeto

**4.2** No topo, ao lado do logo "Google Cloud", tem um seletor de projeto. Clicar → **Novo projeto**

**4.3** Nome: `GuipaHub`. Deixar "Organização" como vier. → **Criar**

**4.4** Esperar uns 15 segundos e **selecionar o projeto GuipaHub** no seletor. É fácil esquecer disso e configurar tudo no projeto errado.

### 4b. Ligar a API do Drive

**4.5** Menu ☰ → **APIs e serviços** → **Biblioteca**

**4.6** Buscar `Google Drive API` → clicar no resultado → **Ativar**

**✅ Confira:** o botão vira "Gerenciar". Se ainda diz "Ativar", não pegou.

### 4c. Tela de permissão

É o que a pessoa vê quando clica em "Entrar com Google".

**4.7** Menu ☰ → **APIs e serviços** → **Tela de permissão OAuth**

**4.8** **Tipo de usuário: Interno** → **Criar**

> ⚠️ **Este é o ponto mais importante do guia inteiro.** "Interno" faz o Google recusar qualquer conta que não seja @guipabrasil.com — não importa o que o site faça. **Essa é a tranca de verdade.** A checagem de domínio que escrevi no código é conveniência, pra dar uma mensagem clara; a trava é aqui.
>
> **Se "Interno" estiver cinza/desabilitado**, o domínio guipabrasil.com não é Google Workspace. Pare e me avise — muda o desenho todo, e não adianta seguir.

**4.9** Preencher:
- **Nome do app:** `GuipaHub`
- **E-mail de suporte:** o seu @guipabrasil.com
- **Dados de contato do desenvolvedor:** o seu @guipabrasil.com

**Salvar e continuar** → na tela de Escopos, **Salvar e continuar** de novo (não precisa adicionar nada aqui) → **Voltar ao painel**

### 4d. Criar a credencial

**4.10** Menu ☰ → **APIs e serviços** → **Credenciais**

**4.11** **+ Criar credenciais** (topo) → **ID do cliente OAuth**

**4.12** **Tipo de aplicativo: Aplicativo da Web**

**4.13** **Nome:** `GuipaHub web`

**4.14** Descer até **Origens JavaScript autorizadas**. Clicar em **+ Adicionar URI** e adicionar **duas**, uma de cada vez:

```
http://localhost:5173
```

```
https://guipahub.onrender.com
```

*(a segunda é a URL do passo 3.8 — use a sua)*

> **Cuidado com três coisas:** `http` no localhost e `https` no Render (não troque); **sem barra no final**; e sem `/index.html` ou qualquer caminho — é só o endereço base.

**4.15 "URIs de redirecionamento autorizados": deixe vazio POR ENQUANTO.** Você volta aqui na Parte 7 para colar a callback do Supabase — que ainda não existe neste ponto do guia.

**4.16** **Criar**

**4.17** Abre uma janela com o **ID do cliente**, terminando em `.apps.googleusercontent.com`. Copiar.

> Ele **não é segredo**. Client ID é público por definição — vai dentro do JavaScript que qualquer pessoa pode ler. Quem protege o acesso são as origens autorizadas (4.14) e o tipo Interno (4.8).

**✅ Confira antes de seguir:** você tem uma string parecida com `123456789012-abc...xyz.apps.googleusercontent.com` copiada.

---

## Parte 5 — Ligar tudo

**5.1** Abrir o arquivo `src/config.js` e colar o Client ID:

```js
export const CONFIG = {
  clientId: "123456789012-abc...xyz.apps.googleusercontent.com",
  driveRaizId: "",
};
```

Manter as aspas. Não mexer no `driveRaizId` por enquanto.

**5.2 Testar no seu PC primeiro** — é mais fácil consertar aqui do que no ar:

```bash
npm run dev
```

Abrir `http://localhost:5173`, clicar em **Entrar com Google**, escolher a conta @guipabrasil.com e autorizar (vai pedir permissão de ver os arquivos do Drive — aceitar).

Depois ir na aba **Clientes** e buscar o nome de uma pasta que você sabe que existe.

**5.3** Funcionando, publicar:

```bash
git add -A && git commit -m "Client ID do Google" && git push
```

O Render vê o push e refaz o deploy sozinho em ~2 minutos. Não precisa mexer no painel dele.

**✅ Confira:** abrir `https://guipahub.onrender.com` e fazer login. Agora é o site de verdade, que o time vai usar.

---

## Parte 5.5 — Supabase (o banco compartilhado)

Marcas, biblioteca de prompts e quadros por empresa são de todo mundo — e
dado compartilhado precisa de um lugar fora do navegador.

O passo a passo completo está em **`supabase/LEIA-ME.md`**. O resumo da
ordem, que é a parte confusa:

1. Criar o projeto no Supabase → ele te dá uma **Callback URL**
2. Rodar `supabase/schema.sql` no SQL Editor (cria as tabelas **e** as
   regras de acesso — não pule as regras)
3. Voltar ao Google Cloud e colar essa callback em **URIs de
   redirecionamento autorizados** (o campo que você deixou vazio no 4.15)
4. No Supabase, ligar o provedor Google com o Client ID **e** o Client
   Secret
5. Me mandar o **Project URL** e a **anon key**

> **O login muda de dono.** Passa a ser o Supabase que emite a sessão, e
> não mais o Google direto. Para quem usa não muda nada — continua
> "Entrar com Google" com a conta da GUIPA. Muda porque o banco precisa
> saber quem está chamando para decidir o que cada um pode ler.

> **O Client Secret é segredo de verdade**, diferente do Client ID. Ele
> fica guardado no Supabase e nunca no código do site.

---

## Parte 6 — Liberar o Drive pro time

Sem isto, o comercial entra e vê tudo vazio. **Não é bug:** o site lê o Drive **com a conta de quem entrou**. Quem não enxerga a pasta no Drive não enxerga no site.

**6.1** No Google Drive, achar a pasta onde ficam os materiais dos clientes

**6.2** Botão direito → **Compartilhar**

**6.3** Dar acesso de **Leitor** — o ideal é ao grupo ou domínio inteiro de uma vez, em vez de pessoa por pessoa

**6.4** Conferir a estrutura das pastas:
- A pasta de cada cliente tem **exatamente** o nome do cliente — `iFood`, não `iFood - 2026` nem `IFOOD final`
- O mesmo cliente não aparece em dois setores diferentes

---

## Quando algo der errado

| O que você vê | O que é |
|---|---|
| `Error 400: redirect_uri_mismatch` ou `origin mismatch` | A URL não está nas Origens JavaScript autorizadas (4.14). Conferir `http` x `https`, barra no fim, e se você salvou |
| `Error 403: access_denied` | A tela de permissão está como Interno e você entrou com conta de fora do domínio |
| Popup abre e fecha na hora | Bloqueador de popup do navegador, ou o Client ID não bate com a origem de onde o site está sendo aberto |
| Entrou, mas a aba Clientes diz que o Drive não foi autorizado | Na tela do Google dá pra desmarcar só a permissão do Drive. Clicar em "Autorizar o Drive" e aceitar dessa vez |
| Busca não acha um cliente que existe | Ou o nome da pasta não bate exatamente, ou a pasta não está compartilhada com a conta logada |
| `push` recusado, fala em "unrelated histories" | O repositório do GitHub foi criado com README/gitignore/license. Apagar o repositório no GitHub e refazer o 2.2 com tudo desmarcado |
| Render mostra "Build failed" | Abrir o log. Quase sempre é o Build Command ou o Publish Directory errado (3.6) |
| Site abre em branco | Publish Directory não é `dist` |
| Primeira visita do dia demora ~30s | Normal no plano gratuito do Render: o serviço hiberna sem uso e precisa acordar |

Em qualquer um desses: me manda a mensagem de erro inteira, que eu resolvo.

---

## O que NÃO precisa agora

**Supabase.** Ele é banco de dados + gerenciamento de usuários. Hoje o GuipaHub não tem dado próprio pra guardar: o acervo mora no Drive, e tarefas/prompts moram no navegador de cada um.

Para o login do Google ele especificamente **não ajuda**: o Supabase Auth te daria uma sessão do app e um `provider_token` do Google, mas **não renova esse provider_token** — então o acesso ao Drive continuaria vencendo em 1 hora e continuaria dependendo do fluxo do Google. Seria uma peça a mais sem tirar trabalho nenhum.

Ele passa a valer no dia em que existir dado compartilhado de verdade: comentário nas imagens, histórico de quem alterou, ou o Kanban virando do time inteiro. Aí é a ferramenta certa.
