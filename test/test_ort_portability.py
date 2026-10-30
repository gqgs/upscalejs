"""Regression guard for CPU-specific ORT layout optimizations in web assets."""

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from compare_model_precision import assert_portable_ort, save_ort


class BrowserPortableModelTests(unittest.TestCase):
    def test_rejects_nonportable_nchwc_operator_domain(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "broken.ort"
            path.write_bytes(b"ORTFMT" + b"com.microsoft.nchwc" + b":Conv")
            with self.assertRaisesRegex(RuntimeError, "non-portable operator"):
                assert_portable_ort(path)

    def test_basic_optimizer_keeps_conv_compatible_with_runtime(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            raw = folder / "test_fp32.onnx"
            input = helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, 8, 8])
            output = helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 4, 8, 8])
            weights = numpy_helper.from_array(np.ones((4, 3, 3, 3), dtype=np.float32), name="weights")
            node = helper.make_node("Conv", ["input", "weights"], ["output"], pads=[1, 1, 1, 1])
            graph = helper.make_graph([node], "portability-test", [input], [output], [weights])
            model = helper.make_model(graph, opset_imports=[helper.make_operatorsetid("", 18)])
            model.ir_version = 10
            onnx.save(model, raw)

            binary = save_ort(raw)
            assert_portable_ort(binary)
            self.assertGreater(binary.stat().st_size, 0)
            runtime = ort.InferenceSession(str(binary), providers=["CPUExecutionProvider"])
            result = runtime.run(None, {"input": np.ones((1, 3, 8, 8), dtype=np.float32)})[0]
            self.assertEqual(tuple(result.shape), (1, 4, 8, 8))


if __name__ == "__main__":
    unittest.main()
