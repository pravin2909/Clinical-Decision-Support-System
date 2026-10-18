"""
Drug-interaction checks via openFDA (free, no key).

For each drug we fetch its label's ``drug_interactions`` section from openFDA and
scan it for mentions of the other drugs in the list. This is a pragmatic,
source-backed check (the text comes from FDA labels) rather than a curated
interaction graph — good enough for decision support, and every finding is
traceable to a label. Network failures degrade to "could not verify".
"""

from __future__ import annotations

import httpx

OPENFDA_URL = "https://api.fda.gov/drug/label.json"


async def _label_interactions(client: httpx.AsyncClient, drug: str) -> str | None:
    try:
        resp = await client.get(
            OPENFDA_URL,
            params={"search": f'openfda.generic_name:"{drug}" OR openfda.brand_name:"{drug}"', "limit": 1},
        )
        if resp.status_code != 200:
            return None
        results = resp.json().get("results", [])
        if not results:
            return None
        section = results[0].get("drug_interactions") or results[0].get("warnings")
        if isinstance(section, list):
            return " ".join(section)
        return section
    except Exception:
        return None


async def check_interactions(drugs: list[str]) -> dict:
    """
    Cross-check a list of drugs. Returns pairs where one drug's FDA label mentions
    another, plus any drugs we couldn't look up.
    """
    drugs = [d.strip() for d in drugs if d and d.strip()]
    if len(drugs) < 2:
        return {"pairs": [], "unverified": drugs, "note": "Provide at least two drugs to check."}

    async with httpx.AsyncClient(timeout=12.0) as client:
        labels: dict[str, str | None] = {}
        for d in drugs:
            labels[d] = await _label_interactions(client, d)

    pairs: list[dict] = []
    unverified = [d for d, txt in labels.items() if not txt]
    for i, a in enumerate(drugs):
        for b in drugs[i + 1:]:
            a_txt, b_txt = labels.get(a) or "", labels.get(b) or ""
            mentions = (b.lower() in a_txt.lower()) or (a.lower() in b_txt.lower())
            if mentions:
                src = a if b.lower() in a_txt.lower() else b
                pairs.append({
                    "drugs": [a, b],
                    "severity": "review",
                    "source": f"openFDA label for {src}",
                })
    return {
        "pairs": pairs,
        "unverified": unverified,
        "note": "Based on openFDA drug labels. Absence of a listed interaction is not proof of safety.",
    }
