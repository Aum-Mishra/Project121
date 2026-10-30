import io
import datetime
from typing import Optional
from pathlib import Path
from app.core.logging import get_logger

logger = get_logger(__name__)


class WatermarkService:
    @staticmethod
    def generate_watermark_text(
        user_name: str = "Authorized Personnel",
        company_id: str = "ApexPetro",
        classification: str = "CONFIDENTIAL",
        timestamp: Optional[datetime.datetime] = None,
    ) -> str:
        ts = (timestamp or datetime.datetime.now(datetime.timezone.utc)).strftime("%Y-%m-%d %H:%M UTC")
        return f"{classification.upper()} · {user_name} · {ts} · {company_id}"

    @classmethod
    def apply_pdf_watermark(
        cls,
        pdf_bytes: bytes,
        watermark_text: str,
    ) -> bytes:
        """
        Overlays a diagonal watermark on each page of a PDF using PyMuPDF (fitz) or PyPDF.
        """
        try:
            import fitz
            doc = fitz.open("pdf", pdf_bytes)
            for page in doc:
                rect = page.rect
                # Add watermark diagonal text or header stamp
                page.insert_text(
                    fitz.Point(rect.width * 0.1, rect.height * 0.05),
                    watermark_text,
                    fontsize=9,
                    color=(0.7, 0.2, 0.2),  # Subtle red/grey
                    rotate=0,
                )
                page.insert_text(
                    fitz.Point(rect.width * 0.15, rect.height * 0.5),
                    watermark_text,
                    fontsize=14,
                    color=(0.85, 0.85, 0.85),  # Semi-transparent grey diagonal
                    rotate=45,
                )
            output = io.BytesIO()
            doc.save(output)
            return output.getvalue()
        except Exception as e:
            logger.warning("fitz_watermark_fallback", error=str(e))
            return pdf_bytes

    @classmethod
    def apply_text_watermark(cls, text: str, watermark_text: str) -> str:
        banner = f"--- [SECURITY CLASSIFICATION: {watermark_text}] ---\n"
        footer = f"\n--- [END CLASSIFIED DOCUMENT: {watermark_text}] ---"
        return f"{banner}\n{text}\n{footer}"


watermark_service = WatermarkService()

