
const Worker = await import("./upscale.worker?worker")

interface Canvas {
  x: number
  y: number
  element: HTMLCanvasElement
}

const canvasListFromBitmap = (bitmap: ImageBitmap): Canvas[] => {
  const canvas_list: Canvas[] = []
  const width = Math.ceil(bitmap.width / 200) * 200
  const height = Math.ceil(bitmap.height / 200) * 200
  for (let x = 0; x < width; x += 200) {
    for (let y = 0; y < height; y += 200) {
      const canvas = document.createElement("canvas")
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext("2d")
      ctx?.drawImage(bitmap, x, y, 200, 200, 0, 0, 200, 200)
      canvas_list.push({
        x: x * 2,
        y: y * 2,
        element: canvas,
      })
    }
  }
  return canvas_list
}

const isImageBitmap = (img: unknown): img is ImageBitmap => {
  const bitmap = img as ImageBitmap
  return bitmap.width > 0 && bitmap.height > 0
}

interface Options {
  denoiseModel: "no-denoise" | "conservative" | "denoise1x" | "denoise2x" | "denoise3x"
}

const defaultOptions: Options = {
  denoiseModel: "conservative"
}

export class Upscaler {
  private canvas: HTMLCanvasElement = document.createElement("canvas")
  private id = 0
  private pending = new Map<number, Canvas>()
  private worker = new Worker.default()
  private resolve?: (canvas: Promise<ImageBitmap>) => void

  constructor() {
    this.worker.onmessage = (event: MessageEvent) => {
      const { id, upscaled } = event.data
      if (!isImageBitmap(upscaled)) throw Error("expected upscaled to be an 'ImageBitmap'")
      const result = this.pending.get(id)
      if (!result) throw Error("upscaled result is not pending")
      const ctx = this.canvas.getContext("2d")
      ctx?.drawImage(upscaled, result.x, result.y)
      this.pending.delete(id)
      if (this.pending.size == 0) {
        this.resolve?.call(this, createImageBitmap(this.canvas))
      }
    }
  }

  public upscale(bitmap: ImageBitmap, options: Options = defaultOptions): Promise<ImageBitmap> {
    return new Promise(resolve => {
      this.resolve = resolve
      this.canvas.width = bitmap.width * 2
      this.canvas.height = bitmap.height * 2
      const canvas_list = canvasListFromBitmap(bitmap)
      canvas_list.forEach(canvas => {
        const id = this.id++
        this.pending.set(id, canvas)
        this.worker.postMessage({
          id,
          image: canvas.element.getContext("2d")?.getImageData(0, 0, 200, 200),
          denoiseModel: options.denoiseModel
        })
      })
    })
  }

  public terminate() {
    this.worker.terminate()
  }
}

export default {
  Upscaler
}