<script setup>
</script>

<template>
  <div class="columns is-centered pt-6 pb-4 is-mobile">
      <div class="is-6 column has-text-right">
        <div class="dropdown" :class="{'is-active': active}">
          <div class="dropdown-trigger">
            <button class="is-medium button is-white" aria-haspopup="true" aria-controls="dropdown-menu" @click="active = !active">
              <span>{{model}}</span>
              <span class="icon is-small">
                <ion-icon name="chevron-down-outline"></ion-icon>
              </span>
            </button>
          </div>
          <div class="dropdown-menu" id="dropdown-menu" role="menu">
            <div class="dropdown-content has-text-centered">
              <a href="#" :key='value' v-for="value in models" @click.prevent="model = value; active = false" class="dropdown-item">
              {{value}}
              </a>
            </div>
          </div>
        </div>
      </div>
      <div class="file is-white is-medium is-6 column" @dragenter.prevent @dragover.prevent @drop.prevent="handleDrop">
      <label class="file-label is-justify-content-flex-start">
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
  <div v-if="upscaling || done" class="columns is-centered" :class="{'done': done}">
    <div class="is-4 column">
      <div :class="[done ? 'is-success':'is-info']" class="notification is-link is-size-3 has-text-weight-bold">
        <span v-if="done">Done!</span>
        <span v-else>Upscaling. Please wait...</span>
      </div>
    </div>
  </div>
  <div class="columns">
     <div class="is-10 is-offset-1 column"><progress v-if="upscaling" class="progress" max="100"></progress></div>
  </div>
</template>

<style scoped>
.done {
  animation: done 3s forwards;
  animation-iteration-count: 1;
}

@keyframes done {
    from { opacity: 100%; }
    50% { opacity: 100%; }
    to { opacity: 0%; }
}
</style>


<script lang="ts">
import { defineComponent, ref } from "vue"
import { UpscaleWorker } from "../image/worker"

const models = ["no-denoise", "conservative", "denoise1x", "denoise2x", "denoise3x"]
const model = "conservative"
const upscaling = ref(false)
const active = ref(false)
const done = ref(false)
const input = ref("")
const resultcanvas = ref()

const handleDrop = (event: DragEvent) => {
  upscale(event.dataTransfer?.files)
}

const handleChange = (event: Event) => {
  upscale((event.target as HTMLInputElement).files)
};

const createImagePreview = (bitmap: ImageBitmap) => {
  const canvas = resultcanvas.value as HTMLCanvasElement
  canvas.width = bitmap.width * 2
  canvas.height = bitmap.height * 2
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
}

const upscale = async (files?: FileList | null) => {
  if (!files || files.length === 0) {
    return
  }
  const upscaler = new UpscaleWorker({
    base: import.meta.env.BASE_URL,
    denoiseModel: model,
  })
  try {
    upscaling.value = true
    done.value = false
    const file = files[0]
    const bitmap = await createImageBitmap(file)
    createImagePreview(bitmap)
    input.value = URL.createObjectURL(file)
    const result = await upscaler.upscale(bitmap)
    const canvas = resultcanvas.value as HTMLCanvasElement
    canvas.getContext("2d")?.drawImage(result, 0, 0, result.width, result.height)
  } finally {
    upscaler.terminate()
    upscaling.value = false
    done.value = true
  }
}

export default defineComponent({
  setup () {
    return {
      input,
      handleChange,
      resultcanvas,
      upscaling,
      models,
      model,
      active,
      handleDrop,
      done,
    }
  }
})
</script>
