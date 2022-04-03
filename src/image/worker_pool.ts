import { Upscaler } from "./index"

interface Job {
  bitmap: ImageBitmap
  denoiseModel: string
}

export class WorkerPool {
  private created_workers = 0
  private _max_workers = 1
  private workers: Upscaler[] = []
  private waitingForWorker: ((upscaler: Upscaler) => void) [] = []

  public get max_workers(): number {
    return this._max_workers
  }

  public set max_workers(workers: number) {
    this._max_workers = workers
  }

  public terminate() {
    this.workers.map(worker => worker.terminate())
    this.workers = []
    this.created_workers = 0
  }

  private async getWorker(): Promise<Upscaler> {
    return new Promise(resolve => {
      const worker = this.workers.shift()
      if (worker) {
        resolve(worker)
        return
      }
      this.waitingForWorker.push(resolve)
    })
  }

  public async execute(job: Job): Promise<ImageBitmap> {
    if (this.created_workers < this.max_workers) {
      this.created_workers++
      this.workers.push(new Upscaler())
    }

    const worker = await this.getWorker()
    const { bitmap } = job
    const result = worker.upscale(bitmap)
    const waiting = this.waitingForWorker.shift()
    if (waiting) {
      waiting(worker)
    } else {
      this.workers.push(worker)
    }
    return result
  }
}

export default {
  WorkerPool
}