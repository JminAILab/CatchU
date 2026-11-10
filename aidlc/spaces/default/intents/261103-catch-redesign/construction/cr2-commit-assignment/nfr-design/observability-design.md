# CR2 소속 저장 — 관측 설계

입력: `nfr-requirements/observability-requirements.md`(NFR4.5), 기능 명세 `functional-design/functional-spec.md` W6, 지금 코드(`worker/app/candidates/build.py`의 `_log`, `_Tally`).

| ID | 설계 |
|---|---|
| NFR4.5 | 후보 판정 종료 로그(「후보 판정 종료: …」)의 형식 문자열 끝에 `assignedShas=%d assignedUnits=%d`를 더한다. `assignedShas`는 받은 소속 집합의 크기, `assignedUnits`는 빼기로 버린 단위 수(BR1.4)다. 버린 단위는 지금 미제공 집계(`_Tally`)에 넣지 않고 따로 센다. 로그 수준 규칙(합친 후보가 있으면 WARNING)은 그대로다. 저장소를 확인하지 못한 수집의 이른 종료 로그에는 둘 다 0이다. |

## 읽는 법

- `candidates=0`이고 `assignedUnits>0`, 미제공 수가 모두 0이면 「바뀐 것이 없는 재분석」이다(기능 명세 W6).
- `assignedShas=0`이면 첫 분석이거나 합성 요청이다.

## 두지 않는 것

- 지표·경보·대시보드·추적 ID 추가 없음. 맥락 조회 실패는 지금 이유 코드 로그(`CONTEXT_RESPONSE_TOO_LARGE` 등)로 본다.
