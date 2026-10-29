import assert from "node:assert/strict"
import { test, mock } from "node:test"
import { createPreferredSession, webGPUAvailable, type ExecutionProvider } from "../src/image/backend.ts"

test("prefers WebGPU by default while allowing CPU operator fallback", async () => {
  const calls: ExecutionProvider[][] = []
  const session = { backend: "webgpu" }
  const result = await createPreferredSession(async providers => {
    calls.push(providers)
    return session
  }, true)
  assert.equal(result, session)
  assert.deepEqual(calls, [["webgpu", "wasm"]])
})

test("uses WASM directly when WebGPU is unavailable", async () => {
  const calls: ExecutionProvider[][] = []
  await createPreferredSession(async providers => {
    calls.push(providers)
    return {}
  }, false)
  assert.deepEqual(calls, [["wasm"]])
})

test("falls back to WASM when WebGPU session creation fails", async () => {
  const calls: ExecutionProvider[][] = []
  const warning = mock.method(console, "warn", () => {})
  try {
    const session = { backend: "wasm" }
    const result = await createPreferredSession(async providers => {
      calls.push(providers)
      if (providers[0] === "webgpu") throw new Error("adapter rejected")
      return session
    }, true)
    assert.equal(result, session)
    assert.deepEqual(calls, [["webgpu", "wasm"], ["wasm"]])
    assert.equal(warning.mock.callCount(), 1)
  } finally {
    warning.mock.restore()
  }
})

test("does not hide a failure in the WASM fallback", async () => {
  const warning = mock.method(console, "warn", () => {})
  try {
    await assert.rejects(
      createPreferredSession(async providers => {
        throw new Error(providers[0] === "webgpu" ? "GPU error" : "WASM error")
      }, true),
      /WASM error/,
    )
  } finally {
    warning.mock.restore()
  }
})

test("uses feature detection when no capability override is supplied", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { gpu: {} } })
    assert.equal(webGPUAvailable(), true)
    const gpuCalls: ExecutionProvider[][] = []
    await createPreferredSession(async providers => {
      gpuCalls.push(providers)
      return {}
    })
    assert.deepEqual(gpuCalls, [["webgpu", "wasm"]])

    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} })
    assert.equal(webGPUAvailable(), false)
    const wasmCalls: ExecutionProvider[][] = []
    await createPreferredSession(async providers => {
      wasmCalls.push(providers)
      return {}
    })
    assert.deepEqual(wasmCalls, [["wasm"]])
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous)
    else Reflect.deleteProperty(globalThis, "navigator")
  }
})
