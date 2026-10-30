"""Quality heuristics for optional local VLM fallback."""

from __future__ import annotations

from document_processing.models import DocumentResult, ProcessingStatus


def needs_visual_fallback(result: DocumentResult, *, is_image: bool = False) -> bool:
    """Return True when primary OCR/native extraction looks insufficient.

    VLM is never the primary path — only a modular fallback for difficult
    visual content (handwriting, drawings, charts, photographs).
    """
    text = (result.full_text or "").strip()
    warnings = result.processing_metadata.warnings or []

    if result.processing_status == ProcessingStatus.FAILED:
        return False

    if not is_image:
        # For non-image docs, only escalate when content is empty/partial
        return result.processing_status == ProcessingStatus.PARTIAL and not text

    if "no_ocr_text_detected" in warnings:
        return True

    if not text:
        return True

    # Very short OCR on an image often indicates handwriting/drawings/charts
    if len(text) < 40:
        return True

    # Low mean OCR confidence across pages
    confidences: list[float] = []
    for page in result.pages:
        mean_c = page.metadata.get("mean_confidence") or page.metadata.get(
            "ocr_mean_confidence"
        )
        if isinstance(mean_c, (int, float)):
            confidences.append(float(mean_c))
        for el in page.elements:
            if el.confidence is not None:
                confidences.append(float(el.confidence))
    if confidences and (sum(confidences) / len(confidences)) < 0.55:
        return True

    return False
