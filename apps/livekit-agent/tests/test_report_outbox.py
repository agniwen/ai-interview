import json
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from report_outbox import persist_report, replay_pending_reports


@pytest.mark.asyncio
async def test_failed_callback_survives_restart_and_replays_exact_payload(tmp_path):
    payload = {
        "conversationId": "first-session",
        "transcript": [{"role": "user", "message": "完整回答"}],
    }
    path = persist_report("http://localhost:3000", payload, directory=tmp_path)
    assert path.stat().st_mode & 0o777 == 0o600
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(500))
    ) as client:
        await replay_pending_reports(
            client, "http://localhost:3000", "secret", directory=tmp_path
        )
    assert path.exists()
    delivered = []

    def accept(request):
        delivered.append(json.loads(request.content))
        assert request.headers["X-Agent-Secret"] == "rotated-secret"
        return httpx.Response(201)

    async with httpx.AsyncClient(transport=httpx.MockTransport(accept)) as client:
        await replay_pending_reports(
            client, "http://localhost:3000", "rotated-secret", directory=tmp_path
        )
    assert delivered == [payload]
    assert not path.exists()


@pytest.mark.asyncio
async def test_outbox_never_replays_to_another_environment(tmp_path):
    path = persist_report(
        "https://production.invalid", {"transcript": []}, directory=tmp_path
    )

    def reject(request):
        raise AssertionError("must not send production evidence to another destination")

    async with httpx.AsyncClient(transport=httpx.MockTransport(reject)) as client:
        await replay_pending_reports(
            client, "http://localhost:3000", "secret", directory=tmp_path
        )
    assert path.exists()


def test_retries_are_idempotent_and_distinct_payloads_are_preserved(tmp_path):
    first = persist_report(
        "http://localhost", {"transcript": ["first"]}, directory=tmp_path
    )
    assert (
        persist_report(
            "http://localhost", {"transcript": ["first"]}, directory=tmp_path
        )
        == first
    )
    second = persist_report(
        "http://localhost", {"transcript": ["second"]}, directory=tmp_path
    )
    assert first != second
    assert len(list(tmp_path.glob("*.json"))) == 2


@pytest.mark.asyncio
async def test_send_report_spools_before_all_three_failed_attempts(
    tmp_path, monkeypatch
):
    from types import SimpleNamespace

    import report

    monkeypatch.setenv("AGENT_REPORT_OUTBOX_DIR", str(tmp_path))
    monkeypatch.setenv("CALLBACK_BASE_URL", "http://localhost:3000")
    sent = []

    def reject(request):
        assert len(list(tmp_path.glob("*.json"))) == 1
        sent.append(json.loads(request.content))
        return httpx.Response(500)

    client_type = httpx.AsyncClient
    monkeypatch.setattr(
        report.httpx,
        "AsyncClient",
        lambda **kwargs: client_type(transport=httpx.MockTransport(reject), **kwargs),
    )

    async def no_sleep(_delay):
        pass

    monkeypatch.setattr(report.asyncio, "sleep", no_sleep)
    await report.send_report(
        interview_context=SimpleNamespace(
            session=SimpleNamespace(interview_record_id="record", round_id="round")
        ),
        room_name="room",
        turns=[{"role": "user", "message": "首次完整回答"}],
        call_successful="success",
        started_at=1,
        ended_at=2,
        close_reason="task_completed",
        agent_session_id="first-agent",
    )
    assert len(sent) == 3
    envelope = json.loads(next(tmp_path.glob("*.json")).read_text())
    assert envelope["payload"] == sent[0]
    assert envelope["payload"]["metadata"]["agentSessionId"] == "first-agent"


def test_supervisor_restarts_recovery_after_failed_delivery(tmp_path, monkeypatch):
    import threading
    import time
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    from report_outbox import report_recovery_process

    received = threading.Event()
    status = 500

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers["Content-Length"]))
            self.send_response(status)
            self.end_headers()
            received.set()

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    monkeypatch.setenv("CALLBACK_BASE_URL", base_url)
    monkeypatch.setenv("AGENT_REPORT_OUTBOX_DIR", str(tmp_path))
    monkeypatch.setattr(sys, "argv", ["agent.py", "start"])
    path = persist_report(base_url, {"transcript": ["original"]}, directory=tmp_path)
    try:
        with report_recovery_process():
            assert received.wait(5)
            assert path.exists()
        received.clear()
        status = 201
        with report_recovery_process():
            assert received.wait(5)
            deadline = time.monotonic() + 5
            while path.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            assert not path.exists()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
