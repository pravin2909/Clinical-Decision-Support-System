"""
API contract: versioned + legacy routing, and the consistent error envelope.
"""


async def test_error_envelope_on_404(client):
    r = await client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert body["error"]["code"] == "not_found"
    assert body["request_id"]  # tied to the server-side log line


async def test_protected_route_401_envelope(client):
    r = await client.get("/api/v1/history")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


async def test_validation_error_envelope(client):
    # Login requires form fields; sending none is a validation error.
    r = await client.post("/api/v1/auth/login", data={})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


async def test_versioned_and_legacy_paths_both_resolve(client):
    # Both should reach the same handler (401 without a token), proving the
    # dual-mount bridge works. A 404 here would mean the path isn't mounted.
    assert (await client.get("/api/v1/history")).status_code == 401
    assert (await client.get("/history")).status_code == 401


async def test_legacy_path_hidden_from_schema(client):
    schema = (await client.get("/openapi.json")).json()
    paths = schema["paths"]
    assert "/api/v1/history" in paths
    assert "/history" not in paths  # legacy bridge is include_in_schema=False
