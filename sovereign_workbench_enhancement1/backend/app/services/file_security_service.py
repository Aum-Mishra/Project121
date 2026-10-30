import os
import shutil
import uuid
from pathlib import Path
from typing import Tuple, Optional, Set
from app.core.logging import get_logger
from app.core.exceptions import WorkbenchException

logger = get_logger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
QUARANTINE_DIR = BACKEND_DIR / "data" / "quarantine"
SAFE_CHAT_DIR = BACKEND_DIR / "chat_uploads"
SAFE_KNOWLEDGE_DIR = BACKEND_DIR / "uploads"

QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
SAFE_CHAT_DIR.mkdir(parents=True, exist_ok=True)
SAFE_KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

BLOCKED_EXTENSIONS: Set[str] = {
    ".exe", ".dll", ".bat", ".cmd", ".sh", ".bash", ".vbs", ".ps1",
    ".scr", ".msi", ".bin", ".jar", ".com", ".pif", ".wsf", ".apk",
    ".iso", ".reg"
}

ALLOWED_EXTENSIONS: Set[str] = {
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
    ".csv", ".tsv", ".txt", ".md", ".json", ".xml", ".yaml", ".yml",
    ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"
}

MAGIC_SIGNATURES = {
    "pdf": [b"%PDF-"],
    "zip_office": [b"PK\x03\x04"],  # docx, xlsx, pptx are zip archives
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpeg": [b"\xff\xd8\xff"],
}


class FileSecurityValidator:
    @staticmethod
    def validate_filename_and_ext(filename: str) -> Tuple[bool, str, str]:
        ext = os.path.splitext(filename)[1].lower()
        if not ext:
            return False, "Files must have a valid file extension.", ext
        if ext in BLOCKED_EXTENSIONS:
            return False, f"Prohibited executable or script extension: {ext}", ext
        if ext not in ALLOWED_EXTENSIONS:
            return False, f"Unsupported file extension: {ext}. Allowed: PDF, Office, Text, Data, Images.", ext
        return True, "Valid extension", ext

    @staticmethod
    def inspect_magic_bytes(file_path: Path, ext: str) -> Tuple[bool, str]:
        try:
            with open(file_path, "rb") as f:
                header = f.read(16)
        except Exception as e:
            return False, f"Could not read file header: {str(e)}"

        # Check for dangerous Windows PE executable signature
        if header.startswith(b"MZ"):
            return False, "Security violation: Windows executable binary (MZ header) detected."

        # Extension-specific signature checks
        if ext == ".pdf":
            if not header.startswith(b"%PDF-"):
                return False, "Invalid PDF: File does not start with PDF magic header %PDF-."
        elif ext in (".docx", ".xlsx", ".pptx"):
            if not header.startswith(b"PK\x03\x04"):
                return False, f"Invalid Office document {ext}: File is not a valid OpenXML/ZIP archive."
        elif ext == ".png":
            if not header.startswith(b"\x89PNG\r\n\x1a\n"):
                return False, "Invalid PNG: PNG signature mismatch."
        elif ext in (".jpg", ".jpeg"):
            if not header.startswith(b"\xff\xd8\xff"):
                return False, "Invalid JPEG: JPEG signature mismatch."

        return True, "Signature verified"

    @classmethod
    def quarantine_and_validate(
        cls,
        raw_bytes: bytes,
        original_filename: str,
        target: str = "chat",  # "chat" or "knowledge"
    ) -> Tuple[str, str, int]:
        """
        Quarantines bytes to disk, runs all security validations, and upon success
        moves the file to safe destination storage. Returns (safe_file_path, extension, file_size).
        """
        size = len(raw_bytes)
        if size == 0:
            raise WorkbenchException("Uploaded file is empty (0 bytes).", status_code=400)
        if size > MAX_FILE_SIZE_BYTES:
            raise WorkbenchException(
                f"File size ({size / (1024*1024):.1f} MB) exceeds maximum allowed limit of 50 MB.",
                status_code=400,
            )

        valid_ext, reason, ext = cls.validate_filename_and_ext(original_filename)
        if not valid_ext:
            logger.warning("file_upload_blocked_ext", filename=original_filename, reason=reason)
            raise WorkbenchException(reason, status_code=400)

        # Stage in quarantine
        file_uuid = uuid.uuid4().hex
        quarantine_file = QUARANTINE_DIR / f"quarantine_{file_uuid}{ext}"
        try:
            with open(quarantine_file, "wb") as f:
                f.write(raw_bytes)

            valid_sig, sig_reason = cls.inspect_magic_bytes(quarantine_file, ext)
            if not valid_sig:
                logger.warning("file_quarantine_failed", filename=original_filename, reason=sig_reason)
                raise WorkbenchException(sig_reason, status_code=400)

            # Move to safe target storage
            dest_dir = SAFE_CHAT_DIR if target == "chat" else SAFE_KNOWLEDGE_DIR
            safe_filename = f"{file_uuid}{ext}"
            safe_file_path = dest_dir / safe_filename
            shutil.move(str(quarantine_file), str(safe_file_path))

            logger.info(
                "file_validated_and_promoted",
                original=original_filename,
                safe_path=str(safe_file_path),
                size=size,
                target=target,
            )
            return str(safe_file_path), ext.lstrip("."), size

        except Exception:
            if quarantine_file.exists():
                quarantine_file.unlink(missing_ok=True)
            raise

