#!/usr/bin/env python3
"""Regenerate unquantized super-resolution models and compare against shipped UINT8 ORT."""
import argparse
import json
import math
import shutil
import statistics
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
import onnx
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
CONFIG = {
    "HFA2k": ("HFA2k/2xHFA2kShallowESRGAN_fp32.onnx", "HFA2k/2xHFA2kShallowESRGAN_uint8.ort"),
    "RealESRGAN": ("RealESRGAN/RealESRGAN_x4plus_anime_6B_fp32.onnx", "RealESRGAN/RealESRGAN_x4plus_anime_6B_uint8.ort"),
    "Swin2SR": ("Swin2SR/swin2SR_fp32.onnx", "Swin2SR/swin2SR_uint8.ort"),
}


def generate_fp32(name: str, output: Path) -> Path:
    path = output / CONFIG[name][0]
    path.parent.mkdir(parents=True, exist_ok=True)
    if name == "Swin2SR":
        shutil.copyfile(ROOT / "scripts/models/swin2SR.onnx", path)
    else:
        import torch
        if name == "HFA2k":
            from convert_hfa2k_shallow_esrgan import HFA2kShallowESRGAN, load_safetensors
            model = HFA2kShallowESRGAN().eval()
            model.load_state_dict(
                load_safetensors(ROOT / "scripts/models/2xHFA2kShallowESRGAN.safetensors"),
                strict=True,
            )
        else:
            from convert_realesrgan import RRDBNet
            model = RRDBNet(in_nc=3, out_nc=3, nf=64, nb=6, gc=32, upscale=4).eval()
            weights = torch.load(
                ROOT / "scripts/models/RealESRGAN_x4plus_anime_6B.pth",
                map_location="cpu", weights_only=True,
            )
            model.load_state_dict(weights.get("params_ema", weights.get("params", weights)), strict=True)
        torch.onnx.export(
            model, torch.randn(1, 3, 256, 256), str(path),
            opset_version=18, input_names=["input"], output_names=["output"],
            dynamo=False,
        )
    return path


def save_ort(raw: Path) -> Path:
    destination = raw.with_suffix(".ort")
    opt = ort.SessionOptions()
    opt.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opt.add_session_config_entry("session.save_model_format", "ORT")
    opt.optimized_model_filepath = str(destination)
    ort.InferenceSession(str(raw), sess_options=opt, providers=["CPUExecutionProvider"])
    if not destination.is_file():
        raise RuntimeError("ORT serialization failed: " + str(destination))
    return destination


def save_fp16(raw: Path) -> Path | None:
    try:
        from onnxconverter_common.float16 import convert_float_to_float16
        dest = raw.with_name(raw.stem.replace("_fp32", "_fp16") + ".onnx")
        onnx.save(
            convert_float_to_float16(
                onnx.load(str(raw)), keep_io_types=True, disable_shape_infer=True,
            ),
            str(dest),
        )
        return dest
    except Exception as exc:
        print(f"Optional FP16 conversion failed for {raw}: {exc}", flush=True)
        return None


def input_image(sess: ort.InferenceSession, sample: Image.Image) -> np.ndarray:
    shape = sess.get_inputs()[0].shape
    if len(shape) != 4 or (isinstance(shape[1], int) and shape[1] != 3):
        raise ValueError(f"Expected NCHW RGB input, got {shape}")
    # Symbolic channel counts are valid in the original Swin2SR graph; the
    # bundled sample is explicitly converted to 3-channel RGB above.
    height = shape[2] if isinstance(shape[2], int) and shape[2] > 0 else 64
    width = shape[3] if isinstance(shape[3], int) and shape[3] > 0 else 64
    arr = np.asarray(sample.resize((width, height), Image.Resampling.BICUBIC), dtype=np.float32)
    return arr.transpose(2, 0, 1)[None] / 255.0


def predict(sess: ort.InferenceSession, data: np.ndarray) -> tuple[np.ndarray, float]:
    feed = {sess.get_inputs()[0].name: data}
    sess.run(None, feed)  # warm up
    durations = []
    for _ in range(2):
        start = time.perf_counter()
        result = sess.run(None, feed)[0]
        durations.append(1000 * (time.perf_counter() - start))
    result = np.asarray(result, dtype=np.float32)
    if not np.isfinite(result).all():
        raise RuntimeError("NaN or Inf in output")
    return result, statistics.median(durations)


