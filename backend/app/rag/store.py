"""
pgvector knowledge-base store: ingest documents and retrieve by similarity.

Two audiences share the tables but are always filtered apart (``audience`` =
patient | doctor), so a patient query can never surface clinical-only material
and vice-versa. Embeddings come from the local LM Studio embedding model.

Everything degrades gracefully: if the DB or embedding server is unavailable,
``search`` returns ``[]`` and the agent simply answers without KB context rather
than erroring.
"""

from __future__ import annotations

import logging

from sqlalchemy import select, text

from app.db import session_scope
from app.llm.model import get_embeddings
from app.models_db import KbChunk, KbDocument

log = logging.getLogger("dpt.rag")


def _chunk_text(body: str, size: int = 900, overlap: int = 150) -> list[str]:
    """Simple character-window chunker with overlap (section-aware enough for now)."""
    body = (body or "").strip()
    if not body:
        return []
    chunks, start = [], 0
    while start < len(body):
        end = start + size
        chunks.append(body[start:end])
        start = end - overlap
    return chunks


async def ingest_document(
    *, audience: str, title: str, body: str,
    source_url: str | None = None, license: str | None = None,
) -> dict:
    """Chunk, embed, and upsert one KB document. Returns a summary."""
    chunks = _chunk_text(body)
    if not chunks:
        return {"document_id": None, "chunks": 0, "error": "empty body"}

    try:
        vectors = await get_embeddings().aembed_documents(chunks)
    except Exception as e:
        log.warning("embed_failed", extra={"err": str(e)})
        return {"document_id": None, "chunks": 0, "error": "embedding server unavailable"}

    async with session_scope() as session:
        if session is None:
            return {"document_id": None, "chunks": 0, "error": "db unavailable"}
        doc = KbDocument(audience=audience, title=title, source_url=source_url, license=license)
        session.add(doc)
        await session.flush()
        for ctext, vec in zip(chunks, vectors):
            session.add(KbChunk(
                document_id=doc.id, audience=audience, chunk_text=ctext, embedding=vec,
            ))
        await session.commit()
        return {"document_id": doc.id, "chunks": len(chunks)}


async def search(query: str, *, audience: str, k: int = 5) -> list[dict]:
    """
    Return the ``k`` most similar chunks for ``audience``, each with its source
    document title/url. Uses pgvector cosine distance (``<=>``).
    """
    try:
        qvec = await get_embeddings().aembed_query(query)
    except Exception:
        return []

    async with session_scope() as session:
        if session is None:
            return []
        try:
            rows = (await session.execute(
                select(
                    KbChunk.chunk_text,
                    KbDocument.title,
                    KbDocument.source_url,
                    KbChunk.embedding.cosine_distance(qvec).label("dist"),
                )
                .join(KbDocument, KbChunk.document_id == KbDocument.id)
                .where(KbChunk.audience == audience)
                .order_by(text("dist"))
                .limit(k)
            )).all()
        except Exception as e:
            log.warning("kb_search_failed", extra={"err": str(e)})
            return []

    return [
        {"text": r.chunk_text, "title": r.title, "url": r.source_url,
         "score": round(1.0 - float(r.dist), 4)}
        for r in rows
    ]
