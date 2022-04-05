import { fileURLToPath, URL } from "url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";

const vueOptions = {
  template: {
    compilerOptions: {
      isCustomElement: (tag: string) => tag.startsWith("ion-")
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV == "production"
    ? "/upscalejs/"
    : "/",
  plugins: [vue(vueOptions), vueJsx()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "onnxruntime-web": "onnxruntime-web/dist/ort.wasm.min.js",
    },
  }
});
