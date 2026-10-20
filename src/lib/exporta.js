/* Exportar a proposta como .xlsx e como imagem.

   As duas bibliotecas são carregadas só no clique (import dinâmico). Juntas
   passam de 1 MB, e quem abre o GuipaHub para ver o Kanban não tem por
   que baixar o gerador de planilha.

   O .xlsx sai com FÓRMULAS, não só com os números: é assim que a
   planilha original funciona, e o comercial continua podendo ajustar um
   desconto direto no Excel e ver o resto se recalcular. Cada fórmula leva
   junto o resultado já calculado, para o arquivo abrir certo até em
   visualizador que não recalcula (o preview do WhatsApp, por exemplo). */

import { calcularCircuito, calcularEspeciais, NOTAS, PREMISSAS_PADRAO } from "./calculo.js";

const LARANJA = "FFF76E00"; // laranja oficial do brandbook
const CINZA = "FFF2F2F0";
const BRL = '"R$" #,##0.00';
const BRL_FINO = '"R$" #,##0.0000';
const NUM = "#,##0";
const PCT = "0%";

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* Nome de arquivo a partir do cliente e da campanha, sem caractere que
   o Windows recuse. */
export function nomeArquivo(cab, modo, ext) {
  const partes = ["Proposta", cab.cliente, cab.campanha, modo === "circuito" ? "Circuito" : "Projetos Especiais"]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" - ")
    .replace(/[\\/:*?"<>|]+/g, "")
    .slice(0, 120);
  return (partes || "Proposta") + "." + ext;
}

function estiloCabecalho(cel) {
  cel.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LARANJA } };
  cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: "FFD9D9D9" } } };
}

function borda(cel) {
  cel.border = {
    top: { style: "thin", color: { argb: "FFE5E5E5" } },
    bottom: { style: "thin", color: { argb: "FFE5E5E5" } },
  };
  cel.alignment = { ...(cel.alignment || {}), vertical: "middle" };
}

function blocoDeTopo(ws, cab, col1, col2) {
  const linhas = [
    [`Agência: ${cab.agencia || ""}`, `Atendimento Comercial: ${cab.atendimento || ""}`],
    [`Cliente: ${cab.cliente || ""}`, `E-mail: ${cab.email || ""}`],
    [`Campanha: ${cab.campanha || ""}`, `Telefone: ${cab.telefone || ""}`],
  ];
  linhas.forEach(([a, b], i) => {
    const r = 2 + i;
    ws.getCell(col1 + r).value = a;
    ws.getCell(col1 + r).font = { bold: true, size: 10 };
    ws.getCell(col2 + r).value = b;
    ws.getCell(col2 + r).font = { bold: true, size: 10 };
  });
  if (cab.periodo) {
    ws.getCell("H3").value = `Período: ${cab.periodo}`;
    ws.getCell("H3").font = { bold: true, size: 10 };
  }
  ws.getCell("B2").value = "GUIPA";
  ws.getCell("B2").font = { bold: true, size: 20, color: { argb: LARANJA } };
}

function notasAoFim(ws, linha, notas) {
  notas.forEach((t, i) => {
    const c = ws.getCell("B" + (linha + i));
    c.value = t;
    c.font = { size: 9, bold: i === 0 };
  });
}

/* ---------- Circuito ---------- */

