# upscalejs

Image upscaling using super resolution AI models.

<p align="center">
<img src="/src/assets/sample.png">
</p>

## Usage

```ts
import { UpscaleWorker } from "upscalejs"

const upscaler = new UpscaleWorker()
const result = await upscaler.upscale(bitmap)
const canvas = document.createElement("canvas")
canvas.width = result.width
canvas.height = result.height
canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(result)
```

You will also need to copy the models and onnxruntime wasm files to your public folder e.g.:
```ts
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  chainWebpack: config => {
    config
      .plugin("copy-webpack-plugin")
      .use(CopyPlugin)
      .tap(() => {
        return [{
          patterns: [
            {
              from: "./node_modules/upscalejs/public/js/ort-*.wasm",
              to: "js/[name][ext]",
            },
            {
              from: "./node_modules/upscalejs/public/models/*.onnx",
              to: "models/[name][ext]",
            }
          ],
        }]
      })
   }
}
```

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
