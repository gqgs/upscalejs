import Predictor from "./predictor"

const predictor = new Predictor()

onmessage = async (event: MessageEvent) => {
  const id = event.data.id
  const image = event.data.image
  const denoiseModel = event.data.denoiseModel

  const upscaled = await predictor.predict(image, denoiseModel)

  postMessage({
    type: "done",
    id,
    upscaled
  })
}