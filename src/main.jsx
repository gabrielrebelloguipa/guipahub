import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./estilo.css";

/* Tema: claro, escuro ou o do sistema. Fica fora do React porque mexe no
   <html>, que é território de fora da árvore de componentes. */
const TEMA_KEY = "guipahub_tema";
function aplicarTema() {
  let tema = "sistema";
  try {
    tema = localStorage.getItem(TEMA_KEY) || "sistema";
  } catch {
    /* sem localStorage: segue o sistema */
  }
  const escuro =
    tema === "dark" ||
    (tema === "sistema" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
}
aplicarTema();
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", aplicarTema);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
