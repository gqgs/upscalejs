<script setup>
</script>

<template>
  <input type="file" accept="image/*" @change="handleChange" />
  <canvas ref="resultcanvas" />
</template>

<script lang="ts">
import { defineComponent, ref } from "vue"
import { Upscaler } from "../image"

const resultcanvas = ref()
const upscaler = new Upscaler()

const handleChange = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files ?? []
  if (files.length === 0) {
    return
  }
  const file = files[0]
  const bitmap = await createImageBitmap(file)
  const result = await upscaler.upscale(bitmap)
  const canvas = resultcanvas.value as HTMLCanvasElement
  canvas.width = result.width
  canvas.height = result.height
  canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(result)
};

export default defineComponent({
  setup () {
    return {
      handleChange,
      resultcanvas,
    }
  }
})
</script>
