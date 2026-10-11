"""Health / readiness / metrics endpoints."""


async def test_healthz_is_ok(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_healthz_sets_request_id_header(client):
    r = await client.get("/healthz")
    assert r.headers.get("x-request-id")


async def test_readyz_503_when_models_not_loaded(client):
    # Lifespan is not run under ASGITransport, so models are unloaded.
    r = await client.get("/readyz")
    assert r.status_code == 503
    assert r.json()["status"] == "not_ready"


async def test_metrics_is_prometheus_text(client):
    r = await client.get("/metrics")
    assert r.status_code == 200
    assert "dpt_up 1" in r.text
