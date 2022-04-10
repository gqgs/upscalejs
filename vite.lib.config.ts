import path from "path";
import { defineConfig } from "vite";
import { config } from "./vite.options"

// https://vitejs.dev/config/
export default defineConfig({
  ...config,
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/image/worker.ts"),
      name: "upscalejs",
      fileName: (format) => `upscalejs.${format}.js`
    },
    rollupOptions: {
      external: ["vue"],
      output: {
        exports: "named",
        globals: {
          vue: "Vue"
        }
      }
    }
  }
});