function folhaCircuito(wb, cab, pracas, P) {
  const ws = wb.addWorksheet("CIRCUITO SP_RJ", { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 2.6 }, { width: 10 }, { width: 18.7 }, { width: 13 }, { width: 12 },
    { width: 15 }, { width: 17 }, { width: 16 }, { width: 10.5 }, { width: 17 },
    { width: 17 }, { width: 15 }, { width: 15 }, { width: 12 },
  ];
  blocoDeTopo(ws, cab, "D", "J");

  const cab8 = ["Praça", "Ativos / Circuito", "Faces / Ativos", "Período", "Inserções / Dia",
    "Inserções no período", "Valor Tabela", "Desconto", "Valor Negociado", "Valor Líquido",
    "Custo / Inserção", "IMPACTOS", "CPM"];
  cab8.forEach((t, i) => {
    const c = ws.getCell(8, 2 + i);
    c.value = t;
    estiloCabecalho(c);
  });
  ws.getRow(8).height = 30;

  const { linhas, total } = calcularCircuito(pracas, P);
  const L = P.liquidoSobreNegociado;
  let r = 9;
  const linhaDoSlot1 = {};
  for (const l of linhas) {
    const base = linhaDoSlot1[l.pracaId];
    const e2 = l.slot === 2 && base;
    ws.getCell("B" + r).value = l.praca;
    ws.getCell("C" + r).value = l.ativos;
    ws.getCell("D" + r).value = l.faces;
    ws.getCell("E" + r).value = l.periodo;
    /* O slot 1:2 aponta para o 1:1 da mesma praça, como na planilha:
       mudar a tabela do 1:1 no Excel move o 1:2 junto. */
    ws.getCell("F" + r).value = e2
      ? { formula: `F${base}*${P.slot2Insercoes}`, result: l.insercoesDia }
      : l.insercoesDia;
    ws.getCell("G" + r).value = { formula: `F${r}*${l.dias}`, result: l.insercoesPeriodo };
    ws.getCell("H" + r).value = e2
      ? { formula: `H${base}*${P.slot2Tabela}`, result: l.tabela }
      : l.tabela;
    ws.getCell("I" + r).value = l.desconto;
    ws.getCell("J" + r).value = { formula: `H${r}*(1-I${r})`, result: l.negociado };
    ws.getCell("K" + r).value = { formula: `J${r}*${L}`, result: l.liquido };
    ws.getCell("L" + r).value = { formula: `IFERROR(J${r}/G${r},0)`, result: l.custoInsercao };
    ws.getCell("M" + r).value = e2
      ? { formula: `M${base}*${P.slot2Impactos}`, result: l.impactos }
      : l.impactos;
    ws.getCell("N" + r).value = { formula: `IFERROR(K${r}/(M${r}/1000),0)`, result: l.cpm };

    ["D", "F", "G", "M"].forEach((c) => (ws.getCell(c + r).numFmt = NUM));
    ["H", "J", "K", "N"].forEach((c) => (ws.getCell(c + r).numFmt = BRL));
    ws.getCell("L" + r).numFmt = BRL_FINO;
    ws.getCell("I" + r).numFmt = PCT;
    for (let col = 2; col <= 14; col++) borda(ws.getCell(r, col));
    if (l.slot === 1) linhaDoSlot1[l.pracaId] = r;
    r++;
  }

  // total
  const ini = 9, fim = r - 1;
  ws.getCell("B" + r).value = "TOTAL";
  ws.getCell("G" + r).value = { formula: `SUM(G${ini}:G${fim})`, result: total.insercoesPeriodo };
  ws.getCell("H" + r).value = { formula: `SUM(H${ini}:H${fim})`, result: total.tabela };
  ws.getCell("I" + r).value = { formula: `IFERROR(1-J${r}/H${r},0)`, result: total.desconto };
  ws.getCell("J" + r).value = { formula: `SUM(J${ini}:J${fim})`, result: total.negociado };
  ws.getCell("K" + r).value = { formula: `SUM(K${ini}:K${fim})`, result: total.liquido };
  ws.getCell("L" + r).value = { formula: `IFERROR(J${r}/G${r},0)`, result: total.custoInsercao };
  ws.getCell("M" + r).value = { formula: `SUM(M${ini}:M${fim})`, result: total.impactos };
  ws.getCell("N" + r).value = { formula: `IFERROR(K${r}/(M${r}/1000),0)`, result: total.cpm };
  ["G", "M"].forEach((c) => (ws.getCell(c + r).numFmt = NUM));
  ["H", "J", "K", "N"].forEach((c) => (ws.getCell(c + r).numFmt = BRL));
  ws.getCell("L" + r).numFmt = BRL_FINO;
  ws.getCell("I" + r).numFmt = PCT;
  for (let col = 2; col <= 14; col++) {
    const c = ws.getCell(r, col);
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
  }

  notasAoFim(ws, r + 4, NOTAS.circuito);
}

/* ---------- Projetos Especiais ---------- */

