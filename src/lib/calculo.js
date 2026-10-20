/* As contas da calculadora comercial.

   Reproduzem as duas abas da planilha "Proposta - Projetos Especiais"
   fórmula por fórmula. Ficam aqui, separadas da tela, porque são duas
   telas que precisam dar o MESMO número: o que se vê na calculadora e o
   que sai no .xlsx exportado. Se a conta morasse no componente, o Excel
   gerado teria que repeti-la — e as duas cópias divergiriam no primeiro
   ajuste de preço.

   Este arquivo não sabe que existe React. */

/* ---------- premissas ---------- */

/* Os números fixos da tabela de preços. Ficam editáveis na tela porque a
   tabela vale até 31/12/2026: no reajuste, muda-se aqui e não no código. */
export const PREMISSAS_PADRAO = {
  /* comissão de agência: o líquido é 80% do negociado */
  liquidoSobreNegociado: 0.8,

  /* Circuito: o slot 1:2 passa metade das inserções do 1:1, alcança
     metade dos impactos e custa 70% da tabela do 1:1. */
  slot2Insercoes: 0.5,
  slot2Tabela: 0.7,
  slot2Impactos: 0.5,

  /* Projetos Especiais, por moto */
  facesPorMoto: 3,
  insercoesDiaPorMoto: 10800,
  tabelaDiaPorMoto: 12000,
};

export const PERIODOS = [
  { key: "semanal", label: "Semanal", dias: 7 },
  { key: "quinzenal", label: "Quinzenal", dias: 14 },
  { key: "mensal", label: "Mensal", dias: 30 },
];

export function diasDoPeriodo(key) {
  return (PERIODOS.find((p) => p.key === key) || PERIODOS[0]).dias;
}

/* Divisão que devolve 0 em vez de Infinity/NaN: um campo ainda vazio
   na tela não pode virar "NaN" no meio da proposta. */
function div(a, b) {
  return b ? a / b : 0;
}

/* ---------- Circuito SP/RJ ---------- */

/* Cada praça vira duas linhas, como na planilha: o slot 1:1 com os
   valores digitados, e o 1:2 derivado dele. Editar a tabela do 1:1 move
   o 1:2 junto — é o que a planilha faz com =H9*70%. */
export const PRACAS_PADRAO = [
  {
    id: "sp", praca: "SP", ativos: 50, faces: 150, periodo: "semanal",
    insercoesDia: 90000, tabela: 220000, impactos: 13337917,
    desconto1: 0.5, desconto2: 0.5, comSlot2: true,
  },
  {
    id: "rj", praca: "RJ", ativos: 50, faces: 150, periodo: "semanal",
    insercoesDia: 90000, tabela: 170000, impactos: 11671917,
    desconto1: 0.5, desconto2: 0.5, comSlot2: true,
  },
];

function linhaCircuito(pr, slot, P) {
  const dias = diasDoPeriodo(pr.periodo);
  const eh2 = slot === 2;
  const insercoesDia = eh2 ? pr.insercoesDia * P.slot2Insercoes : pr.insercoesDia;
  const tabela = eh2 ? pr.tabela * P.slot2Tabela : pr.tabela;
  const impactos = eh2 ? pr.impactos * P.slot2Impactos : pr.impactos;
  const desconto = eh2 ? pr.desconto2 : pr.desconto1;

  const insercoesPeriodo = insercoesDia * dias;          // G = F*7
  const negociado = tabela * (1 - desconto);             // J = H*(1-I)
  const liquido = negociado * P.liquidoSobreNegociado;   // K = J*0.8
  return {
    chave: pr.id + "-" + slot,
    pracaId: pr.id,
    slot,
    praca: pr.praca,
    ativos: `Digital 1:${slot} - ${pr.ativos}`,
    faces: pr.faces,
    periodo: (PERIODOS.find((p) => p.key === pr.periodo) || PERIODOS[0]).label,
    dias,
    insercoesDia,
    insercoesPeriodo,
    tabela,
    desconto,
    negociado,
    liquido,
    /* L = J/(F*7): a planilha divide o NEGOCIADO, não o líquido */
    custoInsercao: div(negociado, insercoesPeriodo),
    impactos,
    /* N = K/(M/1000): aqui sim o LÍQUIDO */
    cpm: div(liquido, impactos / 1000),
  };
}

