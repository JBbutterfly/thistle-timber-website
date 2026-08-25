import { defineConfig } from "vite";

export default defineConfig({
  base: "/human-design/",
  build: {
    outDir: "../human-design",
    emptyOutDir: true,
  },
});
