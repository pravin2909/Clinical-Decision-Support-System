"""
MCP servers exposing tools over the Model Context Protocol.

Scope decision: only the *stateless clinical* tools (literature search, drug
interactions, KB search) are exposed over MCP, because they need no per-user
authentication and are safe for any MCP client to call. Patient-data tools stay
in-process behind the consent layer (``app.policy``) — serving them over MCP would
mean shipping patient identity + DB access to a separate process, a security
surface we deliberately avoid. The in-process LangGraph agent therefore binds the
tools directly (fast, secure); this MCP server makes the same clinical tools
reusable by external MCP clients.

Run standalone:  python -m app.mcp_servers.clinical
"""
