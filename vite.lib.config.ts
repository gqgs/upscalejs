import path from "path";
import { cpSync } from "fs";
import { defineConfig } from "vite";
import { config } from "./vite.options"

const copyLibraryAssets = () => ({
  name: "copy-upscalejs-assets",
  closeBundle() {
    cpSync(path.resolve(__dirname, "public/js"), path.resolve(__dirname, "dist/js"), { recursive: true })
    cpSync(path.resolve(__dirname, "public/models"), path.resolve(__dirname, "dist/models"), { recursive: true })
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  ...config,
  publicDir: false,
  plugins: [...config.plugins, copyLibraryAssets()],
  build: {
    rollupOptions: {
      input: {
        "upscalejs": path.resolve(__dirname, "src/image/worker.ts")
      },
      external: ["vue", "onnxruntime-web"],
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
      ],
    }
  }
});
