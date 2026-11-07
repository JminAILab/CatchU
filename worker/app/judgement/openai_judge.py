"""OpenAI 판정 어댑터(CR3 BR1.1, NFR1.5): OpenAI Decisions API로 판정 호출 한 번을 한다.

공식 `openai` SDK(판본 고정, `worker/pyproject.toml`)의 `client.decisions.create`를 쓴다. 이 API는 질문 1~400개를
한 번에 받아 같은 순서로 predicate(참일 확률)·choice(선택지별 확률)·score(단계별 확률)로 답하고, 모델은
`gpt-6-luna`만 받는다. 생성 제공자(Claude)와 같은 보호를 둔다.

- 접속 주소: 클라이언트 지역 지정(`data_residency="us"`)으로 `https://us.api.openai.com/v1`에 고정한다. 이 값이
  있으면 SDK는 `OPENAI_BASE_URL`을 읽지 않는다. 미국 지역 프로젝트의 키여야 한다(팀장 인프라).
- 키: 설정 객체의 `CATCHU_JUDGEMENT_API_KEY` 값만 생성자 인자로 넘긴다. 그래서 SDK는 `OPENAI_API_KEY`를 읽지
  않는다. 머리글을 덧붙이는 `OPENAI_CUSTOM_HEADERS`가 있으면 만들지 않는다. SDK가 환경에서 읽는 조직·프로젝트·
  관리자 키(`OPENAI_ORG_ID`·`OPENAI_PROJECT_ID`·`OPENAI_ADMIN_KEY`)는 만든 뒤 지워 머리글에 싣지 않는다.
- HTTP: 프록시 환경변수를 읽지 않고, redirect를 따라가지 않으며, 응답 본문 256 KiB 상한과 호출 전체 마감을
  지킨다(`app.generation.claude.guarded_transport`). 다시 시도는 끈다(`max_retries=0`).
- 공식 SDK의 Decisions 요청에는 요청마다 응답 저장을 끄는 인자·처리 지역 인자·출력 토큰 상한 인자가 없다
  (3.46.0 `resources/decisions.py`). 저장 끔은 보내지 않고, 지역은 위 클라이언트 지정으로, 출력 크기는 질문 수
  상한(400개)과 응답 본문 상한으로 묶는다. 기본 보관 기간은 고지 v3에 적는다(`docs/generation-judgement.md`).
- 지시문은 developer 칸에, 신뢰할 수 없는 자료는 user 칸에 둔다. 질문 문장에는 자료 안 id만 들어간다.

운영 로그에는 호출 종류·모델 ID·토큰 수·답 수·거절 수·걸린 시간·요청 ID·실패 원인 구분만 남긴다. 지시문·
자료·답·오류 원문·키는 남기지 않는다.
"""

import logging
import os
import re
import time
from collections.abc import Sequence
from typing import Any, Final

import httpx2
import openai
from openai import OpenAI
from openai.types.decision_create_params import Question as QuestionParam

from app.collection.credentials import AccessToken
from app.generation.claude import (
    guarded_transport,
    is_capped_failure,
    quiet_library_logs,
)
from app.judgement.provider import (
    CHOICE_KINDS,
    PROBABILITY_KINDS,
    SCORE_LEVELS,
    JudgementError,
    JudgementRequest,
    Question,
    RawAnswer,
)

logger = logging.getLogger(__name__)

MODEL: Final = "gpt-6-luna"
DATA_RESIDENCY: Final = "us"
BASE_URL: Final = "https://us.api.openai.com/v1"
_SAFE_ID: Final = re.compile(r"[A-Za-z0-9._:-]{1,128}")


def _question(question: Question) -> QuestionParam:
    if question.kind in PROBABILITY_KINDS:
        return {
            "type": "predicate",
            "name": question.id,
            "instructions": question.prompt,
        }
    if question.kind in CHOICE_KINDS:
        return {
            "type": "choice",
            "name": question.id,
            "instructions": question.prompt,
            "choices": [{"value": option} for option in question.options],
        }
    return {
        "type": "score",
        "name": question.id,
        "instructions": question.prompt,
        "levels": [{"label": str(level)} for level in SCORE_LEVELS],
    }


