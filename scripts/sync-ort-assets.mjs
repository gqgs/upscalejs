import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const runtimeDist = dirname(require.resolve("onnxruntime-web/webgpu"))
const destination = resolve("public/js")
const assets = readdirSync(runtimeDist).filter(name =>
  /^ort-wasm-simd-threaded(?:\.[\w-]+)?\.(?:mjs|wasm)$/.test(name)
)

if (!assets.some(name => name.endsWith(".wasm")) || !assets.some(name => name.endsWith(".mjs"))) {
  throw new Error(`ONNX Runtime assets were not found in ${runtimeDist}`)
}

mkdirSync(destination, { recursive: true })
for (const name of assets) {
  if (!statSync(join(runtimeDist, name)).isFile()) continue
  copyFileSync(join(runtimeDist, name), join(destination, name))
}
console.log(`Synced ${assets.length} ONNX Runtime Web assets to ${destination}`)
