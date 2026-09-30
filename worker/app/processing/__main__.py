"""개발용 실행: 합성 요청 하나를 가짜 생성기로 처리해 진행 알림과 결과를 출력한다.

외부 호출을 하지 않고, 결과를 어디에도 보내거나 저장하지 않는다.
"""

import argparse
import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from app.processing import (
    SCENARIOS,
    FakeGenerator,
    Finished,
    Rejected,
    process_request,
    synthetic_accepted_context,
    synthetic_request,
)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.processing",
        description="합성 요청을 가짜 생성기로 처리해 MOCK 결과를 JSON으로 출력한다.",
    )
    parser.add_argument("scenario", choices=list(SCENARIOS), help="합성 시나리오")
    args = parser.parse_args(argv)

    accepted = synthetic_accepted_context()
    events: list[dict[str, Any]] = []
    outcome = process_request(
        synthetic_request(accepted),
        accepted=accepted,
        generator=FakeGenerator(args.scenario),
        emit=events.append,
        clock=lambda: datetime.now(UTC),
        id_label=args.scenario,
    )
    result = outcome.result if isinstance(outcome, Finished) else None
    print(
        json.dumps({"events": events, "result": result}, ensure_ascii=False, indent=2)
    )
    return 1 if isinstance(outcome, Rejected) else 0


if __name__ == "__main__":
    raise SystemExit(main())
