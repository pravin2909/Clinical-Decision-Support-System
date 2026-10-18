"""
Prescription / report OCR using docTR.

docTR (deep-learning OCR) is loaded lazily and cached — the model is heavy, so we
don't pay the import/load cost until the first document is processed, and the
rest of the app starts fine without it. ``extract_text`` returns plain text;
higher layers (the LLM) turn that into a structured medication list, which is
more robust than brittle regex parsing of messy prescription layouts.
"""

from __future__ import annotations

import logging
from functools import lru_cache

log = logging.getLogger("dpt.ocr")


@lru_cache(maxsize=1)
def _predictor():
    """Build and cache the docTR OCR predictor (lazy; downloads weights once)."""
    from doctr.models import ocr_predictor
    return ocr_predictor(pretrained=True)


def ocr_available() -> bool:
    try:
        import doctr  # noqa: F401
        return True
    except Exception:
        return False


def extract_text(file_path: str) -> str:
    """
    Run OCR on an image or PDF and return the recognised text (reading order).
    Raises on failure so the caller can mark the document ``failed``.
    """
    from doctr.io import DocumentFile

    if file_path.lower().endswith(".pdf"):
        doc = DocumentFile.from_pdf(file_path)
    else:
        doc = DocumentFile.from_images(file_path)

    result = _predictor()(doc)
    lines: list[str] = []
    for page in result.pages:
        for block in page.blocks:
            for line in block.lines:
                lines.append(" ".join(w.value for w in line.words))
    return "\n".join(lines).strip()
