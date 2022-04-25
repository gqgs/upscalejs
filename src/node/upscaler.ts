import type { ImageSource } from "../image/canvas"
import { canvasListFromImageData } from "../image/canvas"
import type { Options } from "../image/options"
import { defaultOptions } from "../image/options"
import { createCanvas } from "canvas"
import Predictor from "../image/predictor"
import * as ort from "onnxruntime-node"
import canvas from "canvas"

export class Upscaler {
  protected options
  private predictor: Predictor

  constructor(options?: Options) {
    this.options = Object.assign(defaultOptions, options)
    this.predictor = new Predictor(ort, this.options.base)
  }

  public async upscale(image: ImageSource): Promise<ImageData> {
    const result_canvas = createCanvas(image.width * 2, image.height * 2)
    const canvas_list = canvasListFromImageData(image)
    for (let i = 0; i < canvas_list.length; i++) {
      const imagedata = canvas_list[i].element.getContext("2d").getImageData(0, 0, 200, 200)
      const upscaled = await this.predictor.predict(imagedata, this.options.denoiseModel)
      result_canvas.getContext("2d").putImageData(upscaled, canvas_list[i].x, canvas_list[i].y)
    }
    return result_canvas.getContext("2d").getImageData(0, 0, result_canvas.width, result_canvas.height)
  }
}

module.exports = {
  Upscaler,
  canvas
  // Exporting 'canvas' here because the library doesn't work properly
  // when it is imported from different modules
  // see: https://github.com/Automattic/node-canvas/issues/487
}
