import { defaultOptions } from "./options"
import type { Model, Options } from "./options"
import Worker from "./upscale.worker?worker&inline"
import { canvasListFromImageData, type Canvas } from "./canvas"

interface Terminator {
  terminate(): void
}

abstract class WorkerPool<worker extends Terminator> {
  protected options
  protected created_workers = 0
  protected workers: worker[] = []
  private waitingForWorker: ((upscaler: worker) => void) [] = []
  public abstract upscale(image: ImageBitmap): Promise<ImageBitmap>

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

export class Upscaler extends WorkerPool<upscaleWorker> {
  constructor(options?: Options) {
    super(options)
  }

  public async upscale(image: ImageBitmap): Promise<ImageBitmap> {
    if (this.created_workers < this.options.maxWorkers) {
      this.created_workers++
      this.workers.push(new upscaleWorker(this.options))
    }
    const worker = await this.getWorker()
    const result = await worker.upscale(image)
    this.putWorker(worker)
    return result
  }
}

interface EventData {
  id: number
  upscaled: ImageBitmap
}

class upscaleWorker extends WorkerPool<Worker> {
  private id = 0
  private canvas = new OffscreenCanvas(0, 0)
  private pending = new Map<number, Canvas>()
  private resolve?: (canvas: Promise<ImageBitmap>) => void

  constructor(options?: Options) {
    super(options)
  }

  private onmessage(event: MessageEvent) {
    const { id, upscaled } = event.data as EventData
    const result = this.pending.get(id)
    if (!result) throw Error("upscaled result is not pending")
    this?.canvas?.getContext("2d")?.drawImage(upscaled, result.x, result.y)
    this.pending.delete(id)
    if (this.pending.size == 0) {
      this?.canvas?.getContext("2d")?.getImageData(0, 0, this.canvas.width, this.canvas.height)
      this.resolve?.call(this, Promise.resolve(createImageBitmap(this.canvas)))
    }
  }

  public async upscale(image: ImageBitmap): Promise<ImageBitmap> {
    return new Promise(resolve => {
      this.resolve = resolve
      this.canvas = new OffscreenCanvas(image.width * 2, image.height * 2)
      const canvas_list = canvasListFromImageData(image)
      canvas_list.forEach(async canvas => {
        const id = this.id++
        this.pending.set(id, canvas)
        if (this.created_workers < this.options.maxInternalWorkers) {
          this.created_workers++
          const worker = new Worker()
          worker.onmessage = this.onmessage.bind(this)
          this.workers.push(worker)
        }
        const worker = await this.getWorker()
        worker.postMessage({
          id,
          image: canvas?.element?.getContext("2d")?.getImageData(0, 0, 200, 200),
          denoiseModel: this.options.denoiseModel,
          base: this.options.base
        })
        this.putWorker(worker)
      })
    })
  }
}

export type {
  Model
}

export default {
  Upscaler
}
