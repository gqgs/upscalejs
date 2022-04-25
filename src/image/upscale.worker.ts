import * as ort from "onnxruntime-web"
import Predictor from "./predictor"

let predictor: Predictor | null

onmessage = async (event: MessageEvent) => {
  const id = event.data.id
  const image = event.data.image
  const denoiseModel = event.data.denoiseModel
  const base = event.data.base

  if (!predictor) predictor = new Predictor(ort, base)

  const upscaled = await predictor.predict(image, denoiseModel)

  postMessage({
    id,
    upscaled
  })
}