class OpenAIJudge:
    """OpenAI Decisions API로 판정 호출 한 번을 한다. 클라이언트 하나를 만들어 호출마다 재사용한다."""

    def __init__(
        self,
        api_key: AccessToken,
        *,
        transport: httpx2.BaseTransport | None = None,
    ) -> None:
        """transport는 시험이 네트워크 없이 SDK 전체를 돌릴 때만 넘긴다. 어느 쪽이든 응답 본문 상한과 호출 마감
        확인을 씌운다."""
        if "OPENAI_CUSTOM_HEADERS" in os.environ:
            # SDK는 이 값을 머리글로 붙이고 Authorization까지 덮어쓸 수 있다. 값은 예외에 싣지 않는다.
            raise ValueError(
                "OPENAI_CUSTOM_HEADERS 환경변수가 있으면 판정 공급자를 만들지 않는다"
            )
        # SDK DEBUG 로그는 요청 본문(보낸 자료)을 남긴다(`OPENAI_LOG`).
        quiet_library_logs("openai", logging.INFO)
        client = OpenAI(
            api_key=api_key.reveal(),
            data_residency=DATA_RESIDENCY,
            max_retries=0,
            # 압축된 응답은 풀린 크기를 미리 셀 수 없어 압축하지 않은 응답만 받는다.
            default_headers={"Accept-Encoding": "identity"},
            http_client=httpx2.Client(
                transport=guarded_transport(transport),
                follow_redirects=False,
                trust_env=False,
            ),
        )
        # 환경에서 읽은 조직·프로젝트·관리자 키를 쓰지 않는다(키에 묶인 프로젝트로만 부른다).
        client.organization = None
        client.project = None
        client.admin_api_key = None
        self._client = client

    @property
    def name(self) -> str:
        return "openai"

    def judge(self, request: JudgementRequest) -> Sequence[RawAnswer]:
        started = time.monotonic()
        # 실패 예외는 except 밖에서 낸다. SDK 예외는 요청 본문·응답 원문을 담고 있어 원인으로 잇지 않는다.
        cause: str
        status: int | None = None
        try:
            decision = self._client.decisions.create(
                model=MODEL,
                input=[
                    {"role": "developer", "content": request.instructions},
                    {"role": "user", "content": request.data},
                ],
                questions=[_question(question) for question in request.questions],
                timeout=request.timeout_seconds,
            )
        except openai.APITimeoutError:
            _log_failure(request, "TIMEOUT", None, started)
            raise TimeoutError("판정 공급자 호출 시간 초과") from None
        except openai.APIConnectionError as error:
            cause = "RESPONSE_UNREADABLE" if is_capped_failure(error) else "CONNECTION"
        except openai.APIStatusError as error:
            cause, status = "HTTP_ERROR", error.status_code
        except (openai.APIError, ValueError, RecursionError):
            cause = "RESPONSE_UNREADABLE"
        except Exception as error:
            # 응답 본문 상한·압축 거부는 OpenAI SDK가 감싸지 않고 그대로 올린다. 그 밖의 예외는 결함이다.
            if not is_capped_failure(error):
                raise
            cause = "RESPONSE_UNREADABLE"
        else:
            return _answers(request, decision, started)
        _log_failure(request, cause, status, started)
        raise JudgementError(
            "JUDGEMENT_RESPONSE_UNREADABLE"
            if cause == "RESPONSE_UNREADABLE"
            else "JUDGEMENT_CALL_FAILED"
        )


def _answers(
    request: JudgementRequest, decision: Any, started: float
) -> list[RawAnswer]:
    """답을 질문 순서대로 (질문 id, 값)으로 바꾼다. 거절·모양이 틀린 답은 뺀다. 전체 모양이 틀리면 읽을 수 없다."""
    items = getattr(decision, "answers", None)
    if not isinstance(items, list):
        _log_failure(request, "RESPONSE_UNREADABLE", None, started)
        raise JudgementError("JUDGEMENT_RESPONSE_UNREADABLE")
    found: list[RawAnswer] = []
    refusals = 0
    for index, item in enumerate(items):
        if index >= len(request.questions):
            break
        question = request.questions[index]
        name = getattr(item, "name", None)
        if name is not None and name != question.id:
            continue
        kind = getattr(item, "type", None)
        if kind == "refusal":
            refusals += 1
            continue
        value = _value(question, kind, item)
        if value is not None:
            found.append((question.id, value))
    usage = getattr(decision, "usage", None)
    logger.info(
        "판정 공급자 응답: provider=openai purpose=%s model=%s inputTokens=%s "
        "outputTokens=%s answers=%d refusals=%d elapsedMs=%d requestId=%s",
        request.purpose,
        _safe_id(getattr(decision, "model", None)),
        _count(getattr(usage, "input_tokens", None)),
        _count(getattr(usage, "output_tokens", None)),
        len(found),
        refusals,
        _elapsed_ms(started),
        _safe_id(getattr(decision, "_request_id", None)),
    )
    return found


def _value(question: Question, kind: object, item: object) -> object | None:
    if question.kind in PROBABILITY_KINDS:
        return getattr(item, "probability", None) if kind == "predicate" else None
    if question.kind in CHOICE_KINDS:
        if kind != "choice":
            return None
        return _aligned(question.options, getattr(item, "probabilities", None))
    if kind != "score":
        return None
    return _top_level(getattr(item, "probabilities", None))


def _aligned(options: tuple[str, ...], entries: object) -> list[object] | None:
    """선택지별 확률을 질문의 선택지 순서로 늘어놓는다. 답에 없는 선택지는 0이다."""
    if not isinstance(entries, list):
        return None
    probabilities: dict[str, object] = {}
    for entry in entries:
        value = getattr(entry, "value", None)
        if isinstance(value, str) and value in options and value not in probabilities:
            probabilities[value] = getattr(entry, "probability", None)
    if not probabilities:
        return None
    return [probabilities.get(option, 0.0) for option in options]


def _top_level(entries: object) -> int | None:
    """단계별 확률 가운데 가장 큰 단계(우리가 붙인 이름 1~5). 가장 큰 값이 둘 이상이면 None."""
    if not isinstance(entries, list):
        return None
    scored: list[tuple[float, int]] = []
    for entry in entries:
        label = getattr(entry, "label", None)
        probability = getattr(entry, "probability", None)
        if (
            isinstance(label, str)
            and label in {str(level) for level in SCORE_LEVELS}
            and isinstance(probability, int | float)
            and not isinstance(probability, bool)
        ):
            scored.append((float(probability), int(label)))
    if not scored:
        return None
    top = max(probability for probability, _ in scored)
    levels = [level for probability, level in scored if probability == top]
    return levels[0] if len(levels) == 1 else None


def _log_failure(
    request: JudgementRequest, cause: str, status: int | None, started: float
) -> None:
    logger.warning(
        "판정 공급자 실패: provider=openai purpose=%s model=%s cause=%s status=%s elapsedMs=%d",
        request.purpose,
        MODEL,
        cause,
        status,
        _elapsed_ms(started),
    )


def _count(value: object) -> int | None:
    return value if type(value) is int else None


def _safe_id(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str) and _SAFE_ID.fullmatch(value):
        return value
    return "INVALID"


def _elapsed_ms(started: float) -> int:
    return round((time.monotonic() - started) * 1000)
