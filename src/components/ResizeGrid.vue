<script setup>
</script>

<template>
  <input type="file" accept="image/*" @change="upscale" />
  <canvas ref="resultcanvas" />
</template>

<script lang="ts">
import type { Canvas } from "../types"
import { defineComponent, ref } from "vue"
import { canvasListFromBitmap } from "../image"

const resultcanvas = ref()
const Worker = await import("../image/upscale.worker?worker")
const worker = new Worker.default()
const pending = new Map<number, Canvas>()

const idGen = (): () => number => {
  let i= 0
  return (): number =>  {
    return i++
  }
}

const isImageBitmap = (img: unknown): img is ImageBitmap => {
  const bitmap = img as ImageBitmap
  return bitmap.width > 0 && bitmap.height > 0
}

worker.onmessage = (event: MessageEvent) => {
  const { id, upscaled } = event.data
  if (!isImageBitmap(upscaled)) throw Error("expected upscaled to be an 'ImageBitmap'")
  const canvas = pending.get(id)
  if (!canvas) throw Error("upscaled result is not pending")
  const output = resultcanvas.value as HTMLCanvasElement
  const ctx = output.getContext("2d")
  ctx?.drawImage(upscaled, canvas.x, canvas.y)
  pending.delete(id)
}

const newid = idGen()

const upscale = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files ?? []
  if (files.length === 0) {
    return
  }
  const file = files[0]
  const bitmap = await createImageBitmap(file)
  const output = resultcanvas.value as HTMLCanvasElement
  output.width = bitmap.width * 2
  output.height = bitmap.height * 2
  const canvas_list = canvasListFromBitmap(bitmap)
  canvas_list.forEach(canvas => {
    const id = newid()
    pending.set(id, canvas)
    worker.postMessage({
      id,
      image: canvas.element.getContext("2d")?.getImageData(0, 0, 200, 200),
      denoiseModel: "conservative" // FIXME: should be loaded from options
    })
  })
};

export default defineComponent({
  setup () {
    return {
      files: [],
      upscale,
      resultcanvas,
    }
  }
})
</script>
