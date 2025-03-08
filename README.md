# upscalejs

Image upscaling using super resolution AI models.

<p align="center">
<img src="/src/assets/sample.png">
</p>

## Usage

```ts
import { Upscaler } from "upscalejs"

const upscaler = new Upscaler()
const result = await upscaler.upscale(bitmap)
const canvas = document.createElement("canvas")
canvas.width = result.width
canvas.height = result.height
canvas.getContext("2d")?.putImageData(result, 0, 0)
```

You will need to copy the models and onnxruntime wasm files to your public folder e.g.:
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
              from: "./node_modules/upscalejs/dist/js/ort-*.wasm",
              to: "js/[name][ext]",
            },
            {
              from: "./node_modules/upscalejs/dist/models/*.onnx",
              to: "models/[name][ext]",
            }
          ],
        }]
      })
   }
}
```

Current available models were trained in anime images and are based on work done in the [Real-CUGAN](https://github.com/bilibili/ailab/tree/main/Real-CUGAN) project.

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

### Test with [Vitest](https://github.com/vitest-dev/vitest)

```sh
npm run test
```
