"""Local SmolVLM visual understanding engine (optional Phase 6 fallback).

Primary extraction remains Docling + RapidOCR. This module is lazy-loaded and
must not break the pipeline when torch/transformers/GPU are unavailable.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from document_processing.exceptions import MissingModelError, VisionFailureError

logger = logging.getLogger(__name__)

DEFAULT_PROMPT = (
    "Describe the visible text, labels, readings, and engineering information "
    "in this industrial document image. Preserve numbers and units exactly. "
    "If handwriting is present, transcribe it carefully."
)


class VisionEngine:
    """Optional local visual understanding. Lazy-loads SmolVLM once."""

    def __init__(
        self,
        model_id: Optional[str] = None,
        device: Optional[str] = None,
    ) -> None:
        self.model_id = model_id or "HuggingFaceTB/SmolVLM-500M-Instruct"
        self.device = device
        self._model = None
        self._processor = None
        self._resolved_device: Optional[str] = None

    def _ensure_loaded(self) -> None:
        if self._model is not None and self._processor is not None:
            return
        try:
            import torch
            from transformers import AutoModelForImageTextToText, AutoProcessor
        except ImportError as exc:
            raise MissingModelError(
                "SmolVLM dependencies (torch/transformers) are not available.",
                details={"reason": "ImportError"},
            ) from exc

        if self.device:
            resolved = self.device
        else:
            resolved = "cuda" if torch.cuda.is_available() else "cpu"
        self._resolved_device = resolved

        logger.info("Loading SmolVLM model=%s device=%s", self.model_id, resolved)
        try:
            self._processor = AutoProcessor.from_pretrained(self.model_id)
            dtype = torch.float16 if resolved == "cuda" else torch.float32
            self._model = AutoModelForImageTextToText.from_pretrained(
                self.model_id,
                torch_dtype=dtype,
            )
            self._model = self._model.to(resolved)
            self._model.eval()
        except Exception as exc:
            self._model = None
            self._processor = None
            raise MissingModelError(
                "Failed to load local SmolVLM model.",
                details={"reason": type(exc).__name__, "model_id": self.model_id},
            ) from exc

    def analyze_image(self, image: Any, prompt: Optional[str] = None) -> dict:
        return self.analyze_visual_content(image, context=prompt)

    def analyze_page(
        self, image: Any, page_number: int, prompt: Optional[str] = None
    ) -> dict:
        result = self.analyze_visual_content(
            image, context=prompt or f"Page {page_number}"
        )
        result["page_number"] = page_number
        return result

    def analyze_visual_content(
        self, image: Any, context: Optional[str] = None
    ) -> dict:
        """Run local VLM on a PIL image / RGB array and return structured text."""
        self._ensure_loaded()
        assert self._model is not None and self._processor is not None

        try:
            import torch
            from PIL import Image
        except ImportError as exc:
            raise MissingModelError(
                "Pillow/torch required for SmolVLM.",
                details={"reason": "ImportError"},
            ) from exc

        if not isinstance(image, Image.Image):
            try:
                import numpy as np

                if isinstance(image, np.ndarray):
                    image = Image.fromarray(image)
                else:
                    raise TypeError(type(image).__name__)
            except Exception as exc:
                raise VisionFailureError(
                    "Unsupported image type for SmolVLM.",
                    details={"reason": type(exc).__name__},
                ) from exc

        if image.mode != "RGB":
            image = image.convert("RGB")

        prompt = context or DEFAULT_PROMPT
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        try:
            text_prompt = self._processor.apply_chat_template(
                messages, add_generation_prompt=True
            )
            inputs = self._processor(
                text=text_prompt,
                images=[image],
                return_tensors="pt",
            )
            device = self._resolved_device or "cpu"
            inputs = {
                k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()
            }

            with torch.inference_mode():
                generated = self._model.generate(
                    **inputs,
                    max_new_tokens=256,
                    do_sample=False,
                )

            # Decode only newly generated tokens when possible
            input_len = inputs["input_ids"].shape[-1]
            new_tokens = generated[:, input_len:]
            decoded = self._processor.batch_decode(
                new_tokens, skip_special_tokens=True
            )[0].strip()
        except Exception as exc:
            raise VisionFailureError(
                "SmolVLM inference failed.",
                details={"reason": type(exc).__name__},
            ) from exc

        return {
            "text": decoded,
            "description": decoded,
            "model": self.model_id,
            "device": self._resolved_device,
            "confidence": None,  # never fabricate confidence
        }
