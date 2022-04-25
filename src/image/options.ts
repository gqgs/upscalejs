export type Model = "no-denoise" | "conservative" | "denoise1x" | "denoise2x" | "denoise3x"

export interface Options {
  // Max number of workers that will be created for multiple images.
  maxWorkers?: number;
  // Max number of workers that will be created for each image.
  maxInternalWorkers?: number;
  // The model that will be used for upscaling images.
  denoiseModel?: Model;
  // Environment base url (i.e. root of public path).
  base?: string;
}

export const defaultOptions = {
  maxWorkers: 1,
  maxInternalWorkers: 4,
  denoiseModel: "conservative",
  base: typeof window !== "undefined" ? window.location.href : "./public/",
};

export default {
  defaultOptions,
};
