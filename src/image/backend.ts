export type ExecutionProvider = "webgpu" | "wasm"

export const webGPUAvailable = (): boolean =>
  typeof navigator !== "undefined" && !!(navigator as Navigator & { gpu?: unknown }).gpu

/** Prefer GPU execution while retaining WASM for unsupported ONNX operators. */
export const createPreferredSession = async <T>(
  create: (executionProviders: ExecutionProvider[]) => Promise<T>,
  hasWebGPU: boolean = webGPUAvailable(),
): Promise<T> => {
  if (!hasWebGPU) return create(["wasm"])

  try {
    return await create(["webgpu", "wasm"])
  } catch (error) {
    console.warn("upscalejs: WebGPU initialization failed; retrying with WASM", error)
    return create(["wasm"])
  }
}

/**
 * A WebGPU session can initialize successfully but fail during OrtRun.
 * Re-run the failing tile on WASM, and keep that backend for subsequent tiles.
 */
export class InferenceSessionWithFallback<Session> {
  private sessionPromise?: Promise<Session>
  private activeProvider?: ExecutionProvider
  private webGPUFailed = false
  private readonly create: (providers: ExecutionProvider[]) => Promise<Session>
  private readonly dispose: (session: Session) => Promise<void>
  private readonly hasWebGPU: boolean

  constructor(
    create: (providers: ExecutionProvider[]) => Promise<Session>,
    dispose: (session: Session) => Promise<void>,
    hasWebGPU: boolean = webGPUAvailable(),
  ) {
    this.create = create
    this.dispose = dispose
    this.hasWebGPU = hasWebGPU
  }

  private getSession(): Promise<Session> {
    if (!this.sessionPromise) {
      this.sessionPromise = createPreferredSession(async providers => {
        const session = await this.create(providers)
        this.activeProvider = providers[0]
        return session
      }, this.hasWebGPU && !this.webGPUFailed).catch(error => {
        // Avoid caching a rejected session initialization promise.
        this.sessionPromise = undefined
        this.activeProvider = undefined
        throw error
      })
    }
    return this.sessionPromise
  }

  async run<Result>(execute: (session: Session) => Promise<Result>): Promise<Result> {
    const session = await this.getSession()
    try {
      return await execute(session)
    } catch (error) {
      if (this.activeProvider !== "webgpu") throw error

      this.webGPUFailed = true
      console.warn("upscalejs: WebGPU inference failed; retrying with WASM", error)
      try {
        await this.clearSession()
      } catch (releaseError) {
        // Failure to release a bad GPU session must not prevent WASM recovery.
        console.warn("upscalejs: failed to release WebGPU session", releaseError)
      }
      // Only retry once. WASM errors should reach the caller.
      return execute(await this.getSession())
    }
  }

  private async clearSession(): Promise<void> {
    const pendingSession = this.sessionPromise
    this.sessionPromise = undefined
    this.activeProvider = undefined
    if (pendingSession) await this.dispose(await pendingSession)
  }

  async release(): Promise<void> {
    await this.clearSession()
    this.webGPUFailed = false
  }
}
