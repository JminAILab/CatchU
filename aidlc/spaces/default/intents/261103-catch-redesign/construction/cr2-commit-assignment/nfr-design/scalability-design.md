# CR2 소속 저장 — 확장성 설계

입력: `nfr-requirements/scalability-requirements.md`(NFR6.3), 기능 명세 `functional-design/functional-spec.md`, 지금 코드(`worker/app/request_context/settings.py`·`client.py`).

| ID | 설계 |
|---|---|
| NFR6.3 | `worker/app/request_context/settings.py`의 `max_response_bytes` 기본값을 64 KiB에서 1 MiB(1,048,576)로 바꾼다. 환경 설정으로 따로 바꾸는 길은 만들지 않는다(지금도 기본값만 쓴다). 넘으면 지금 전송 계층이 본문을 버리고 `CONTEXT_RESPONSE_TOO_LARGE`로 끝난다. api는 목록을 자르지 않는다. 시험은 소속 SHA 3,000개 응답을 해석하고, 1 MiB 기본값을 단언한다. |

## 한계(코드 요약에 적는다)

- 한 회원·한 저장소의 소속이 약 24,000개를 넘으면 그 저장소의 재분석이 매번 `CONTEXT_RESPONSE_TOO_LARGE`로 끝난다. 이 이유 코드는 지금 맥락 조회 실패 로그에 남으므로 운영에서 알아볼 수 있다. 수집 상한(요청당 3,000커밋)으로 보아 일어나기 어렵고, 일어나면 그때 상한을 다시 정한다.
- 확장 장치(분할·캐시)는 두지 않는다. 회원마다 진행 중 분석이 하나라 쓰기가 겹치지 않는다(가정 A4).
