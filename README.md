# upscalejs

Image upscaling in the browser using ONNX Runtime Web and super-resolution models.

<p align="center">
<img src="/src/assets/sample.png">
</p>

## v2 breaking changes

Version 2 replaces the old Real-CUGAN model API with some new models.

- Models are now `"6B"` (Real-ESRGAN anime 4x), `"HFA2kShallowESRGAN"` (anime 2x), and `"Swin2SR"` (balanced 2x).
- `upscale()` returns an `ImageBitmap`.
- Node/CJS support is not part of v2; the package is ESM/browser-first.
- Model/runtime assets now live under `models/RealESRGAN`, `models/HFA2k`, `models/Swin2SR`, and `js`.

## Usage

```ts
import { Upscaler } from "upscalejs"

const upscaler = new Upscaler({
  base: new URL(import.meta.env.BASE_URL, window.location.origin).href,
  model: "6B",
  workerCount: 3,
})

const result = await upscaler.upscale(bitmap, {
  targetSize: 400,
  forceUpscale: true,
  onProgress: percent => {
    console.log(`${Math.round(percent)}%`)
  },
})

const canvas = document.createElement("canvas")
canvas.width = result.width
canvas.height = result.height
canvas.getContext("2d")?.drawImage(result, 0, 0)
result.close()

await upscaler.release()
upscaler.terminate()
```

## Options

```ts
type Model = "6B" | "HFA2kShallowESRGAN" | "Swin2SR"

interface Options {
  workerCount?: number
  base?: string
  model?: Model
  forceUpscale?: boolean
  numThreads?: number
  downscaleThreshold?: number
}

interface UpscaleOptions {
  targetSize?: number
  model?: Model
  forceUpscale?: boolean
  onProgress?: (percent: number) => void
}
```

Keep `numThreads` at `1` unless you have tested your target browsers carefully. Browser WASM multithreading can produce unstable results under high concurrency.

## Assets

Copy the model and ONNX Runtime files to your public directory. The `base` option must point to that public root.

```js
const CopyPlugin = require("copy-webpack-plugin")

module.exports = {
  chainWebpack: config => {
    config
      .plugin("copy-webpack-plugin")
      .use(CopyPlugin)
      .tap(() => {
        return [{
          patterns: [
            {
              context: "./node_modules/upscalejs/dist/js",
              from: "ort-wasm-simd-threaded.*",
              to: "js/[name][ext]",
            },
            {
              context: "./node_modules/upscalejs/dist/models",
              from: "**/*",
              to: "models/[path][name][ext]",
            }
          ],
        }]
      })
  }
}
```

For Vite:

```ts
import { defineConfig } from "vite"
import { resolve } from "node:path"
import { cpSync } from "node:fs"

export default defineConfig({
  plugins: [{
    name: "copy-upscalejs-assets",
    closeBundle() {
      cpSync(resolve("node_modules/upscalejs/dist/js"), resolve("dist/js"), { recursive: true })
      cpSync(resolve("node_modules/upscalejs/dist/models"), resolve("dist/models"), { recursive: true })
    },
  }],
})
```

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Build Library

```sh
npm run lib
```

### Test

```sh
npm run test
```
