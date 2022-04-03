interface Options {
  // Max number of workers that will be created for multiple images.
  maxWorkers?: number
  // Max number of worker that will be created for each image.
  maxInternalWorkers?: number
  // The model that will be used for upscaling the image.
  denoiseModel?: "no-denoise" | "conservative" | "denoise1x" | "denoise2x" | "denoise3x"
}
  
const defaultOptions = {
  maxWorkers: 1,
  maxInternalWorkers: 4,
  denoiseModel: "conservative"
}

interface Terminator {
  terminate(): void
}

abstract class WorkerPool<worker extends Terminator> {
  protected options
  protected created_workers = 0
  protected workers: worker[] = []
  private waitingForWorker: ((upscaler: worker) => void) [] = []
  public abstract upscale(bitmap: ImageBitmap): Promise<ImageBitmap>

  constructor(options?: Options) {
    this.options = Object.assign(defaultOptions, options)
  }

  protected async getWorker(): Promise<worker> {
    return new Promise(resolve => {
      const worker = this.workers.shift()
      if (worker) {
        resolve(worker)
        return
      }
      this.waitingForWorker.push(resolve)
    })
  }

  protected putWorker(worker: worker) {
    const waiting = this.waitingForWorker.shift()
    if (waiting) {
      waiting(worker)
      return
    }
    this.workers.push(worker)
  }

  public terminate() {
    this.workers.map(worker => worker.terminate())
    this.workers = []
    this.created_workers = 0
  }
}

export class UpscaleWorker extends WorkerPool<upscaleWorker> {
  constructor(options?: Options) {
    super(options)
  }

  public async upscale(bitmap: ImageBitmap): Promise<ImageBitmap> {
    if (this.created_workers < this.options.maxWorkers) {
      this.created_workers++
      this.workers.push(new upscaleWorker(this.options))
    }
    const worker = await this.getWorker()
    const result = worker.upscale(bitmap)
    this.putWorker(worker)
    return result
  }
}

interface Canvas {
  x: number
  y: number
  element: HTMLCanvasElement
}

class upscaleWorker extends WorkerPool<Worker> {
  private id = 0
  private canvas: HTMLCanvasElement = document.createElement("canvas")
  private pending = new Map<number, Canvas>()
  private resolve?: (canvas: Promise<ImageBitmap>) => void

  constructor(options?: Options) {
    super(options)
  }

  private onmessage(event: MessageEvent) {
    const { id, upscaled } = event.data
    if (!isImageBitmap(upscaled)) throw Error("expected upscaled to be an 'ImageBitmap'")
    const result = this.pending.get(id)
    if (!result) throw Error("upscaled result is not pending")
    this.canvas.getContext("2d")?.drawImage(upscaled, result.x, result.y)
    this.pending.delete(id)
    if (this.pending.size == 0) {
      this.resolve?.call(this, createImageBitmap(this.canvas))
    }
  }

  public upscale(bitmap: ImageBitmap): Promise<ImageBitmap> {
    return new Promise(resolve => {
      this.resolve = resolve
      this.canvas.width = bitmap.width * 2
      this.canvas.height = bitmap.height * 2
      const canvas_list = canvasListFromBitmap(bitmap)
      canvas_list.forEach(async canvas => {
        const id = this.id++
        this.pending.set(id, canvas)
        if (this.created_workers < this.options.maxInternalWorkers) {
          this.created_workers++
          const Worker = await import("./upscale.worker?worker")
          const worker = new Worker.default()
          worker.onmessage = this.onmessage.bind(this)
          this.workers.push(worker)
        }
        const worker = await this.getWorker()
        worker.postMessage({
          id,
          image: canvas.element.getContext("2d")?.getImageData(0, 0, 200, 200),
          denoiseModel: this.options.denoiseModel
        })
        this.putWorker(worker)
      })
    })
  }
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

export default {
  UpscaleWorker
}