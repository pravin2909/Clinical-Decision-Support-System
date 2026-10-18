"""
Clinical MCP server (stateless tools).

Exposes literature search, drug-interaction checks, and clinical-KB search over
the Model Context Protocol. These require no user identity, so they are safe to
serve to any MCP client. Started over stdio with:

    python -m app.mcp_servers.clinical
"""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

from app import drugs, research
from app.rag import store as rag_store

# FastMCP was renamed to MCPServer in mcp 2.x; the tool/run API is the same.
mcp = MCPServer("cds-clinical")


@mcp.tool()
async def search_clinical_literature(query: str) -> list:
    """Search Europe PMC + Semantic Scholar for evidence (returns cited papers)."""
    return await research.search_literature(query, limit=6)


@mcp.tool()
async def search_doctor_kb(query: str) -> list:
    """Search the clinical knowledge base (guidelines/papers) via pgvector."""
    return await rag_store.search(query, audience="doctor", k=5)


@mcp.tool()
async def check_drug_interactions(drug_names: list[str]) -> dict:
    """Check a list of drugs for interactions using openFDA drug labels."""
    return await drugs.check_interactions(drug_names)


if __name__ == "__main__":
    mcp.run()
