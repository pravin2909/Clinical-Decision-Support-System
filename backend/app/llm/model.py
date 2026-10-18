"""
The chat model and embedding model for the agentic layer.

Both point at the same OpenAI-compatible server the rest of the app already uses
(LM Studio by default). Centralising construction here means the model id, base
URL, and key live in exactly one place, and the agent graphs just call
``get_chat_model()`` / ``get_embeddings()``.

Why ``langchain-openai``: ``gpt-oss-20b`` supports native OpenAI function-calling,
and ``ChatOpenAI`` turns that into clean ``.bind_tools(...)`` + streaming that
LangGraph consumes directly — no hand-rolled tool-call delta parsing.
"""

from __future__ import annotations

from functools import lru_cache

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.config import EMBED_MODEL, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL


def get_chat_model(temperature: float = 0.3, streaming: bool = True) -> ChatOpenAI:
    """
    Build a chat model bound to the configured LLM server.

    ``temperature`` defaults low (0.3) because clinical answers should be
    deterministic and grounded; callers can raise it for chattier patient replies.
    A fresh instance per call is cheap and keeps per-request settings isolated.
    """
    return ChatOpenAI(
        model=LLM_MODEL,
        base_url=LLM_BASE_URL,
        api_key=LLM_API_KEY,
        temperature=temperature,
        streaming=streaming,
        timeout=600,
    )


@lru_cache(maxsize=1)
def get_embeddings() -> OpenAIEmbeddings:
    """
    Embedding model for the pgvector RAG store (cached — it's stateless).

    ``check_embedding_ctx_length=False`` is required for non-OpenAI servers like
    LM Studio, which don't expose tokenizer metadata the way OpenAI does.
    """
    return OpenAIEmbeddings(
        model=EMBED_MODEL,
        base_url=LLM_BASE_URL,
        api_key=LLM_API_KEY,
        check_embedding_ctx_length=False,
    )
