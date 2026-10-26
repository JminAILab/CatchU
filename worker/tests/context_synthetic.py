"""합성 맥락 HTTP 응답. 실제 api·GitHub·토큰을 사용하지 않는다."""

import http.server
import json
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from typing import Any

import pytest
from github_synthetic import ACCEPTED, MEMBER, REPOSITORY, REQUEST, TOKEN

from app.collection.credentials import AccessToken
from app.processing.synthetic import ALLOWED_RESOURCE_TYPES
from app.request_context import ContextApiSettings, RequestContextClient

KEY = "a1" * 32
CONTEXT_REQUEST = replace(
    REQUEST,
    credential_context_reference=REQUEST.attempt_id,
    selection_reference=REQUEST.attempt_id,
)


def context_body() -> dict[str, Any]:
    """api 조회 응답(#232·#121)의 합성 값. 접수 기록은 합성 접수 맥락과 같고 sourceMode는 LIVE다."""
    return {
        "requestId": REQUEST.request_id,
        "attemptId": REQUEST.attempt_id,
        "consentId": REQUEST.consent_id,
        "noticeRevision": ACCEPTED.notice_revision,
        "allowedResourceTypes": list(ALLOWED_RESOURCE_TYPES),
        "sourceMode": "LIVE",
        "credential": {
            "memberId": REQUEST.member_id,
            "repositoryId": REQUEST.repository_id,
            "scopeRevision": REQUEST.scope_revision,
            "repository": {"owner": REPOSITORY.owner, "name": REPOSITORY.name},
            "linkedAccount": {
                "login": MEMBER.login,
                "externalAccountId": "9007199254740993",
            },
            "accessToken": TOKEN,
            "expiresAt": "2026-10-01T01:00:00.000Z",
        },
        "selection": {"repositoryId": REQUEST.repository_id, "wholeRepository": True},
    }


@dataclass(repr=False)
class ApiReply:
    payload: dict[str, Any] = field(default_factory=context_body)
    status: int = 200
    body: bytes | None = None
    content_type: str = "application/json"
    content_encoding: str | None = None
    declared_size: int | None = None
    drip: bool = False
    requests: int = 0
    valid_requests: int = 0
    paths: list[str] = field(default_factory=list)
    client: RequestContextClient | None = None
    base_url: str = ""


@pytest.fixture
def context_api() -> Iterator[ApiReply]:
    reply = ApiReply()

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            reply.requests += 1
            reply.paths.append(self.path)
            if (
                self.path
                == f"/v1/internal/analysis-attempts/{REQUEST.attempt_id}/context"
                and self.headers.get("X-Worker-Key") == KEY
                and self.headers.get("Authorization") is None
            ):
                reply.valid_requests += 1
            body = (
                json.dumps(reply.payload).encode() if reply.body is None else reply.body
            )
            self.send_response(reply.status)
            self.send_header("Content-Type", reply.content_type)
            if reply.declared_size != -1:
                self.send_header(
                    "Content-Length", str(reply.declared_size or len(body))
                )
            if reply.content_encoding is not None:
                self.send_header("Content-Encoding", reply.content_encoding)
            if reply.status == 302:
                self.send_header("Location", "/must-not-follow")
            self.end_headers()
            try:
                if reply.drip:
                    for byte in body:
                        self.wfile.write(bytes([byte]))
                        self.wfile.flush()
                        time.sleep(0.02)
                else:
                    self.wfile.write(body)
            except OSError:
                pass

        def log_message(self, format: str, *args: Any) -> None:
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(
        target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True
    )
    thread.start()
    reply.base_url = f"http://127.0.0.1:{server.server_address[1]}"
    reply.client = RequestContextClient(
        ContextApiSettings(reply.base_url, AccessToken(KEY), "test")
    )
    try:
        yield reply
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