export function calcularCircuito(pracas, P = PREMISSAS_PADRAO) {
  const linhas = [];
  for (const pr of pracas) {
    linhas.push(linhaCircuito(pr, 1, P));
    if (pr.comSlot2) linhas.push(linhaCircuito(pr, 2, P));
  }
  const soma = (k) => linhas.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  const total = {
    insercoesPeriodo: soma("insercoesPeriodo"),
    tabela: soma("tabela"),
    negociado: soma("negociado"),
    liquido: soma("liquido"),
    impactos: soma("impactos"),
  };
  total.desconto = div(total.tabela - total.negociado, total.tabela);
  total.custoInsercao = div(total.negociado, total.insercoesPeriodo);
  total.cpm = div(total.liquido, total.impactos / 1000);
  return { linhas, total };
}

/* ---------- Projetos Especiais ---------- */

export const LINHAS_ESPECIAIS_PADRAO = [
  { id: "br", praca: "Brasil", dias: 3, motos: 10, desconto: 0.6 },
];

export function calcularEspeciais(linhasEntrada, P = PREMISSAS_PADRAO) {
  const linhas = linhasEntrada.map((l) => {
    const faces = l.motos * P.facesPorMoto;                      // G = F*3
    const insercoesDia = P.insercoesDiaPorMoto * l.motos;        // H = 10800*F
    const insercoesTotais = insercoesDia * l.dias;               // I = H*D
    const tabela = P.tabelaDiaPorMoto * l.motos * l.dias;        // O = 12000*F*D
    const negociado = tabela * (1 - l.desconto);                 // Q = O*(1-P)
    const liquido = negociado * P.liquidoSobreNegociado;         // R = Q*0.8
    return {
      ...l,
      faces,
      insercoesDia,
      insercoesTotais,
      tabela,
      negociado,
      liquido,
      /* K = R/I: nesta aba o custo por inserção usa o LÍQUIDO —
         diferente do Circuito, que usa o negociado. Está assim na
         planilha original e foi mantido. */
      custoInsercao: div(liquido, insercoesTotais),
      valorDiaMoto: div(div(liquido, l.motos), l.dias),         // S = R/F/D
    };
  });
  const soma = (k) => linhas.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  const total = {
    motos: soma("motos"),
    faces: soma("faces"),
    insercoesTotais: soma("insercoesTotais"),
    tabela: soma("tabela"),
    negociado: soma("negociado"),
    liquido: soma("liquido"),
  };
  total.desconto = div(total.tabela - total.negociado, total.tabela);
  total.custoInsercao = div(total.liquido, total.insercoesTotais);
  return { linhas, total };
}

/* ---------- observações que acompanham cada tabela ---------- */

export const NOTAS = {
  circuito: [
    "TABELA VÁLIDA ATÉ: 31/12/2026",
    "OBS: INÍCIO DA OPERAÇÃO CIRCUITO EM SÃO PAULO E RIO DE JANEIRO A PARTIR DE ABRIL/2026.",
    "SLOT 1:1 - INSERÇÕES DE 10s A CADA MINUTO P/ 10 HORAS DIA",
    "SLOT 1:2 - INSERÇÕES DE 10s A CADA DOIS MINUTOS P/ 10 HORAS DIA",
    "PRAZO DE PAGAMENTO 15 DFM",
  ],
  especiais: [
    "TABELA VÁLIDA ATÉ: 31/12/2026",
    "OBS: AÇÕES NO TERRITÓRIO NACIONAL CONSIDERAR R$ 2.800,00 DE TRANSPORTE POR ATIVO. (Exceto São Paulo)",
    "PRAZO DE IMPLEMENTAÇÃO - TRANSPORTE: SUDESTE 10 DIAS A PARTIR DO FECHAMENTO DA PROPOSTA, DEMAIS REGIÕES 15 DIAS",
    "PRAZO DE PAGAMENTO 15 DFM",
  ],
};

/* ---------- formatação pt-BR ---------- */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL4 = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4,
});
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export const fmt = {
  brl: (v) => BRL.format(Number(v) || 0),
  /* custo por inserção vive na casa dos centavos: duas casas mostrariam
     R$ 0,17 para valores bem diferentes */
  brlFino: (v) => BRL4.format(Number(v) || 0),
  num: (v) => NUM.format(Number(v) || 0),
  pct: (v) => PCT.format(Number(v) || 0),
};
