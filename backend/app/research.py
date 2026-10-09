"""
Evidence-grounded answering for physicians.
Retrieves real medical literature from Europe PMC (PubMed-backed, free, no key),
then asks the LLM to answer ONLY from those sources with inline citations.
"""

import re
import json
import httpx

from app.config import LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, DOCTOR_SYSTEM_PROMPT

EUROPEPMC_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").strip()


async def search_literature(query: str, limit: int = 5) -> list[dict]:
    """Return a list of relevant papers (with abstracts) from Europe PMC."""
    params = {
        # Prefer reviews/guidelines/trials with abstracts; default sort = relevance.
        "query": f"({query}) AND (HAS_ABSTRACT:Y)",
        "format": "json",
        "pageSize": 20,
        "resultType": "core",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(EUROPEPMC_URL, params=params)
            resp.raise_for_status()
            results = resp.json().get("resultList", {}).get("result", [])
    except Exception:
        return []

    sources: list[dict] = []
    for item in results:
        abstract = _strip_html(item.get("abstractText"))
        if not abstract:
            continue
        pmid = item.get("pmid")
        doi = item.get("doi")
        if pmid:
            url = f"https://europepmc.org/article/MED/{pmid}"
        elif doi:
            url = f"https://doi.org/{doi}"
        else:
            url = None
        sources.append(
            {
                "title": _strip_html(item.get("title")),
                "authors": item.get("authorString", ""),
                "journal": item.get("journalTitle", ""),
                "year": item.get("pubYear", ""),
                "abstract": abstract[:1200],
                "url": url,
            }
        )
        if len(sources) >= limit:
            break
    return sources


def _build_user_prompt(question: str, sources: list[dict]) -> str:
    blocks = []
    for i, s in enumerate(sources, 1):
        blocks.append(
            f"[{i}] {s['title']} — {s['journal']} ({s['year']}).\nAbstract: {s['abstract']}"
        )
    context = "\n\n".join(blocks)
    return (
        f"CLINICAL QUESTION (from a physician):\n{question}\n\n"
        f"RETRIEVED EVIDENCE (use ONLY these sources, cite as [n]):\n{context}\n\n"
        "Write a concise, evidence-based answer for the physician, citing sources inline as "
        "[1], [2] that match the numbers above. If the evidence does not cover part of the "
        "question, say so explicitly rather than guessing."
    )


async def generate_grounded_stream(question: str, sources: list[dict]):
    """Stream an evidence-grounded answer from the LLM."""
    if not sources:
        yield (
            "I couldn't retrieve supporting literature for this query, so I won't speculate. "
            "Try rephrasing with specific clinical terms (condition, drug class, population)."
        )
        return

    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": DOCTOR_SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(question, sources)},
        ],
        "temperature": 0.3,
        "top_p": 0.9,
        "max_tokens": 1500,
        "stream": True,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LLM_API_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            async with client.stream(
                "POST", f"{LLM_BASE_URL}/chat/completions", json=payload, headers=headers
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    if line.startswith("data: "):
                        line = line[len("data: "):]
                    if line.strip() == "[DONE]":
                        break
                    try:
                        data = json.loads(line)
                        token = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if token:
                            yield token
                    except json.JSONDecodeError:
                        continue
    except httpx.ConnectError:
        yield (
            "Error: Cannot connect to the LLM backend. "
            f"Please ensure your server is running at {LLM_BASE_URL}."
        )
    except Exception as e:
        yield f"Error: {str(e)}"
