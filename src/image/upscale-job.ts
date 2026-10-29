export type UpscaleJobResult = { status: "success" } | { status: "error"; message: string }

/** Only render a completed model result; never substitute a resized input as success. */
export const runUpscaleJob = async <T>(
  infer: () => Promise<T>,
  render: (result: T) => void,
  dispose: (result: T) => void,
): Promise<UpscaleJobResult> => {
  try {
    const result = await infer()
    try { render(result) } finally { dispose(result) }
    return { status: "success" }
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) }
  }
}
