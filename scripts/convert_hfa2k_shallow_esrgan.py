import json
import os
import struct
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from onnxruntime.quantization import QuantType, quantize_dynamic


def make_layer(block, n_layers):
    layers = []
    for _ in range(n_layers):
        layers.append(block())
    return nn.Sequential(*layers)


def load_safetensors(path):
    dtype_map = {
        "F32": np.float32,
    }
    with open(path, "rb") as file:
        header_size = struct.unpack("<Q", file.read(8))[0]
        header = json.loads(file.read(header_size))
        data_start = 8 + header_size
        tensors = {}
        for key, info in header.items():
            if key == "__metadata__":
                continue
            dtype = dtype_map.get(info["dtype"])
            if dtype is None:
                raise ValueError(f"Unsupported safetensors dtype for {key}: {info['dtype']}")
            start, end = info["data_offsets"]
            file.seek(data_start + start)
            array = np.frombuffer(file.read(end - start), dtype=dtype).reshape(info["shape"]).copy()
            tensors[key] = torch.from_numpy(array)
        return tensors


class ResidualDenseBlock5C(nn.Module):
    def __init__(self, nf=64, gc=32, bias=True):
        super().__init__()
        self.conv1 = nn.Sequential(nn.Conv2d(nf, gc, 3, 1, 1, bias=bias), nn.LeakyReLU(0.2))
        self.conv2 = nn.Sequential(nn.Conv2d(nf + gc, gc, 3, 1, 1, bias=bias), nn.LeakyReLU(0.2))
        self.conv3 = nn.Sequential(nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1, bias=bias), nn.LeakyReLU(0.2))
        self.conv4 = nn.Sequential(nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1, bias=bias), nn.LeakyReLU(0.2))
        self.conv5 = nn.Sequential(nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1, bias=bias))

    def forward(self, x):
        x1 = self.conv1(x)
        x2 = self.conv2(torch.cat((x, x1), 1))
        x3 = self.conv3(torch.cat((x, x1, x2), 1))
        x4 = self.conv4(torch.cat((x, x1, x2, x3), 1))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.RDB1 = ResidualDenseBlock5C(nf, gc)
        self.RDB2 = ResidualDenseBlock5C(nf, gc)
        self.RDB3 = ResidualDenseBlock5C(nf, gc)

    def forward(self, x):
        out = self.RDB1(x)
        out = self.RDB2(out)
        out = self.RDB3(out)
        return out * 0.2 + x


class ShortcutBlock(nn.Module):
    def __init__(self, submodule):
        super().__init__()
        self.sub = submodule

    def forward(self, x):
        return x + self.sub(x)


class HFA2kShallowESRGAN(nn.Module):
    def __init__(self, in_nc=3, out_nc=3, nf=64, nb=6, gc=32):
        super().__init__()
        self.model = nn.Sequential(
            nn.Conv2d(in_nc * 4, nf, 3, 1, 1, bias=True),
            ShortcutBlock(nn.Sequential(
                *make_layer(lambda: RRDB(nf, gc), nb),
                nn.Conv2d(nf, nf, 3, 1, 1, bias=True),
            )),
            nn.Upsample(scale_factor=2, mode="nearest"),
            nn.Conv2d(nf, nf, 3, 1, 1, bias=True),
            nn.LeakyReLU(0.2),
            nn.Upsample(scale_factor=2, mode="nearest"),
            nn.Conv2d(nf, nf, 3, 1, 1, bias=True),
            nn.LeakyReLU(0.2),
            nn.Conv2d(nf, nf, 3, 1, 1, bias=True),
            nn.LeakyReLU(0.2),
            nn.Conv2d(nf, out_nc, 3, 1, 1, bias=True),
        )

    def forward(self, x):
        x = F.pixel_unshuffle(x, 2)
        return self.model(x)


def convert_hfa2k_shallow_esrgan():
    model_path = "scripts/models/2xHFA2kShallowESRGAN.safetensors"
    model_name = "2xHFA2kShallowESRGAN_uint8"
    raw_onnx = f"public/models/HFA2k/{model_name}_raw.onnx"
    uint8_onnx = f"public/models/HFA2k/{model_name}.onnx"

    model = HFA2kShallowESRGAN()
    state_dict = load_safetensors(model_path)
    model.load_state_dict(state_dict, strict=True)
    model.eval()

    dummy_input = torch.randn(1, 3, 256, 256)
    torch.onnx.export(
        model,
        dummy_input,
        raw_onnx,
        opset_version=18,
        input_names=["input"],
        output_names=["output"],
        dynamo=False,
    )

    print("Generating UINT8 version for 2xHFA2kShallowESRGAN...")
    quantize_dynamic(
        model_input=raw_onnx,
        model_output=uint8_onnx,
        weight_type=QuantType.QUInt8,
        per_channel=False,
        reduce_range=False,
    )
    for artifact in (raw_onnx, f"{raw_onnx}.data"):
        if os.path.exists(artifact):
            os.remove(artifact)

    print("Converting 2xHFA2kShallowESRGAN to ORT format...")
    import onnxruntime.tools.convert_onnx_models_to_ort as ort_convert

    ort_convert.convert_onnx_models_to_ort(
        Path(uint8_onnx),
        output_dir=Path(os.path.dirname(uint8_onnx)),
        optimization_styles=[ort_convert.OptimizationStyle.Fixed],
    )
    if os.path.exists(uint8_onnx):
        os.remove(uint8_onnx)
    operators_config = f"public/models/HFA2k/{model_name}.required_operators.config"
    if os.path.exists(operators_config):
        os.remove(operators_config)


if __name__ == "__main__":
    os.makedirs("public/models/HFA2k", exist_ok=True)
    convert_hfa2k_shallow_esrgan()
    print("Done 2xHFA2kShallowESRGAN!")
