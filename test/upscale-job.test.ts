import assert from "node:assert/strict"
import { test } from "node:test"
import { runUpscaleJob } from "../src/image/upscale-job.ts"

test("failed inference never renders an upscaled preview or reports success", async () => {
  let rendered = false
  const outcome = await runUpscaleJob(
    async () => { throw new Error("WebGPU inference failed") },
    () => { rendered = true },
    () => { throw new Error("Should not dispose a nonexistent result") },
  )
  assert.deepEqual(outcome, { status: "error", message: "WebGPU inference failed" })
  assert.equal(rendered, false)
})

test("renders a completed result and closes its bitmap before reporting success", async () => {
  const image = { width: 400, height: 400 }
  const steps: string[] = []
  const result = await runUpscaleJob(
    async () => { steps.push("inference"); return image },
    value => { assert.equal(value, image); steps.push("render") },
    value => { assert.equal(value, image); steps.push("dispose") },
  )
  assert.deepEqual(result, { status: "success" })
  assert.deepEqual(steps, ["inference", "render", "dispose"])
})

test("render failures also report errors and dispose successful inference output", async () => {
  let disposed = false
  const result = await runUpscaleJob(
    async () => ({}),
    () => { throw new Error("Could not get output canvas context") },
    () => { disposed = true },
  )
  assert.deepEqual(result, { status: "error", message: "Could not get output canvas context" })
  assert.equal(disposed, true)
})
