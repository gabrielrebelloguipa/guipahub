# Publicar o GuipaHub

Do computador local até o time entrando com a conta @guipabrasil.com.

A ordem importa: o Google precisa saber a URL final do site para autorizá-la, então o site tem que existir antes do Client ID.

---

## 1. GitHub — mandar o código pra nuvem

O Git local já está pronto (repositório criado, primeiro commit feito). Falta só o espelho no GitHub.

**1.1** Entrar em [github.com/new](https://github.com/new)

**1.2** Preencher:
- **Repository name:** `guipahub`
- **Private** ← importante, é código interno
- **NÃO** marcar "Add a README", "Add .gitignore" nem "Choose a license" — o repositório local já tem tudo, e marcar isso cria conflito

**1.3** Clicar em **Create repository**

**1.4** A página seguinte mostra uma URL tipo `https://github.com/SEU-USUARIO/guipahub.git`. Copiar.

**1.5** No terminal, dentro de `Desktop\GUIPA\GuipaHub-react`:

```bash
git remote add origin https://github.com/SEU-USUARIO/guipahub.git
```

```bash
git branch -M main && git push -u origin main
```

Vai pedir login do GitHub na primeira vez. Se pedir senha, **não é a senha da conta** — é um token: [github.com/settings/tokens](https://github.com/settings/tokens) → *Generate new token (classic)* → marcar o escopo `repo` → copiar e colar no lugar da senha.

**Daqui pra frente**, todo trabalho salvo é:

```bash
git add -A && git commit -m "o que mudou" && git push
```

---

## 2. Render — colocar o site no ar

**2.1** Entrar em [dashboard.render.com](https://dashboard.render.com) e conectar a conta do GitHub

**2.2** **New +** → **Static Site**

**2.3** Escolher o repositório `guipahub`

**2.4** Preencher exatamente assim:

| Campo | Valor |
|---|---|
| **Name** | `guipahub` |
| **Branch** | `main` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

**2.5** **Create Static Site**. O primeiro build leva 1–2 minutos.

**2.6** No fim, o Render dá uma URL tipo `https://guipahub.onrender.com`. **Anotar — é a peça que falta pro passo 3.**

O site vai abrir dizendo "Falta configurar o Client ID". É o esperado nesta altura.

> **Um ajuste que evita erro 404.** O GuipaHub é uma página só, então isso não morde hoje — mas se um dia tiver rotas, vá em **Settings → Redirects/Rewrites** e adicione: Source `/*`, Destination `/index.html`, Action **Rewrite**.

**Daqui pra frente:** todo `git push` refaz o deploy sozinho. Não precisa mexer no Render de novo.

---

## 3. Google Cloud — o Client ID

Esta é a parte que faz o login existir.

**3.1** Entrar em [console.cloud.google.com](https://console.cloud.google.com) **com a conta @guipabrasil.com**

**3.2** No topo, seletor de projeto → **Novo projeto** → nome `GuipaHub` → **Criar**. (Se a empresa já tiver um projeto, dá pra usar o existente.)

**3.3** Menu → **APIs e serviços** → **Biblioteca** → buscar **Google Drive API** → **Ativar**

**3.4** Menu → **APIs e serviços** → **Tela de permissão OAuth**
- Tipo de usuário: **Interno**
- Se "Interno" estiver cinza, o domínio não é Google Workspace — me avisa, porque muda o desenho todo
- Nome do app: `GuipaHub` · E-mail de suporte: o seu · E-mail do desenvolvedor: o seu
- **Salvar e continuar** até o fim

> **"Interno" é a tranca de verdade.** Com ela, o Google só deixa entrar conta @guipabrasil.com — não importa o que o site faça. A checagem de domínio no código é conveniência, isto aqui é a trava.

**3.5** Menu → **APIs e serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**
- Tipo: **Aplicativo da Web**
- Nome: `GuipaHub web`
- **Origens JavaScript autorizadas** → **Adicionar URI**, duas vezes:
  - `http://localhost:5173` (para desenvolver)
  - `https://guipahub.onrender.com` (a URL do passo 2.6)
- **Não** preencher "URIs de redirecionamento autorizados" — este fluxo não usa
- **Criar**

**3.6** Copiar o **ID do cliente**. Termina em `.apps.googleusercontent.com`.

> Ele **não é segredo** — Client ID é público por definição, vai no código do navegador de qualquer jeito. Quem protege o acesso é a lista de origens autorizadas e o tipo "Interno".

---

## 4. Ligar

**4.1** Abrir `src/config.js` e colar:

```js
export const CONFIG = {
  clientId: "cole-o-id-aqui.apps.googleusercontent.com",
  driveRaizId: "",
};
```

**4.2** Testar local primeiro:

```bash
npm run dev
```

Abrir `http://localhost:5173`, clicar em **Entrar com Google**, escolher a conta @guipabrasil.com e autorizar. Ir na aba **Clientes** e buscar um cliente.

**4.3** Funcionando, publicar:

```bash
git add -A && git commit -m "Client ID do Google" && git push
```

O Render refaz o deploy sozinho em ~2 minutos.

---

## 5. Drive — liberar o acesso pro time

Sem isto, o comercial entra e vê vazio. Não é bug: o site lê o Drive **com a conta de quem entrou**, então quem não enxerga a pasta lá não enxerga aqui.

**5.1** No Drive, achar a pasta onde ficam os materiais dos clientes

**5.2** Botão direito → **Compartilhar**

**5.3** Dar acesso de **Leitor** ao time — o ideal é ao grupo/domínio inteiro de uma vez, em vez de pessoa por pessoa

**5.4** Conferir a estrutura: a pasta de cada cliente com **exatamente** o nome do cliente (`iFood`, não `iFood - 2026`)

---

## Se der errado

| Sintoma | Causa quase certa |
|---|---|
| `redirect_uri_mismatch` ou `origin mismatch` | A URL não está nas Origens JavaScript autorizadas (passo 3.5). Confira `http` x `https` e se não sobrou barra no fim |
| Popup abre e fecha sem nada | Bloqueador de popup, ou o Client ID não bate com a origem |
| Entrou, mas a aba Clientes diz que o Drive não foi autorizado | Na tela do Google dá pra desmarcar só a permissão do Drive. Clicar em "Autorizar o Drive" e aceitar |
| Busca não acha um cliente que existe | Ou o nome da pasta não bate, ou a pasta não está compartilhada com quem está logado |
| "Interno" cinza no passo 3.4 | O domínio não é Google Workspace — me avisa |

---

## O que NÃO precisa agora

**Supabase.** Ele guarda dados e gerencia usuários. Hoje o GuipaHub não tem dado próprio pra guardar: o acervo mora no Drive e o resto mora no navegador de cada um.

Para o login do Google especificamente ele não ajuda: o Supabase Auth te daria uma sessão do app e um `provider_token` do Google, mas **não renova esse provider_token** — então o acesso ao Drive continuaria vencendo em 1 hora e continuaria dependendo do fluxo do Google.

Ele passa a valer quando existir dado compartilhado de verdade: comentário nas imagens, histórico de quem alterou, ou o Kanban virando do time. Aí é a ferramenta certa, e a gente monta.
