import path from "path";
import { defineConfig } from "vite";
import { config } from "./vite.options"

// https://vitejs.dev/config/
export default defineConfig({
  ...config,
  build: {
    rollupOptions: {
      input: {
        "upscalejs": path.resolve(__dirname, "src/image/worker.ts"),
        "upscalejs-node": path.resolve(__dirname, "src/node/upscaler.ts"),
      },
      external: ["vue", "canvas", "onnxruntime-node"],
      preserveEntrySignatures: "strict",
      output: [
        {
          exports: "named",
          globals: {
            vue: "Vue",
          },
          name: "upscalejs",
          entryFileNames: "[name].[format].js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name].[ext]",
          format: "esm",
        },
        {
          exports: "named",
          globals: {
            vue: "Vue"
          },
          name: "upscalejs-node",
          entryFileNames: "[name].[format].js",
          format: "cjs",
        },
      ],
    }
  }
});
