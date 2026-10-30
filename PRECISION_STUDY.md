# Precision study (experimental)

Regenerate unquantized FP32 models from the **original** HFA2k and RealESRGAN
weights, plus the original Swin2SR ONNX model. No attempt is made to
reverse the information loss from quantization.

The GitHub Actions workflow "Model precision study" generates:
- FP32 ORT files for all three models (browser candidates);
- FP16 ONNX files (size-only candidates, not GPU-validated);
- side-by-side CPU inference images from the existing UINT8 and FP32 models;
- a size, MAE, PSNR, and CPU timing report.

Download the "fp32-model-comparison" workflow artifact to inspect the outputs.

This experiment intentionally **does not change the shipped UINT8 model files**.
We should not require browsers to download any FP32 files until a user actually
selects that model and variant. CPU timings do not establish WebGPU performance.

Local execution: install PyTorch CPU, onnx, onnxruntime,
onnxconverter-common, numpy, pillow and safetensors, then run:

    python scripts/compare_model_precision.py

Or restrict generation to a single model:

    python scripts/compare_model_precision.py --models HFA2k

## Local browser GPU test (opt-in, no default download changes)

Download and extract the GitHub Actions artifact named fp32-model-comparison.
Copy its models/ tree into public/models/ without removing the UINT8 assets.
For example, from the extracted artifact directory:

    cp -r models/. /path/to/upscalejs/public/models/
    npm run dev

Visit http://localhost:5173/?precision=fp32 and upload an image to test
FP32 WebGPU inference. The unmodified URL continues to use UINT8. The
experiment keeps separate model sessions and never loads both variants just
because they exist in public/. The same API is available to consumers via the
optional precision: "fp32" option; omitting it preserves legacy UINT8 behavior.

Check browser console logs for GPU fallback; seeing an output image alone
does not establish that WebGPU ran, because WASM fallback remains enabled.

## Important: browser-portable ORT export

The first experimental artifact (run 40979957960) was generated with
`ORT_ENABLE_ALL`. That enables the native CPU NCHWc layout optimizer and
serializes `com.microsoft.nchwc:Conv` operators which ONNX Runtime Web does
not register. **Do not use the first artifact for browser inference.**

The updated exporter uses `ORT_ENABLE_BASIC` and rejects generated
`.ort` files containing the `com.microsoft.nchwc` operator domain.
The model-size and CPU timing figures can change when that optimization is
removed. Download the artifact from the latest successful precision-study run.

After extracting the new archive, overwrite the existing files and reload
Chromium with caching disabled. A successful CPU comparison is not a guarantee
of successful WebGPU execution; the browser test still needs to be repeated.
