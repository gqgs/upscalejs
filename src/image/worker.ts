import { canvasListFromImageData } from "./canvas"
import type { Canvas, ImageSource } from "./canvas"
import { defaultOptions } from "./options"
import type { Model, Options } from "./options"
import Worker from "./upscale.worker?worker&inline"
import { createCanvas } from "canvas"
import type { Canvas as NodeCanvas } from "canvas"

interface Terminator {
  terminate(): void
}

abstract class WorkerPool<worker extends Terminator> {
  protected options
  protected created_workers = 0
  protected workers: worker[] = []
  private waitingForWorker: ((upscaler: worker) => void) [] = []
  public abstract upscale(image: ImageSource): Promise<ImageData>

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

  public async upscale(image: ImageSource): Promise<ImageData> {
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

class upscaleWorker extends WorkerPool<Worker> {
  private id = 0
  private canvas: NodeCanvas = createCanvas(0, 0)
  private pending = new Map<number, Canvas>()
  private resolve?: (canvas: Promise<ImageData>) => void

  constructor(options?: Options) {
    super(options)
  }

  private onmessage(event: MessageEvent) {
    const { id, upscaled } = event.data
    if (!isImageData(upscaled)) throw Error("expected upscaled to be an 'ImageData'")
    const result = this.pending.get(id)
    if (!result) throw Error("upscaled result is not pending")
    this.canvas.getContext("2d").putImageData(upscaled, result.x, result.y)
    this.pending.delete(id)
    if (this.pending.size == 0) {
      const imgdata = this.canvas.getContext("2d").getImageData(0, 0, this.canvas.width, this.canvas.height)
      this.resolve?.call(this, Promise.resolve(imgdata))
    }
  }

  public async upscale(image: ImageSource): Promise<ImageData> {
    return new Promise(resolve => {
      this.resolve = resolve
      this.canvas = createCanvas(image.width * 2, image.height * 2)
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
          image: canvas.element.getContext("2d").getImageData(0, 0, 200, 200),
          denoiseModel: this.options.denoiseModel,
          base: this.options.base
        })
        this.putWorker(worker)
      })
    })
  }
}

const isImageData = (image: unknown): image is ImageData => {
  const imgdata = image as ImageData
  return imgdata.width > 0 && imgdata.height > 0
}

export type {
  Model
}

export default {
  Upscaler
}
