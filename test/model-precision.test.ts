import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveOptions } from "../src/image/options.ts"
import { getModelConfig } from "../src/image/model-config.ts"

test("legacy defaults stay on UINT8", () => {
  assert.equal(resolveOptions().precision, "uint8")
  assert.equal(getModelConfig("6B", "https://example.test/assets").path,
    "https://example.test/assets/models/RealESRGAN/RealESRGAN_x4plus_anime_6B_uint8.ort")
})

test("FP32 is strictly opt-in and resolves each original model path", () => {
  assert.equal(resolveOptions({ precision: "fp32" }).precision, "fp32")
  assert.deepEqual(
    ["6B", "HFA2kShallowESRGAN", "Swin2SR"].map(name => {
      return getModelConfig(name as "6B" | "HFA2kShallowESRGAN" | "Swin2SR", "/", "fp32").path
    }),
    [
      "/models/RealESRGAN/RealESRGAN_x4plus_anime_6B_fp32.ort",
      "/models/HFA2k/2xHFA2kShallowESRGAN_fp32.ort",
      "/models/Swin2SR/swin2SR_fp32.ort",
    ],
  )
})

test("tile dimensions are independent of precision", () => {
  for (const model of ["6B", "HFA2kShallowESRGAN", "Swin2SR"] as const) {
    const q = getModelConfig(model, "/", "uint8")
    const f = getModelConfig(model, "/", "fp32")
    assert.equal(q.tileSize, f.tileSize)
    assert.equal(q.upscaleFactor, f.upscaleFactor)
  }
})
