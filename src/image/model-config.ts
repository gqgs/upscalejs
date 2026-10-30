import type { Model, Precision } from "./options"

export interface ModelConfig {
  path: string
  tileSize: number
  upscaleFactor: number
}

// Model files are only fetched when a session is created, not at page load.
export const getModelConfig = (model: Model, base: string, precision: Precision = "uint8"): ModelConfig => {
  const root = base.endsWith("/") ? base : `${base}/`
  const suffix = precision === "fp32" ? "fp32" : "uint8"
  switch (model) {
    case "Swin2SR":
      return {
        path: `${root}models/Swin2SR/swin2SR_${suffix}.ort`,
        tileSize: 64,
        upscaleFactor: 2,
      }
    case "HFA2kShallowESRGAN":
      return {
        path: `${root}models/HFA2k/2xHFA2kShallowESRGAN_${suffix}.ort`,
        tileSize: 256,
        upscaleFactor: 2,
      }
    case "6B":
      return {
        path: `${root}models/RealESRGAN/RealESRGAN_x4plus_anime_6B_${suffix}.ort`,
        tileSize: 256,
        upscaleFactor: 4,
      }
  }
}