def output_png(arr: np.ndarray, path: Path) -> Image.Image:
    if len(arr.shape) != 4 or arr.shape[0] != 1 or arr.shape[1] != 3:
        raise RuntimeError(f"Unexpected output shape: {arr.shape}")
    pixels = np.clip(np.rint(arr[0].transpose(1, 2, 0) * 255.0), 0, 255).astype("uint8")
    image = Image.fromarray(pixels, "RGB")
    image.save(path)
    return image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="precision-study")
    parser.add_argument("--models", nargs="+", choices=CONFIG.keys(), default=list(CONFIG))
    args = parser.parse_args()
    output = ROOT / args.output
    folder = output / "models"
    folder.mkdir(parents=True, exist_ok=True)
    sample = Image.open(ROOT / "src/assets/sample.png").convert("RGB")
    summary = []
    for name in args.models:
        print(f"Generating FP32 model for {name}", flush=True)
        raw = generate_fp32(name, folder)
        float_model = save_ort(raw)
        fp16_model = save_fp16(raw)
        quant_model = ROOT / "public/models" / CONFIG[name][1]
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        fp_sess = ort.InferenceSession(str(float_model), sess_options=opts, providers=["CPUExecutionProvider"])
        q_sess = ort.InferenceSession(str(quant_model), sess_options=opts, providers=["CPUExecutionProvider"])
        inp = input_image(q_sess, sample)
        q_out, q_ms = predict(q_sess, inp)
        f_out, f_ms = predict(fp_sess, inp)
        if q_out.shape != f_out.shape:
            raise RuntimeError(f"Output shape mismatch for {name}: {q_out.shape} != {f_out.shape}")
        diff = q_out.astype("float64") - f_out.astype("float64")
        mae = float(np.mean(np.abs(diff)))
        rmse = float(np.sqrt(np.mean(diff * diff)))
        disp_diff = np.clip(q_out, 0, 1).astype("float64") - np.clip(f_out, 0, 1).astype("float64")
        disp_rmse = float(np.sqrt(np.mean(disp_diff * disp_diff)))
        psnr = -20 * math.log10(disp_rmse) if disp_rmse > 0 else None
        images = output / "images" / name
        images.mkdir(parents=True, exist_ok=True)
        qi = output_png(q_out, images / "uint8.png")
        fi = output_png(f_out, images / "fp32.png")
        side = Image.new("RGB", (qi.width + fi.width, max(qi.height, fi.height) + 24), "white")
        side.paste(qi, (0, 24))
        side.paste(fi, (qi.width, 24))
        draw = ImageDraw.Draw(side)
        draw.text((5, 5), "UINT8 CPU", fill="black")
        draw.text((qi.width + 5, 5), "FP32 CPU", fill="black")
        side.save(images / "side-by-side.png")
        row = {
            "model": name,
            "uint8_ort_bytes": quant_model.stat().st_size,
            "fp32_ort_bytes": float_model.stat().st_size,
            "fp32_onnx_bytes": raw.stat().st_size,
            "fp16_onnx_bytes": fp16_model.stat().st_size if fp16_model else None,
            "output_mae": mae,
            "output_rmse": rmse,
            "display_psnr_db": psnr,
            "uint8_cpu_median_ms": round(q_ms, 2),
            "fp32_cpu_median_ms": round(f_ms, 2),
            "input_shape": list(inp.shape),
            "output_shape": list(q_out.shape),
        }
        summary.append(row)
        print(json.dumps(row, indent=2), flush=True)
        # The optimized ORT file is what the browser loads; do not duplicate the
        # much larger raw FP32 ONNX export inside the downloadable artifact.
        raw.unlink()

    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    mib = lambda n: f"{n / (1024 * 1024):.2f}" if n is not None else "n/a"
    lines = [
        "# FP32 vs UINT8 comparison", "",
        "Reference: the sample image in this repository, using Python ONNX Runtime CPU.",
        "FP16 is size-only (no FP16 inference tested). CPU times are runner-specific, not WebGPU times.",
        "Image quality metrics describe the difference between UINT8 and FP32, not ground-truth fidelity.", "",
        "| Model | UINT8 ORT (MiB) | FP32 ORT (MiB) | FP16 ONNX (MiB) | FP32/UINT8 | MAE | PSNR (dB) | UINT8 CPU ms | FP32 CPU ms |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for item in summary:
        lines.append(
            f"| {item['model']} | {mib(item['uint8_ort_bytes'])} | {mib(item['fp32_ort_bytes'])} | "
            f"{mib(item['fp16_onnx_bytes'])} | {item['fp32_ort_bytes'] / item['uint8_ort_bytes']:.2f}x | "
            f"{item['output_mae']:.5f} | {item['display_psnr_db']:.2f} | "
            f"{item['uint8_cpu_median_ms']:.1f} | {item['fp32_cpu_median_ms']:.1f} |"
        )
    lines += ["", "Inspect images/<model>/side-by-side.png and models/<model>/*_fp32.ort in the workflow artifact."]
    (output / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)


if __name__ == "__main__":
    main()
