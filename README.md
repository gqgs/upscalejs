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
