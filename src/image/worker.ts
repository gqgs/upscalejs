interface Options {
  denoiseModel: "no-denoise" | "conservative" | "denoise1x" | "denoise2x" | "denoise3x"
}
  
const defaultOptions: Options = {
  denoiseModel: "conservative"
}

interface Terminator {
  terminate(): void
}

abstract class WorkerPool<worker extends Terminator> {
  protected created_workers = 0
  protected max_workers: number
  protected workers: worker[] = []
  private waitingForWorker: ((upscaler: worker) => void) [] = []
  public abstract upscale(bitmap: ImageBitmap, options: Options): Promise<ImageBitmap>

  constructor(max_workers: number) {
    this.max_workers = max_workers
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
  constructor(max_workers: number) {
    super(max_workers)
  }

  public async upscale(bitmap: ImageBitmap, options: Options = defaultOptions): Promise<ImageBitmap> {
    if (this.created_workers < this.max_workers) {
      this.created_workers++
      this.workers.push(new upscaleWorker(this.max_workers))
    }
    const worker = await this.getWorker()
    const result = worker.upscale(bitmap, options)
    this.putWorker(worker)
    return result
  }
}

const Worker = await import("./upscale.worker?worker")

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

  constructor(max_workers: number) {
    super(max_workers)
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

  public upscale(bitmap: ImageBitmap, options: Options = defaultOptions): Promise<ImageBitmap> {
    return new Promise(resolve => {
      this.resolve = resolve
      this.canvas.width = bitmap.width * 2
      this.canvas.height = bitmap.height * 2
      const canvas_list = canvasListFromBitmap(bitmap)
      canvas_list.forEach(async canvas => {
        const id = this.id++
        this.pending.set(id, canvas)
        if (this.created_workers < this.max_workers) {
          this.created_workers++
          const worker = new Worker.default()
          worker.onmessage = this.onmessage.bind(this)
          this.workers.push(worker)
        }
        const worker = await this.getWorker()
        worker.postMessage({
          id,
          image: canvas.element.getContext("2d")?.getImageData(0, 0, 200, 200),
          denoiseModel: options.denoiseModel
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