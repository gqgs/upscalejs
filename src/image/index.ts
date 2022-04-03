
import type { Canvas } from "../types"

export const canvasListFromBitmap = (bitmap: ImageBitmap): Canvas[] => {
  const canvas_list: Canvas[] = []
  const width = Math.ceil(bitmap.width / 200) * 200
  const height = Math.ceil(bitmap.height / 200) * 200

  for (let x = 0; x < width; x += 200) {
    for (let y = 0; y < height; y += 200) {
      const canvas = document.createElement("canvas")
      canvas.width = 200
      canvas.height = 200
      const ctx = canvas.getContext("2d")
      ctx?.drawImage(bitmap, x, y, 200, 200, 0, 0, 200, 200)
      canvas_list.push({
        x: x * 2,
        y: y * 2,
        element: canvas,
      })
    }
  }
  return canvas_list
}

export default {
  canvasListFromBitmap
}