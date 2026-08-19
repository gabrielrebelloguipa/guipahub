/* Constantes de domínio, num arquivo só para não ficarem espalhadas.
   As cores de identidade vivem no estilo.css (variáveis CSS) — aqui só
   entra o que o JavaScript precisa enxergar. */

export const PRIORIDADES = [
  { key: "baixa", label: "Baixa" },
  { key: "normal", label: "Normal" },
  { key: "alta", label: "Alta" },
  { key: "urgente", label: "Urgente" },
];

export const LISTA_CORES = [
  "#c78b2b", "#4f8fdb", "#8a6fc4", "#8b8d85",
  "#5fae5a", "#c2678d", "#3f9c96", "#b3452f",
];

export const CATEGORIAS_MATERIAL = [
  "Marca", "Apresentações", "Mockups e 3D", "Modelos", "Banco de mídias",
];

export const GRUPOS_GUIA = ["Medidas e arquivos", "Boas práticas", "Fluxo"];

export const CATEGORIAS_PROMPT = [
  { key: "imagem", label: "Imagem", cor: "#4f8fdb" },
  { key: "video", label: "Vídeo", cor: "#c2678d" },
  { key: "texto", label: "Texto", cor: "#5fae5a" },
  { key: "tresd", label: "3D", cor: "#8a6fc4" },
  { key: "outro", label: "Outro", cor: "#8b8d85" },
];

export function categoriaPrompt(k) {
  return (
    CATEGORIAS_PROMPT.find((c) => c.key === k) ||
    CATEGORIAS_PROMPT[CATEGORIAS_PROMPT.length - 1]
  );
}

/* Sugestões, não lista fechada: ferramenta de IA nova aparece toda hora,
   e uma lista fixa envelheceria mal. O campo aceita qualquer texto. */
export const FERRAMENTAS_IA = [
  "ChatGPT", "Gemini", "Claude", "Adobe Firefly", "Midjourney",
  "Runway", "Sora", "Freepik", "Krea", "Luma", "Kling", "Higgsfield",
];

export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const DIAS = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];

export function hojeChave() {
  const d = new Date();
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function fmtData(dk) {
  if (!dk) return "—";
  const [a, m, d] = String(dk).split("-").map(Number);
  if (!a || !m || !d) return "—";
  return `${d} de ${MESES[m - 1]}`;
}

/* Dias entre hoje e a data (negativo = venceu). Contas com data em texto
   evitam fuso: comparar "2026-08-19" é sempre o mesmo dia em toda máquina. */
export function diasAte(dk) {
  if (!dk) return null;
  const hoje = new Date(hojeChave() + "T00:00:00");
  const alvo = new Date(dk + "T00:00:00");
  if (isNaN(alvo)) return null;
  return Math.round((alvo - hoje) / 86400000);
}
