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
