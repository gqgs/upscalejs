/// <reference types="vite/client" />

type OffscreenCanvasRenderingContext2D = CanvasRenderingContext2D

interface OffscreenCanvas {
  width: number
  height: number
  getContext(contextId: "2d", options?: CanvasRenderingContext2DSettings): OffscreenCanvasRenderingContext2D | null
  transferToImageBitmap(): ImageBitmap
}

declare var OffscreenCanvas: {
  prototype: OffscreenCanvas
  new(width: number, height: number): OffscreenCanvas
}