function folhaEspeciais(wb, cab, entrada, P) {
  const ws = wb.addWorksheet("PROJETOS ESPECIAIS", { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 5.2 }, { width: 14 }, { width: 8 }, { width: 9 }, { width: 13 },
    { width: 12 }, { width: 15 }, { width: 16 }, { width: 15 }, { width: 15 },
    { width: 11 }, { width: 16 }, { width: 16 }, { width: 16 },
  ];
  blocoDeTopo(ws, cab, "D", "J");
  ws.getCell("B7").value = "1 Dia";
  ws.getCell("B7").font = { bold: true, size: 9, color: { argb: "FF888888" } };

  const cab8 = ["Praça", "Período", "", "N° de Motos", "N° de Faces", "Inserções/dia",
    "Inserções Totais", "Custo/Inserção", "Valor Tabela", "Desconto", "Valor Negociado",
    "Valor Líquido", "Valor/Dia/Moto"];
  cab8.forEach((t, i) => {
    const c = ws.getCell(8, 2 + i);
    c.value = t;
    estiloCabecalho(c);
  });
  ws.mergeCells("C8:D8");
  ws.getRow(8).height = 30;

  const { linhas, total } = calcularEspeciais(entrada, P);
  const L = P.liquidoSobreNegociado;
  let r = 9;
  for (const l of linhas) {
    ws.getCell("B" + r).value = l.praca;
    ws.getCell("C" + r).value = l.dias;
    ws.getCell("D" + r).value = "Dia(s)";
    ws.getCell("E" + r).value = l.motos;
    ws.getCell("F" + r).value = { formula: `E${r}*${P.facesPorMoto}`, result: l.faces };
    ws.getCell("G" + r).value = { formula: `${P.insercoesDiaPorMoto}*E${r}`, result: l.insercoesDia };
    ws.getCell("H" + r).value = { formula: `G${r}*C${r}`, result: l.insercoesTotais };
    /* K = R/I na original: custo por inserção sobre o LÍQUIDO */
    ws.getCell("I" + r).value = { formula: `IFERROR(M${r}/H${r},0)`, result: l.custoInsercao };
    ws.getCell("J" + r).value = { formula: `${P.tabelaDiaPorMoto}*E${r}*C${r}`, result: l.tabela };
    ws.getCell("K" + r).value = l.desconto;
    ws.getCell("L" + r).value = { formula: `J${r}*(1-K${r})`, result: l.negociado };
    ws.getCell("M" + r).value = { formula: `L${r}*${L}`, result: l.liquido };
    ws.getCell("N" + r).value = { formula: `IFERROR(M${r}/E${r}/C${r},0)`, result: l.valorDiaMoto };

    ["C", "E", "F", "G", "H"].forEach((c) => (ws.getCell(c + r).numFmt = NUM));
    ["J", "L", "M", "N"].forEach((c) => (ws.getCell(c + r).numFmt = BRL));
    ws.getCell("I" + r).numFmt = BRL_FINO;
    ws.getCell("K" + r).numFmt = PCT;
    for (let col = 2; col <= 14; col++) borda(ws.getCell(r, col));
    r++;
  }

  if (linhas.length > 1) {
    const ini = 9, fim = r - 1;
    ws.getCell("B" + r).value = "TOTAL";
    ws.getCell("E" + r).value = { formula: `SUM(E${ini}:E${fim})`, result: total.motos };
    ws.getCell("F" + r).value = { formula: `SUM(F${ini}:F${fim})`, result: total.faces };
    ws.getCell("H" + r).value = { formula: `SUM(H${ini}:H${fim})`, result: total.insercoesTotais };
    ws.getCell("I" + r).value = { formula: `IFERROR(M${r}/H${r},0)`, result: total.custoInsercao };
    ws.getCell("J" + r).value = { formula: `SUM(J${ini}:J${fim})`, result: total.tabela };
    ws.getCell("K" + r).value = { formula: `IFERROR(1-L${r}/J${r},0)`, result: total.desconto };
    ws.getCell("L" + r).value = { formula: `SUM(L${ini}:L${fim})`, result: total.negociado };
    ws.getCell("M" + r).value = { formula: `SUM(M${ini}:M${fim})`, result: total.liquido };
    ["E", "F", "H"].forEach((c) => (ws.getCell(c + r).numFmt = NUM));
    ["J", "L", "M"].forEach((c) => (ws.getCell(c + r).numFmt = BRL));
    ws.getCell("I" + r).numFmt = BRL_FINO;
    ws.getCell("K" + r).numFmt = PCT;
    for (let col = 2; col <= 14; col++) {
      const c = ws.getCell(r, col);
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
    }
    r++;
  }

  notasAoFim(ws, r + 2, NOTAS.especiais);
}

/* ---------- as duas saídas ---------- */

export async function exportarXlsx({ modo, cab, pracas, especiais, premissas }) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = cab.atendimento || "GuipaHub";
  wb.created = new Date();
  const P = { ...PREMISSAS_PADRAO, ...(premissas || {}) };
  if (modo === "circuito") folhaCircuito(wb, cab, pracas, P);
  else folhaEspeciais(wb, cab, especiais, P);
  const buf = await wb.xlsx.writeBuffer();
  baixar(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    nomeArquivo(cab, modo, "xlsx")
  );
}

/* A imagem é tirada do próprio bloco da proposta na tela. Escala 2 para
   não sair borrada quando colada numa apresentação ou no WhatsApp. */
export async function exportarImagem(no, { cab, modo }) {
  const { toPng } = await import("html-to-image");
  const fundo = getComputedStyle(no).backgroundColor || "#ffffff";
  const url = await toPng(no, {
    pixelRatio: 2,
    backgroundColor: fundo,
    cacheBust: true,
    /* Campos de edição viram texto na imagem: o que vai para o cliente é
       a proposta, não a interface. Ver a classe .so-tela no CSS. */
    filter: (n) => !(n.classList && n.classList.contains("so-tela")),
  });
  const blob = await (await fetch(url)).blob();
  baixar(blob, nomeArquivo(cab, modo, "png"));
}
