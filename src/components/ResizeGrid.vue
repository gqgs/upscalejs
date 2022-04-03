<script setup>
</script>

<template>
  <div class="columns is-inline-flex mt-5">
      <div class="file is-medium is-12 column">
      <label class="file-label">
        <input class="file-input" type="file" name="resume" @change="handleChange" :disabled="upscaling">
        <span class="file-cta">
          <ion-icon name="images-outline"></ion-icon>
          <span class="file-label ml-3">
            <template v-if="upscaling">Upscaling...</template>
            <template v-else>Upscale image</template>
          </span>
        </span>
      </label>
    </div>
  </div>

  <div class="columns">
    <div class="is-12 column">
      <img v-if="input" class="px-2" :src="input">
      <canvas class="px-2" ref="resultcanvas" />
    </div>
  </div>

  <div class="columns">
    <div class="is-1 column"></div>
     <div class="is-10 column"><progress v-if="upscaling" class="progress" max="100"></progress></div>
     <div class="is-1 column"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue"
import { UpscaleWorker } from "../image/worker"

const upscaling = ref(false)
const input = ref("")
const resultcanvas = ref()
const upscaler = new UpscaleWorker()

const handleChange = async (event: Event) => {
  const files = (event.target as HTMLInputElement).files ?? []
  if (files.length === 0) {
    return
  }
  upscaling.value = true
  const file = files[0]
  const bitmap = await createImageBitmap(file)
  input.value = URL.createObjectURL(file)
  const result = await upscaler.upscale(bitmap)
  const canvas = resultcanvas.value as HTMLCanvasElement
  canvas.width = result.width
  canvas.height = result.height
  canvas.getContext("bitmaprenderer")?.transferFromImageBitmap(result)
  upscaler.terminate()
  upscaling.value = false
};

export default defineComponent({
  setup () {
    return {
      input,
      handleChange,
      resultcanvas,
      upscaling,
    }
  }
})
</script>
