import { describe, expect, it } from "vitest"
import { loadImage } from "canvas"
import  { Upscaler } from "./upscaler"

const timeout = 15000
const upscaler = new Upscaler()

const upscale = (filename: string) => {
  describe(filename, () => {
    it("uspcales image", async () => {
      const img = await loadImage(`./src/node/testdata/${filename}`)
      const result = await upscaler.upscale(img)
      expect(result.width).toEqual(img.width * 2)
      expect(result.height).toEqual(img.height * 2)
    }, timeout)
  })
}

upscale("image_200_200.png")
upscale("image_250_250.jpg")
