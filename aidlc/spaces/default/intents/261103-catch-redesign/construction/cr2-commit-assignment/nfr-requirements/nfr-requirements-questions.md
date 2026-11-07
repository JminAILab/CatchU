# CR2 소속 저장 — 비기능 요구사항 질문

입력: CR2 기능 설계(`functional-spec.md`·`rules.md`), 요구사항 NFR4·NFR6, 계약 C1·C2(「Open questions」의 결과 메시지 크기), 지금 코드(`worker/app/request_context/settings.py`·`client.py`, `worker/app/consumer/settings.py`, `api/src/catches/registration-service.ts`).

## 질문 없이 정한 것

- **결과 메시지 크기(계약 C2의 열린 질문):** 후보들의 `ownCommitShas` 합계가 3,000을 넘어도 SHA 하나가 약 43바이트라 결과 하나에 수백 KB를 넘기 어렵다. worker 자식 프로세스의 결과 한도는 16 MiB(`frame_max_bytes`)이고, api 수신·큐에는 따로 바이트 상한이 없다. 상한을 더하지 않는다.
- **소속 쓰기 시간:** 후보 하나가 최대 3,000행이다. 행을 묶어 쓰고(한 번에 1,000행 단위), 코드 생성 때 3,000행 쓰기 시간을 한 번 재서 기록한다. 시험에 시간 단언은 넣지 않는다(CR1 비기능 설계와 같은 방식).
- **동시성:** 가정 A4가 성립해(기능 설계 6절) 잠금을 더하지 않는다.
- **보안:** 소속 기록은 회원 자료다. 쓰는 길은 결과 반영 하나, 읽는 길은 worker 전용 맥락 조회 하나다. 다른 회원의 Catch를 가리키는 쓰기는 DB 외래 키가 막는다. 로그에는 SHA를 남기지 않는다.

## Q1. [운영] worker의 맥락 조회 응답 크기 상한

worker는 맥락 조회 응답을 64 KiB까지만 받는다(`worker/app/request_context/settings.py`의 `max_response_bytes`). SHA 하나가 응답에서 약 43바이트라, 한 저장소의 소속 커밋이 약 1,400개를 넘으면 응답이 상한을 넘는다. 그러면 그 저장소의 재분석이 모두 맥락 조회 실패로 끝난다. 계약 C1은 목록에 상한을 두지 않기로 했다(계약 설계 Q2 A).

- A. worker 상한을 1 MiB로 올린다(소속 약 24,000개까지). 설정 기본값 한 줄과 시험 하나다. 수집 상한이 요청마다 3,000커밋이라 실제로 넘기 어렵다.
- B. 상한을 64 KiB로 두고, api가 목록을 최근 것부터 잘라 보낸다. 잘린 옛 커밋은 다시 Catch가 될 수 있다(FR1.1과 어긋남). api에 자르기 규칙과 시험이 더 든다.
- X. Other (please specify)

[Answer]: A

## Q2. [운영] worker 운영 로그에 소속 관련 숫자를 더할지

바뀐 것이 없는 재분석은 결과가 빈다(기능 설계 W6). 지금 worker의 후보 판정 로그에는 후보·미제공 수만 있어, 결과가 빈 이유가 「모두 이미 소속」인지 다른 이유인지 로그로 구분되지 않는다.

- A. 더하지 않는다. 지금 로그 그대로다.
- B. 후보 판정 로그 한 줄에 숫자 두 개를 더한다: 받은 소속 SHA 수, 소속으로 버린 단위 수. SHA 자체는 남기지 않는다. 결과가 빈 재분석의 이유를 운영에서 바로 안다. 시험 1~2개를 더한다(1~2시간).
- X. Other (please specify)

[Answer]: B

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
