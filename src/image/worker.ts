import Worker from "./upscale.worker?worker&inline"
import { type Model, type Options, type ResolvedOptions, type UpscaleOptions, resolveOptions } from "./options"

interface PendingJob {
  resolve: (bitmap: ImageBitmap) => void
  reject: (error: Error) => void
  onProgress?: (percent: number) => void
}

interface WorkerResponse {
  id?: string
  type?: "progress" | "done" | "error"
  bitmap?: ImageBitmap
  percent?: number
  error?: string
}

export class Upscaler {
  private options: ResolvedOptions
  private workers: Worker[] = []
  private nextWorkerIndex = 0
  private nextJobId = 0
  private pendingJobs = new Map<string, PendingJob>()

  constructor(options?: Options) {
    this.options = resolveOptions(options)
  }

  public setWorkerCount(workerCount: number) {
    if (!Number.isInteger(workerCount) || workerCount < 1) {
      throw new Error("workerCount must be a positive integer")
    }
    if (this.options.workerCount === workerCount) return

    this.options.workerCount = workerCount
    this.terminate()
  }

  public getWorkerCount() {
    return this.options.workerCount
  }

  public setOptions(options: Options) {
    const nextOptions = resolveOptions({
      ...this.options,
      ...options,
      workerCount: options.workerCount ?? options.maxWorkers ?? this.options.workerCount,
    })
    const shouldRecreateWorkers =
      nextOptions.workerCount !== this.options.workerCount ||
      nextOptions.base !== this.options.base ||
      nextOptions.numThreads !== this.options.numThreads

    this.options = nextOptions
    if (shouldRecreateWorkers) {
      this.terminate()
    }
  }

  private getWorkers() {
    if (this.workers.length === 0) {
      for (let i = 0; i < this.options.workerCount; i++) {
        const worker = new Worker()
        worker.onmessage = event => this.handleWorkerMessage(event.data as WorkerResponse)
        worker.onerror = event => {
          console.error("upscalejs worker error:", event)
        }
        this.workers.push(worker)
      }
    }
    return this.workers
  }

  private handleWorkerMessage(data: WorkerResponse) {
    if (!data || !data.id) return

    const job = this.pendingJobs.get(data.id)
    if (!job) return

    if (data.type === "progress") {
      job.onProgress?.(data.percent || 0)
      return
    }

    this.pendingJobs.delete(data.id)
    if (data.type === "done" && data.bitmap) {
      job.resolve(data.bitmap)
      return
    }

    job.reject(new Error(data.error || "Unknown upscaler worker error"))
  }

  public async upscale(image: ImageBitmap, options: UpscaleOptions = {}): Promise<ImageBitmap> {
    const workers = this.getWorkers()
    const worker = workers[this.nextWorkerIndex]
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % workers.length

    const id = (this.nextJobId++).toString()
    const bitmap = await createImageBitmap(image)
    const model = options.model ?? this.options.model
    const forceUpscale = options.forceUpscale ?? this.options.forceUpscale

    return new Promise((resolve, reject) => {
      this.pendingJobs.set(id, { resolve, reject, onProgress: options.onProgress })
      worker.postMessage({
        id,
        type: "upscale",
        bitmap,
        targetSize: options.targetSize,
        model,
        base: this.options.base,
        forceUpscale,
        downscaleThreshold: this.options.downscaleThreshold,
        numThreads: this.options.numThreads,
      }, [bitmap])
    })
  }

  public async release() {
    this.workers.forEach(worker => worker.postMessage({ type: "release" }))
  }

  public terminate() {
    this.workers.forEach(worker => worker.terminate())
    this.workers = []
    this.pendingJobs.forEach(job => job.reject(new Error("Upscaler was terminated")))
    this.pendingJobs.clear()
    this.nextWorkerIndex = 0
  }
}

export type {
  Model,
  Options,
  UpscaleOptions,
}

export default {
  Upscaler,
}
