<template>
  <div class="columns is-centered pt-6 pb-4 is-mobile">
      <div class="is-narrow column">
        <div class="dropdown" :class="{'is-active': active}">
          <div class="dropdown-trigger">
            <button class="is-medium button has-background-white-ter" aria-haspopup="true" aria-controls="dropdown-menu" @click="active = !active">
              <span>{{model}}</span>
              <span class="icon is-small">
                <ion-icon name="chevron-down-outline"></ion-icon>
              </span>
            </button>
          </div>
          <div class="dropdown-menu" id="dropdown-menu" role="menu">
            <div class="dropdown-content">
              <a href="#" :key='value' v-for="value in models" @click.prevent="model = value; active = false" class="dropdown-item">
              {{value}}
              </a>
            </div>
          </div>
        </div>
      </div>
      <div class="file is-white-ter is-medium column is-narrow" @dragenter.prevent @dragover.prevent @drop.prevent="handleDrop">
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
    <div class="is-narrow column is-size-3">
    <a href="https://github.com/gqgs/upscalejs" target="_blank">
    <ion-icon class="pt-3" id="github" name="logo-octocat"></ion-icon>
    </a>
    </div>
  </div>
  <div class="columns is-centered">
    <div v-show="input" class="is-12 column">
      <img class="px-2" :src="input">
      <canvas v-show="hasResult" class="px-2" ref="resultcanvas" />
    </div>
    <div v-if="!input" class="is-6 column notification is-link is-light is-size-5">
      Upload an image using the button above to upscale it using the selected model.
    </div>
  </div>
  <div v-if="errorMessage" class="columns is-centered" role="alert">
    <div class="is-10 column">
      <div class="notification is-danger is-light">Upscaling failed: {{ errorMessage }}</div>
    </div>
  </div>
  <div v-if="upscaling || done" class="columns is-centered" :class="{'done': done}">
    <div class="is-4 column">
      <div :class="[done ? 'is-success':'is-info']" class="notification is-link is-size-4 has-text-weight-bold">
        <span v-if="done">Done!</span>
        <span v-else>Upscaling. Please wait...</span>
      </div>
    </div>
  </div>
  <div class="columns">
     <div class="is-10 is-offset-1 column"><progress v-if="upscaling" class="progress" max="100" :value="progress"></progress></div>
  </div>
</template>

<style scoped>
@media (prefers-color-scheme: dark) {
  #github {
    color: white;
  }
}

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


<script setup lang="ts">
import { ref, watch } from "vue"
import { Upscaler } from "../image/worker"
import { runUpscaleJob } from "../image/upscale-job"
import type { Model } from "../image/options"

const models: Model[] = ["6B", "HFA2kShallowESRGAN", "Swin2SR"]
const storedModel = localStorage.getItem("model")
const model = ref<Model>(
  storedModel === "6B" || storedModel === "HFA2kShallowESRGAN" || storedModel === "Swin2SR" ? storedModel : "HFA2kShallowESRGAN"
)
const upscaling = ref(false)
const active = ref(false)
const done = ref(false)
const hasResult = ref(false)
const errorMessage = ref("")
const input = ref("")
const progress = ref(0)
const resultcanvas = ref()

const handleDrop = (event: DragEvent) => {
  upscale(event.dataTransfer?.files)
}

const handleChange = (event: Event) => {
  upscale((event.target as HTMLInputElement).files)
};

const upscale = async (files?: FileList | null) => {
  if (!files || files.length === 0 || upscaling.value) return

  upscaling.value = true
  done.value = false
  hasResult.value = false
  errorMessage.value = ""
  progress.value = 0

  const canvas = resultcanvas.value as HTMLCanvasElement
  canvas.width = 0
  canvas.height = 0

  const file = files[0]
  input.value = URL.createObjectURL(file)
  const upscaler = new Upscaler({
    model: model.value,
    base: new URL(import.meta.env.BASE_URL, window.location.origin).href,
  })
  let sourceBitmap: ImageBitmap | undefined

  try {
    sourceBitmap = await createImageBitmap(file)
    const bitmap = sourceBitmap
    const outcome = await runUpscaleJob(
      () => upscaler.upscale(bitmap, {
        model: model.value,
        onProgress: percent => { progress.value = percent },
      }),
      result => {
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Could not get output canvas context")
        canvas.width = result.width
        canvas.height = result.height
        ctx.drawImage(result, 0, 0)
        hasResult.value = true
      },
      result => result.close(),
    )
    if (outcome.status === "error") throw new Error(outcome.message)
    done.value = true
  } catch (error) {
    console.error("upscalejs: upscaling failed", error)
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    sourceBitmap?.close()
    upscaler.terminate()
    upscaling.value = false
  }
}

watch(input, (_, old_input) => {
  URL.revokeObjectURL(old_input)
})

watch(model, (nextModel) => {
  localStorage.setItem("model", nextModel)
})
</script>
