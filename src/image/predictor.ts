import type * as ort from "onnxruntime-common"
import { createImageData } from "canvas"

interface Ort {
  env: ort.Env
  InferenceSession: ort.InferenceSessionFactory
  Tensor: ort.TensorConstructor
}

export default class Predictor {
  private ort: Ort
  private baseURL: string
  private models: Map<string, Promise<ort.InferenceSession>> = new Map<string, Promise<ort.InferenceSession>>()

  constructor (ort: Ort, baseURL: string) {
    this.ort = ort
    this.baseURL = baseURL
  }

  private async loadModel(denoiseModel: string): Promise<ort.InferenceSession> {
    const cached_model = this.models.get(denoiseModel)
    if (cached_model) {
      return cached_model
    }
    this.ort.env.wasm.wasmPaths = `${this.baseURL}js/`
    const path = `${this.baseURL}models/up2x-latest-${denoiseModel}.onnx`
    const model = this.ort.InferenceSession.create(path)
    this.models.set(denoiseModel, model)
    return model
  }

  public async predict (image: ImageData, denoiseModel: string): Promise<ImageData> {
    const red = new Array<number>()
    const green = new Array<number>()
    const blue = new Array<number>()
    for (let i = 0; i < image.data.length; i += 4) {
      red.push(image.data[i])
      green.push(image.data[i+1])
      blue.push(image.data[i+2])
    }
    const transposed = red.concat(green).concat(blue)
    const float32Data = new Float32Array(3 * 200 * 200)
    for (let i = 0; i < float32Data.length; i++) {
      float32Data[i] = transposed[i] / 255.0
    }
    const tensor = new this.ort.Tensor("float32", float32Data, [1, 3, 200, 200])
    const session = await this.loadModel(denoiseModel)
    const feeds = { input_1: tensor }
    const results = await session.run(feeds)

    const rgbaArray = new Uint8ClampedArray(4 * 400 * 400)
    const resultData = results.output_1.data as Uint8Array
    // [3, 400, 400] -> [400, 400, 4]
    for (const d of Array(4).keys()) {
      for (let i = 160_000 * d, j = d; j < rgbaArray.length; i++, j += 4) {
        rgbaArray[j] = resultData[i] ?? 255
      }
    }
    return createImageData(rgbaArray, 400, 400)
  }
}
