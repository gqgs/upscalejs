import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { InferenceSessionWithFallback, type ExecutionProvider } from "../src/image/backend.ts"

type Session = { provider: ExecutionProvider; released: number }
const createMock = () => {
  const created: ExecutionProvider[][] = []
  const sessions: Session[] = []
  const create = async (providers: ExecutionProvider[]): Promise<Session> => {
    created.push(providers)
    const session = { provider: providers[0], released: 0 }
    sessions.push(session)
    return session
  }
  const release = async (session: Session): Promise<void> => { session.released++ }
  return { created, sessions, create, release }
}

test("successful WebGPU inference stays on GPU across tiles", async () => {
  const mocks = createMock()
  const runner = new InferenceSessionWithFallback(mocks.create, mocks.release, true)
  assert.equal(await runner.run(async session => session.provider), "webgpu")
  assert.equal(await runner.run(async session => session.provider), "webgpu")
  assert.deepEqual(mocks.created, [["webgpu", "wasm"]])
  assert.equal(mocks.sessions[0].released, 0)
})

test("OrtRun WebGPU buffer error retries the same tile on WASM, then stays on WASM", async () => {
  const mocks = createMock()
  const attempted: ExecutionProvider[] = []
  const warn = mock.method(console, "warn", () => {})
  try {
    const runner = new InferenceSessionWithFallback(mocks.create, mocks.release, true)
    assert.equal(await runner.run(async session => {
      attempted.push(session.provider)
      if (session.provider === "webgpu") {
        throw new Error("failed to call OrtRun(). All inputs must be tensors on WebGPU buffers.")
      }
      return "generated image tile"
    }), "generated image tile")
    assert.equal(await runner.run(async session => { attempted.push(session.provider); return "next tile" }), "next tile")
    assert.deepEqual(attempted, ["webgpu", "wasm", "wasm"])
    assert.deepEqual(mocks.created, [["webgpu", "wasm"], ["wasm"]])
    assert.equal(mocks.sessions[0].released, 1)
    assert.equal(warn.mock.callCount(), 1)
  } finally { warn.mock.restore() }
})

test("without WebGPU support use WASM exclusively", async () => {
  const mocks = createMock()
  const runner = new InferenceSessionWithFallback(mocks.create, mocks.release, false)
  assert.equal(await runner.run(async session => session.provider), "wasm")
  assert.deepEqual(mocks.created, [["wasm"]])
})

test("initialization failure uses WASM without reattempting WebGPU", async () => {
  const mocks = createMock()
  const warn = mock.method(console, "warn", () => {})
  try {
    const runner = new InferenceSessionWithFallback(async providers => {
      if (providers[0] === "webgpu") {
        mocks.created.push(providers)
        throw new Error("no adapter")
      }
      return mocks.create(providers)
    }, mocks.release, true)
    assert.equal(await runner.run(async session => session.provider), "wasm")
    assert.deepEqual(mocks.created, [["webgpu", "wasm"], ["wasm"]])
  } finally { warn.mock.restore() }
})

test("WASM inference failure propagates without retries", async () => {
  const mocks = createMock()
  const runner = new InferenceSessionWithFallback(mocks.create, mocks.release, false)
  await assert.rejects(runner.run(async () => { throw new Error("invalid model output") }), /invalid model output/)
  assert.deepEqual(mocks.created, [["wasm"]])
})

test("WASM retry failure propagates instead of substituting an interpolated image", async () => {
  const mocks = createMock()
  const warn = mock.method(console, "warn", () => {})
  try {
    const runner = new InferenceSessionWithFallback(mocks.create, mocks.release, true)
    await assert.rejects(runner.run(async session => {
      throw new Error(session.provider === "webgpu" ? "GPU failed" : "WASM failed")
    }), /WASM failed/)
    assert.deepEqual(mocks.created, [["webgpu", "wasm"], ["wasm"]])
  } finally { warn.mock.restore() }
})

test("release frees the fallback session and allows retrying WebGPU on a later request", async () => {
  const mocks = createMock()
  const warn = mock.method(console, "warn", () => {})
  try {
    const runner = new InferenceSessionWithFallback(mocks.create, mocks.release, true)
    await runner.run(async session => {
      if (session.provider === "webgpu") throw new Error("GPU failed")
      return null
    })
    await runner.release()
    assert.equal(mocks.sessions[1].released, 1)
    assert.equal(await runner.run(async session => session.provider), "webgpu")
    assert.deepEqual(mocks.created, [["webgpu", "wasm"], ["wasm"], ["webgpu", "wasm"]])
  } finally { warn.mock.restore() }
})
