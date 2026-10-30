"""Vision package — optional local SmolVLM fallback (Phase 6)."""

from document_processing.vision.quality import needs_visual_fallback
from document_processing.vision.smolvlm_engine import VisionEngine

__all__ = ["VisionEngine", "needs_visual_fallback"]
