"""큐 규격: 큐·작업 이름, ID 만들기와 검사, 작업 옵션(api #233과 공동).

Python BullMQ는 작업 ID 형식을 검사하지 않으므로 앱이 검사한다. 요청 작업 ID는 시도 ID와
같은 uuid여야 하고, worker가 만드는 ID는 `:`가 없고 숫자만으로 되지 않음을 보내기 전에 확인한다.
"""

import re
from collections.abc import Mapping
from typing import Any, Final, Literal

REQUEST_QUEUE: Final = "analysis-requests"
OUTPUT_QUEUE: Final = "worker-messages"
REQUEST_JOB: Final = "Request"
EVENT_JOB: Final = "ProcessingEvent"
RESULT_JOB: Final = "Result"

SourceMode = Literal["MOCK", "LIVE"]
EventState = Literal["RECEIVED", "RUNNING", "UNCERTAIN"]

_UUID = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

# 진행 알림은 끝나면 바로 지운다. 나이·개수 정리를 쓰면 같은 큐의 결과 기록까지 지울 수 있다.
EVENT_JOB_OPTIONS: Final[Mapping[str, Any]] = {
    "attempts": 1,
    "removeOnComplete": True,
    "removeOnFail": True,
    "stackTraceLimit": 0,
}
# 결과는 수신 확인 조회(5분)보다 길게 30분 남긴다. 개수 제한은 두지 않는다.
RESULT_JOB_OPTIONS: Final[Mapping[str, Any]] = {
    "attempts": 1,
    "removeOnComplete": {"age": 1800},
    "removeOnFail": {"age": 1800},
    "stackTraceLimit": 0,
}
# 요청 작업 옵션은 #233이 넣는다. 빠졌을 때만 소비자 기본값이 쓰이므로 같은 값(2시간 > 60분 시한)을 둔다.
REQUEST_KEEP: Final[Mapping[str, int]] = {"age": 7200}


def is_uuid(value: object) -> bool:
    return isinstance(value, str) and _UUID.fullmatch(value) is not None


def is_safe_job_id(value: str) -> bool:
    """BullMQ 키에 그대로 들어가는 ID. `:`가 있거나 숫자만이면 자동 ID·키와 섞인다."""
    return bool(value) and ":" not in value and not value.isdigit()


def mode_label(source_mode: SourceMode) -> str:
    return source_mode.lower()


def event_message_id(
    source_mode: SourceMode, attempt_id: str, state: EventState
) -> str:
    return f"event-{mode_label(source_mode)}-{attempt_id}-{state.lower()}"


def result_message_id(source_mode: SourceMode, attempt_id: str) -> str:
    return f"message-{mode_label(source_mode)}-{attempt_id}-result"


def result_id(source_mode: SourceMode, attempt_id: str) -> str:
    return f"result-{mode_label(source_mode)}-{attempt_id}"


def request_envelope_ok(name: object, job_id: object, data: object) -> bool:
    """작업 이름이 Request이고, 작업 ID가 uuid이며 data.attemptId와 같은가."""
    return (
        name == REQUEST_JOB
        and is_uuid(job_id)
        and isinstance(data, Mapping)
        and data.get("attemptId") == job_id
    )
