import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

import report


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1"])
async def test_local_callbacks_bypass_proxy_and_deliver_full_report(monkeypatch, host):
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            received.append((self.path, payload))
            self.send_response(201)
            self.end_headers()

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    for key in (
        "http_proxy",
        "HTTP_PROXY",
        "https_proxy",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "all_proxy",
    ):
        monkeypatch.setenv(key, "http://127.0.0.1:1")
    monkeypatch.setenv("NO_PROXY", "")
    monkeypatch.setenv("no_proxy", "")
    monkeypatch.setenv("CALLBACK_BASE_URL", f"http://{host}:{server.server_port}")

    async def no_sleep(_seconds):
        pass

    monkeypatch.setattr(report.asyncio, "sleep", no_sleep)
    try:
        await report.send_question_checkpoint(
            conversation_id="room",
            interview_record_id="candidate",
            schedule_entry_id="round",
            outcome={"questionId": "question", "answerSummary": "回答"},
        )
        await report.send_report(
            interview_context=SimpleNamespace(
                session=SimpleNamespace(
                    interview_record_id="candidate", round_id="round"
                )
            ),
            room_name="room",
            turns=[{"role": "user", "message": "回答"}],
            call_successful="partial",
            started_at=1,
            ended_at=2,
            close_reason="candidate_ended_round",
        )
        assert [path for path, _payload in received] == [
            "/api/agent/checkpoint",
            "/api/agent/report",
        ]
        assert received[1][1]["transcript"] == [{"role": "user", "message": "回答"}]
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize(
    ("url", "uses_environment"),
    [
        ("http://[::1]:3000", False),
        ("http://127.0.0.2:3000", False),
        ("http://LOCALHOST.:3000", False),
        ("https://api.example.com", True),
    ],
)
def test_remote_callbacks_keep_environment_configuration(url, uses_environment):
    assert report.callback_uses_environment(url) is uses_environment
