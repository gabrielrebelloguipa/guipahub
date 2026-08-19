import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    /* Porta fixa: o Client ID do Google autoriza origens uma a uma, e uma
       porta que muda a cada `npm run dev` obrigaria a mexer no console do
       Google toda vez. strictPort falha em vez de escorregar para outra. */
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
