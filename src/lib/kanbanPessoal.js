import { supabase } from "./supabase.js";
import { pegarEstado, alterar, subscrever } from "./estado.js";

/* O kanban pessoal guardado no banco, por pessoa (16-kanban-pessoal.sql).

   A tela continua lendo e gravando em estado.js (é rápido e funciona
   offline); este módulo espelha colunas e tarefas para o banco e, ao
   entrar, traz de lá. Assim o quadro é o mesmo em qualquer navegador.

   Junta só na primeira vez que um navegador sincroniza com uma conta:
   tarefa que só existia ali entra no quadro do banco. Depois disso o
   banco manda — senão uma tarefa excluída em outro computador voltaria
   da cópia velha deste. E o quadro que este navegador guardava de outra
   conta nunca é juntado ao de quem entrou agora. */

const DONO_KEY = "guipahub_kanban_dono";
let email = "";
let pronto = false;
let ultimoEnviado = "";
let timer = null;
let sair = null;

function retrato(e) {
  return JSON.stringify({ listas: e.listas || [], demandas: e.demandas || [] });
}

function lerDono() {
  try {
    return localStorage.getItem(DONO_KEY) || "";
  } catch {
    return "";
  }
}
function gravarDono(v) {
  try {
    localStorage.setItem(DONO_KEY, v);
  } catch {
    /* sem localStorage: a próxima carga junta de novo, o que é inofensivo */
  }
}

async function enviar() {
  const e = pegarEstado();
  const r = retrato(e);
  if (!email || r === ultimoEnviado) return;
  const { error } = await supabase.from("kanban_pessoal").upsert({
    email,
    listas: e.listas || [],
    demandas: e.demandas || [],
    atualizado_em: new Date().toISOString(),
  });
  if (!error) ultimoEnviado = r;
}

export async function iniciarKanbanPessoal(meuEmail) {
  const alvo = String(meuEmail || "").toLowerCase();
  if (!supabase || !alvo || alvo === email) return;
  email = alvo;
  pronto = false;

  const { data, error } = await supabase
    .from("kanban_pessoal")
    .select("listas, demandas")
    .eq("email", email)
    .maybeSingle();
  /* Sem a tabela (SQL ainda não rodado) ou sem rede: o quadro segue
     funcionando só no navegador, como antes. */
  if (error) return;

  const local = pegarEstado();
  const dono = lerDono();
  const deOutraConta = dono && dono !== email;

  if (data) {
    const doBanco = data.demandas || [];
    const ids = new Set(doBanco.map((d) => d.id));
    const soAqui = !dono ? (local.demandas || []).filter((d) => !ids.has(d.id)) : [];
    alterar({
      listas: data.listas?.length ? data.listas : local.listas,
      demandas: [...doBanco, ...soAqui],
    });
    ultimoEnviado = retrato(data);
  } else if (deOutraConta) {
    /* Primeira vez desta conta, mas o navegador guardava o quadro de
       outra pessoa: começa vazio em vez de herdar. */
    alterar({ demandas: [] });
  }
  gravarDono(email);
  pronto = true;

  if (!sair) {
    sair = subscrever(() => {
      if (!pronto) return;
      clearTimeout(timer);
      timer = setTimeout(enviar, 700);
    });
  }
  enviar();
}
