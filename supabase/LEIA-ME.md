# Supabase — o que fazer

O que precisa de você: criar o projeto e me passar duas chaves. O resto do encanamento eu escrevo.

---

## O que muda no login

Hoje o site entra direto no Google. Com banco no meio, isso não basta: **o Postgres precisa saber quem está chamando** para decidir o que cada um pode ler e escrever. Um token que só o navegador entende não serve pra isso.

Então o login passa a ser **Supabase Auth com provedor Google**. Na prática, para quem usa, nada muda: continua sendo "Entrar com Google" com a conta @guipabrasil.com. O que muda é que o Supabase passa a emitir a sessão, e é ela que o banco confere.

**O acesso ao Drive continua sendo do Google**, pelo `provider_token` que o Supabase devolve junto. O vencimento de 1 hora continua existindo — o Supabase renova a sessão *dele*, não o token do Google. Isso não é regressão: é igual ao que já era.

---

## Parte 1 — Criar o projeto

**1.1** [supabase.com](https://supabase.com) → **Start your project** → entrar com o GitHub (a mesma conta que você criar/usar para o repositório)

**1.2** **New project**:

| Campo | Valor |
|---|---|
| **Name** | `guipahub` |
| **Database Password** | gerar uma forte e **guardar no gerenciador de senhas** |
| **Region** | `South America (São Paulo)` |
| **Plan** | Free |

> A senha do banco não é usada pelo site. Ela serve para conectar em ferramentas de administração. Guarde mesmo assim — recuperar dá trabalho.

**1.3** Esperar ~2 minutos enquanto provisiona.

---

## Parte 2 — Criar as tabelas

**2.1** No menu lateral: **SQL Editor** → **New query**

**2.2** Abrir o arquivo `supabase/schema.sql` deste projeto, copiar **tudo**, colar no editor

**2.3** **Run** (ou Ctrl+Enter)

**✅ Confira:** deve terminar com "Success. No rows returned". No menu **Table Editor** devem aparecer 5 tabelas: `marcas`, `biblioteca_prompts`, `quadros`, `listas`, `cartoes`.

> **O que esse SQL liga, e por que importa:** ele cria as tabelas **e** as políticas de acesso (RLS). Sem as políticas, a chave pública do site — que vai dentro do JavaScript e qualquer um consegue ler — daria acesso total ao banco para o mundo inteiro. As políticas é que limitam a quem entrou com e-mail @guipabrasil.com. **Não pule este passo nem rode só a parte das tabelas.**

---

## Parte 3 — Ligar o login do Google

**3.1** Menu lateral: **Authentication** → **Providers** → **Google** → ligar o botão

**3.2** Ele pede **Client ID** e **Client Secret**. São os do Google Cloud — o mesmo projeto do guia `PUBLICAR.md`:

- Se você **já criou** o ID do cliente OAuth lá: abra-o em Credenciais e copie os dois valores
- Se **ainda não criou**: faça a Parte 4 do `PUBLICAR.md` primeiro

> Diferente de antes, agora o **Client Secret** também é usado — e ele **é segredo de verdade**. Ele fica guardado no Supabase, nunca no código do site. Não cole em arquivo nenhum do projeto.

**3.3** O Supabase mostra uma **Callback URL** parecida com:

```
https://xxxxxxxx.supabase.co/auth/v1/callback
```

Copiar.

**3.4** Voltar ao Google Cloud → **Credenciais** → abrir o ID do cliente OAuth → em **URIs de redirecionamento autorizados** → **+ Adicionar URI** → colar a callback → **Salvar**

> Antes eu te disse para deixar "URIs de redirecionamento" vazio. Estava certo **para o fluxo antigo**, que não redirecionava. Agora o Supabase redireciona, então este campo passa a ser obrigatório. As **Origens JavaScript** continuam valendo como estão.

**3.5** No Supabase, ainda em Google Provider, salvar.

**3.6** **Authentication** → **URL Configuration**:
- **Site URL:** a URL do Render (ex.: `https://guipahub.onrender.com`)
- **Redirect URLs:** adicionar também `http://localhost:5173` para desenvolver

---

## Parte 4 — Me passar as chaves

Menu lateral: **Project Settings** → **API**. Copiar:

| O que | Aparece como | É segredo? |
|---|---|---|
| **Project URL** | `https://xxxxxxxx.supabase.co` | não |
| **anon public** | uma chave longa começando com `eyJ...` | **não** — vai no código do site de propósito |

Me manda esses dois que eu ligo.

> **Nunca me mande a `service_role`.** Ela ignora todas as políticas de acesso e dá poder total sobre o banco. Ela não é usada em site estático, e se vazar, vazou tudo.

---

## O que fica no Supabase e o que não fica

| Fica no banco (todo mundo vê) | Continua no navegador de cada um |
|---|---|
| Marcas | Kanban pessoal |
| Biblioteca de prompts | Prompts pessoais |
| Quadros por empresa | Central Guipa (materiais, guias, imagens) |
| | Atalhos da aba Hoje |

As imagens e vídeos dos clientes **não entram aqui** — continuam no Google Drive, lidos na hora. O banco guarda texto e organização, não arquivo.

---

## Se der errado

| O que você vê | O que é |
|---|---|
| `new row violates row-level security policy` | Entrou com conta que não é @guipabrasil.com, ou o SQL das políticas não rodou |
| `permission denied for table` | O RLS ligou mas as políticas não foram criadas — rodar o `schema.sql` inteiro de novo |
| `redirect_uri_mismatch` depois de ligar o Google no Supabase | A Callback URL do passo 3.3 não foi adicionada no Google Cloud |
| Login funciona mas a aba Clientes para de achar o Drive | O escopo do Drive não foi pedido na configuração do provedor — me avisa que eu ajusto |
| `duplicate key value violates unique constraint "marcas_nome_unico"` | Já existe marca com esse nome. É proposital: nome repetido viraria dois clientes na busca |
