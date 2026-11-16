import { defineConfig } from "vite";

export default defineConfig({
  base: "/minecraft/",
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true
  }
});
