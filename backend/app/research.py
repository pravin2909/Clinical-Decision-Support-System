"""
Evidence-grounded answering for physicians.
Retrieves real medical literature from Europe PMC (PubMed-backed, free, no key)
AND Semantic Scholar (free, broader coverage), then asks the LLM to answer
ONLY from those sources with inline citations.
"""

import asyncio
import re
import json
import httpx

from app.config import LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, DOCTOR_SYSTEM_PROMPT

EUROPEPMC_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1/paper/search"


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").strip()


# Generic English words to drop so only clinical terms drive the search.
_STOPWORDS = {
    "what", "which", "when", "where", "why", "how", "who", "whom", "whose",
    "is", "are", "was", "were", "be", "been", "being", "am",
    "do", "does", "did", "doing", "done", "has", "have", "had",
    "to", "for", "with", "without", "and", "or", "of", "in", "on", "at", "by",
    "from", "as", "into", "about", "over", "under", "between", "than", "then",
    "a", "an", "the", "this", "that", "these", "those", "it", "its", "there",
    "here", "i", "me", "my", "we", "our", "us", "you", "your", "he", "she",
    "they", "them", "his", "her", "their",
    "should", "would", "could", "can", "may", "might", "will", "shall", "must",
    "give", "given", "giving", "get", "getting", "want", "need", "please",
    "tell", "show", "list", "use", "using", "best", "good", "any", "some",
    "if", "so", "but", "also", "like", "such", "more", "most", "very",
}


def _keywords(question: str) -> list[str]:
    """Pull distinct clinical terms out of a natural-language question."""
    words = re.findall(r"[a-zA-Z][a-zA-Z\-]{2,}", question.lower())
    seen: set[str] = set()
    terms: list[str] = []
    for w in words:
        if w in _STOPWORDS or w in seen:
            continue
        seen.add(w)
        terms.append(w)
    return terms


def _parse_epmc_results(results: list[dict], limit: int) -> list[dict]:
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


def _parse_ss_results(data: list[dict], limit: int) -> list[dict]:
    sources: list[dict] = []
    for item in data:
        abstract = (item.get("abstract") or "").strip()
        if not abstract:
            continue
        ext = item.get("externalIds") or {}
        doi = ext.get("DOI")
        pmid = ext.get("PubMed")
        if pmid:
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        elif doi:
            url = f"https://doi.org/{doi}"
        else:
            url = None
        venue = item.get("publicationVenue") or {}
        authors_list = item.get("authors") or []
        authors = ", ".join(a.get("name", "") for a in authors_list[:3])
        if len(authors_list) > 3:
            authors += " et al."
        sources.append(
            {
                "title": (item.get("title") or "").strip(),
                "authors": authors,
                "journal": venue.get("name", ""),
                "year": str(item.get("year") or ""),
                "abstract": abstract[:1200],
                "url": url,
            }
        )
        if len(sources) >= limit:
            break
    return sources


def _deduplicate(sources: list[dict], limit: int) -> list[dict]:
    seen: set[str] = set()
    result: list[dict] = []
    for s in sources:
        key = (s.get("title") or "").lower()[:60].strip()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(s)
        if len(result) >= limit:
            break
    return result


async def _epmc_search(client: httpx.AsyncClient, query: str, limit: int) -> list[dict]:
    try:
        resp = await client.get(
            EUROPEPMC_URL,
            params={"query": query, "format": "json", "pageSize": 25, "resultType": "core"},
        )
        resp.raise_for_status()
        results = resp.json().get("resultList", {}).get("result", [])
    except Exception:
        return []
    return _parse_epmc_results(results, limit)


async def _epmc_cascade(
    client: httpx.AsyncClient, query: str, terms: list[str], limit: int
) -> list[dict]:
    candidates: list[str] = []
    if terms:
        focused = " AND ".join(terms[:5])
        candidates.append(f"({focused}) AND (HAS_ABSTRACT:Y)")
        candidates.append(f"({focused})")
        broad = " OR ".join(terms[:8])
        candidates.append(f"({broad}) AND (HAS_ABSTRACT:Y)")
    candidates.append(f"({query}) AND (HAS_ABSTRACT:Y)")
    candidates.append(query)

    for q in candidates:
        results = await _epmc_search(client, q, limit)
        if results:
            return results
    return []


async def _semantic_scholar_search(
    client: httpx.AsyncClient, query: str, limit: int
) -> list[dict]:
    try:
        resp = await client.get(
            SEMANTIC_SCHOLAR_URL,
            params={
                "query": query,
                "fields": "title,abstract,authors,year,publicationVenue,externalIds",
                "limit": 25,
            },
            headers={"User-Agent": "CDS-Research/1.0"},
            timeout=12.0,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
    except Exception:
        return []
    return _parse_ss_results(data, limit)


async def search_literature(query: str, limit: int = 6) -> list[dict]:
    """
    Retrieve relevant papers (with abstracts) from Europe PMC and Semantic Scholar
    in parallel, then deduplicate and return the best results.
    """
    terms = _keywords(query)
    ss_query = " ".join(terms[:6]) if terms else query

    async with httpx.AsyncClient(timeout=15.0) as client:
        epmc_task = _epmc_cascade(client, query, terms, limit)
        ss_task = _semantic_scholar_search(client, ss_query, limit)

        epmc_res, ss_res = await asyncio.gather(epmc_task, ss_task, return_exceptions=True)

    if isinstance(epmc_res, Exception):
        epmc_res = []
    if isinstance(ss_res, Exception):
        ss_res = []

    merged = _deduplicate(list(epmc_res) + list(ss_res), limit)
    return merged


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


async def generate_grounded_stream_with_history(
    question: str,
    sources: list[dict],
    history: list[dict] | None = None,
):
    """Stream an evidence-grounded answer with optional conversation history for follow-ups."""
    history = history or []

    if not sources and not history:
        yield (
            "I couldn't retrieve supporting literature for this query, so I won't speculate. "
            "Try rephrasing with specific clinical terms (condition, drug class, population)."
        )
        return

    messages = [{"role": "system", "content": DOCTOR_SYSTEM_PROMPT}]
    messages.extend(history)

    if sources:
        user_content = _build_user_prompt(question, sources)
    else:
        user_content = (
            f"FOLLOW-UP QUESTION: {question}\n\n"
            "No new literature was retrieved for this follow-up. Answer based on the evidence "
            "discussed in the previous exchange, referencing the earlier sources where applicable."
        )
    messages.append({"role": "user", "content": user_content})

    payload = {
        "model": LLM_MODEL,
        "messages": messages,
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


async def generate_grounded_stream(question: str, sources: list[dict]):
    """Backwards-compatible wrapper — streams without conversation history."""
    async for token in generate_grounded_stream_with_history(question, sources):
        yield token
