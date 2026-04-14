export type Model = "6B" | "HFA2kShallowESRGAN" | "Swin2SR"

export interface UpscaleOptions {
  targetSize?: number
  model?: Model
  forceUpscale?: boolean
  onProgress?: (percent: number) => void
}

export interface Options {
  // Max number of app-level workers that can process different images at once.
  workerCount?: number
  // Deprecated alias kept for easier v1 migration.
  maxWorkers?: number
  // Environment base URL, usually the root of the copied public assets.
  base?: string
  // Default model used when a call does not pass an explicit model.
  model?: Model
  // Force model inference even when the input is already larger than targetSize.
  forceUpscale?: boolean
  // Number of ONNX Runtime WASM threads per worker. Keep at 1 for browser stability.
  numThreads?: number
  // Large forced-upscale inputs are resized before inference to keep work bounded.
  downscaleThreshold?: number
}

export interface ResolvedOptions {
  workerCount: number
  base: string
  model: Model
  forceUpscale: boolean
  numThreads: number
  downscaleThreshold: number
}

const defaultBase = () => {
  if (typeof window === "undefined") return "./"
  return `${window.location.origin}/`
}

export const defaultOptions: ResolvedOptions = {
  workerCount: 1,
  base: defaultBase(),
  model: "6B",
  forceUpscale: false,
  numThreads: 1,
  downscaleThreshold: 200,
}

export const resolveOptions = (options: Options = {}): ResolvedOptions => {
  return {
    workerCount: options.workerCount ?? options.maxWorkers ?? defaultOptions.workerCount,
    base: options.base ?? defaultOptions.base,
    model: options.model ?? defaultOptions.model,
    forceUpscale: options.forceUpscale ?? defaultOptions.forceUpscale,
    numThreads: options.numThreads ?? defaultOptions.numThreads,
    downscaleThreshold: options.downscaleThreshold ?? defaultOptions.downscaleThreshold,
  }
}

export default {
  defaultOptions,
  resolveOptions,
}
