import * as ort from "onnxruntime-web"
import type { Model } from "./options"

ort.env.wasm.proxy = false

interface UpscaleMessage {
  id: string
  type: "upscale"
  bitmap: ImageBitmap
  targetSize?: number
  model: Model
  base: string
  forceUpscale: boolean
  downscaleThreshold: number
  numThreads: number
}

interface ReleaseMessage {
  type: "release"
}

type WorkerMessage = UpscaleMessage | ReleaseMessage

const ctx: DedicatedWorkerGlobalScope = self as any

const sessions: Partial<Record<Model, ort.InferenceSession>> = {}
const sessionPromises: Partial<Record<Model, Promise<ort.InferenceSession>>> = {}
let queue = Promise.resolve()

const normalizeBase = (base: string) => {
  return base.endsWith("/") ? base : `${base}/`
}

const getModelConfig = (model: Model, base: string) => {
  const root = normalizeBase(base)
  if (model === "Swin2SR") {
    return {
      path: `${root}models/Swin2SR/swin2SR_uint8.ort`,
      tileSize: 64,
      upscaleFactor: 2,
    }
  }
  if (model === "HFA2kShallowESRGAN") {
    return {
      path: `${root}models/HFA2k/2xHFA2kShallowESRGAN_uint8.ort`,
      tileSize: 256,
      upscaleFactor: 2,
    }
  }

  return {
    path: `${root}models/RealESRGAN/RealESRGAN_x4plus_anime_6B_uint8.ort`,
    tileSize: 256,
    upscaleFactor: 4,
  }
}

const getSession = async (model: Model, base: string): Promise<ort.InferenceSession> => {
  const cached = sessions[model]
  if (cached) return cached

  if (!sessionPromises[model]) {
    const config = getModelConfig(model, base)
    sessionPromises[model] = ort.InferenceSession.create(config.path, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    }).then(session => {
      sessions[model] = session
      return session
    })
  }

  return sessionPromises[model] as Promise<ort.InferenceSession>
}

const releaseSessions = async () => {
  const models = Object.keys(sessions) as Model[]
  for (const model of models) {
    await sessions[model]?.release()
    delete sessions[model]
    delete sessionPromises[model]
  }
}

const hasInvalidValues = (array: Float32Array): boolean => {
  for (let i = 0; i < array.length; i++) {
    if (!Number.isFinite(array[i])) return true
  }
  return false
}

const hasOnlyZeroes = (array: Float32Array): boolean => {
  for (let i = 0; i < array.length; i++) {
    if (array[i] !== 0) return false
  }
  return true
}

const downscaleImage = async (source: ImageBitmap, targetSize: number): Promise<ImageBitmap> => {
  const canvas = new OffscreenCanvas(targetSize, targetSize)
  const ctx2d = canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D | null
  if (!ctx2d) throw new Error("Could not get 2D canvas context")
  ctx2d.imageSmoothingEnabled = true
  ctx2d.imageSmoothingQuality = "high"
  ctx2d.drawImage(source, 0, 0, targetSize, targetSize)
  return canvas.transferToImageBitmap()
}

