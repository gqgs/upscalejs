import { createCanvas } from "canvas";
import type { Canvas as NodeCanvas } from "canvas"

export interface ImageSource {
  width: number;
  height: number;
}

export interface Canvas {
  x: number;
  y: number;
  element: NodeCanvas;
}

export const canvasListFromImageData = (image: ImageSource): Canvas[] => {
  if (image.width == 200 && image.height == 200) {
    // fast path for best case
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext("2d")?.drawImage(image, 0, 0, 200, 200);
    return [
      {
        x: 0,
        y: 0,
        element: canvas,
      },
    ];
  }

  const canvas_list: Canvas[] = [];
  const width = Math.ceil(image.width / 200) * 200;
  const height = Math.ceil(image.height / 200) * 200;
  for (let x = 0; x < width; x += 180) {
    for (let y = 0; y < height; y += 180) {
      const canvas = createCanvas(200, 200);

      let sx = x, sy = y;
      if (x + 200 > image.width) {
        const padding = width - image.width;
        sx -= padding;
      }
      if (y + 200 > image.height) {
        const padding = height - image.height;
        sy -= padding;
      }

      canvas.getContext("2d")?.drawImage(image, sx, sy, 200, 200, 0, 0, 200, 200);
      canvas_list.push({
        x: sx * 2,
        y: sy * 2,
        element: canvas,
      });
    }
  }
  return canvas_list;
};

export default {
  canvasListFromImageData,
};
