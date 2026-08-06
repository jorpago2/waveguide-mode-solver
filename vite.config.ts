import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/waveguide-mode-solver/",
  plugins: [tailwindcss(), react()],
  worker: { format: "es" },
});