const upscaleTiled = async (
  bitmap: ImageBitmap,
  model: Model,
  base: string,
  onProgress?: (percent: number) => void
): Promise<ImageBitmap> => {
  if (bitmap.width === 0 || bitmap.height === 0) {
    throw new Error(`Invalid bitmap dimensions: ${bitmap.width}x${bitmap.height}`)
  }

  const session = await getSession(model, base)
  const config = getModelConfig(model, base)
  const { width, height } = bitmap
  const tileSize = config.tileSize
  const upscaleFactor = config.upscaleFactor
  const outTileSize = tileSize * upscaleFactor

  const canvas = new OffscreenCanvas(width, height)
  const ctx2d = canvas.getContext("2d", { alpha: false, willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null
  if (!ctx2d) throw new Error("Could not get source canvas context")
  ctx2d.drawImage(bitmap, 0, 0)

  const outputCanvas = new OffscreenCanvas(width * upscaleFactor, height * upscaleFactor)
  const outCtx = outputCanvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D | null
  if (!outCtx) throw new Error("Could not get output canvas context")

  const tileCanvas = new OffscreenCanvas(outTileSize, outTileSize)
  const tileCtx = tileCanvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D | null
  if (!tileCtx) throw new Error("Could not get tile canvas context")

  const totalTiles = Math.ceil(width / tileSize) * Math.ceil(height / tileSize)
  let finishedTiles = 0

  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const curW = Math.min(tileSize, width - x)
      const curH = Math.min(tileSize, height - y)
      const tileData = ctx2d.getImageData(x, y, tileSize, tileSize)
      const { data } = tileData

      const inputBuffer = new Float32Array(3 * tileSize * tileSize)
      for (let i = 0; i < tileSize * tileSize; i++) {
        inputBuffer[i] = data[i * 4] / 255
        inputBuffer[i + tileSize * tileSize] = data[i * 4 + 1] / 255
        inputBuffer[i + 2 * tileSize * tileSize] = data[i * 4 + 2] / 255
      }

      if (hasOnlyZeroes(inputBuffer)) {
        console.warn(`upscalejs: tile at ${x},${y} has all-zero input`)
      }

      const tensor = new ort.Tensor("float32", inputBuffer, [1, 3, tileSize, tileSize])
      const results = await session.run({ [session.inputNames[0]]: tensor })
      const output = results[session.outputNames[0]].data as Float32Array

      if (hasInvalidValues(output)) {
        throw new Error(`Model returned NaN or Infinity for tile at ${x},${y}`)
      }
      if (hasOnlyZeroes(output)) {
        console.warn(`upscalejs: model returned all-zero output for tile at ${x},${y}`)
      }

      const outImageData = new Uint8ClampedArray(outTileSize * outTileSize * 4)
      for (let i = 0; i < outTileSize * outTileSize; i++) {
        outImageData[i * 4] = Math.max(0, Math.min(255, output[i] * 255))
        outImageData[i * 4 + 1] = Math.max(0, Math.min(255, output[i + outTileSize * outTileSize] * 255))
        outImageData[i * 4 + 2] = Math.max(0, Math.min(255, output[i + 2 * outTileSize * outTileSize] * 255))
        outImageData[i * 4 + 3] = 255
      }

      tileCtx.putImageData(new ImageData(outImageData, outTileSize, outTileSize), 0, 0)
      outCtx.drawImage(
        tileCanvas as unknown as CanvasImageSource,
        0,
        0,
        curW * upscaleFactor,
        curH * upscaleFactor,
        x * upscaleFactor,
        y * upscaleFactor,
        curW * upscaleFactor,
        curH * upscaleFactor
      )

      finishedTiles++
      onProgress?.((finishedTiles / totalTiles) * 100)
    }
  }

  return outputCanvas.transferToImageBitmap()
}

const processUpscale = async (message: UpscaleMessage, onProgress: (percent: number) => void): Promise<ImageBitmap> => {
  const { bitmap, targetSize, model, base, forceUpscale, downscaleThreshold } = message

  if (targetSize && !forceUpscale && bitmap.width >= targetSize && bitmap.height >= targetSize) {
    onProgress(100)
    return downscaleImage(bitmap, targetSize)
  }

  let inputBitmap = bitmap
  let inputWasDownscaled = false

  try {
    if (targetSize && forceUpscale && (bitmap.width > downscaleThreshold || bitmap.height > downscaleThreshold)) {
      inputBitmap = await downscaleImage(bitmap, downscaleThreshold)
      inputWasDownscaled = true
    }

    const upscaled = await upscaleTiled(inputBitmap, model, base, onProgress)
    if (targetSize && (upscaled.width !== targetSize || upscaled.height !== targetSize)) {
      const resized = await downscaleImage(upscaled, targetSize)
      upscaled.close()
      return resized
    }
    return upscaled
  } finally {
    if (inputWasDownscaled) {
      inputBitmap.close()
    }
  }
}

const handleUpscaleMessage = async (data: UpscaleMessage) => {
  try {
    ort.env.wasm.numThreads = data.numThreads
    ort.env.wasm.wasmPaths = `${normalizeBase(data.base)}js/`

    const bitmap = await processUpscale(data, percent => {
      ctx.postMessage({ id: data.id, type: "progress", percent })
    })
    ctx.postMessage({ id: data.id, type: "done", bitmap }, [bitmap])
  } catch (error: any) {
    ctx.postMessage({ id: data.id, type: "error", error: error?.message || String(error) })
  } finally {
    data.bitmap.close()
  }
}

const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task, task).catch(error => {
    console.error("upscalejs worker queue error:", error)
  })
}

ctx.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  const data = event.data
  if (!data || typeof data !== "object") return

  if (data.type === "release") {
    enqueue(releaseSessions)
    return
  }

  enqueue(() => handleUpscaleMessage(data))
})
