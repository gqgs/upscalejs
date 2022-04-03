<script setup>
</script>

<template>
  <input type="file" accept="image/*" @change="handleFile" />
  <canvas ref="resultcanvas" width="400" height="400" /> 
</template>

<script lang="ts">
import { defineComponent, ref } from "vue"

const resultcanvas = ref()
const Worker = await import("../image/upscale.worker?worker")
const worker = new Worker.default()

const isImageBitmap = (img: unknown): img is ImageBitmap => {
  const bitmap = img as ImageBitmap
  return bitmap.width > 0 && bitmap.height > 0
}

worker.onmessage = (event: MessageEvent) => {
  const { upscaled } = event.data
  if (!isImageBitmap(upscaled)) throw Error("expected upscaled to be an 'ImageBitmap'")
  const canvas = resultcanvas.value as HTMLCanvasElement
  canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(upscaled)
}

const handleFile = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files ?? []
  if (files.length === 0) {
    return
  }
  const file = files[0]
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  canvas.width = 200
  canvas.height = 200
  const ctx = canvas.getContext("2d")
  ctx?.drawImage(bitmap, 0, 0, 200, 200)
  const image = ctx?.getImageData(0, 0, 200, 200)
  worker.postMessage({
    image,
    denoiseModel: "conservative" // FIXME: should be loaded from options
  })
};

export default defineComponent({
  setup () {
    return {
      files: [],
      handleFile,
      resultcanvas,
    }
  }
})
</script>
