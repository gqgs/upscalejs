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
