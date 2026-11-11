# NC3 다시 볼 곳 사실과 작업 시각 — 관측 설계

입력:
- NFR 요구 `construction/nc3-revisit-facts/nfr-requirements/observability-requirements.md`(NFR4.1~NFR4.3)
- 기능 명세 `construction/nc3-revisit-facts/functional-design/functional-spec.md`(10절), 규칙 `rules.md`(BR2.4)
- 계약 `inception/contract-design/contract-summary.md` C4
- 이 단계의 답 `nfr-design-questions.md`(Q1)

새 지표·대시보드·알림·추적은 두지 않는다.

## 1. 판정 실패 로그 (NFR4.3)

- **자리:** LiveGenerator가 RevisitFacts를 부르는 곳(신뢰성 설계 1절).
- **꼴:** `logger.error("다시 볼 곳 계산 실패: requestId=%s attemptId=%s error=%s", request.request_id, request.attempt_id, type(error).__name__)`
  - 칸은 고정 문구, 요청 ID, 시도 ID, 예외 종류 이름 넷뿐이다.
  - 예외 메시지·경로·줄 글자·커밋 메시지·식별값·작업 식별값은 싣지 않는다. 지금 `consumer/service.py`의 종류 이름 로그와 같은 꼴이다.
- **세기:** 빌드와 시험에서 측정 분석의 worker 로그를 고정 문구 「다시 볼 곳 계산 실패」로 찾아 0줄을 확인하고 기록한다.
- **시험:** worker 시험이 로그 기록을 잡아 한 줄의 칸이 넷뿐이고, 경로와 예외 메시지 글자가 없는지 본다.

## 2. 규칙 사실 대조와 버림 기준 (NFR4.1, NFR4.2)

- 새 로그 없이 빌드와 시험 때 로컬 DB에서 센다(NFR 요구 Q3 A).
- 질의 꼴(빌드와 시험 기록에 적을 것):

```sql
SELECT f->>'kind' AS kind, count(DISTINCT c.catch_id) AS catches
FROM catch_asset c, jsonb_array_elements(c.revisit_facts) f
WHERE c.source_request_id = $1 GROUP BY 1;
-- 분모: SELECT count(*) FROM catch_asset WHERE source_request_id = $1;
```

- 절반 넘게 붙거나 5% 미만으로 붙는 종류는 BR2.4 상수에서 빼는 worker 코드 변경으로 끈다.
- 사람 대조 30~50줄은 화면의 「다시 볼 곳」 문장과 GitHub 원문을 맞춰 줄마다 맞음·틀림을 기록한다.

## 3. 바꾸지 않는 로그

- worker 종결 로그 칸은 그대로다. 바꾸기 전·후 비교(호출 수, `elapsedSeconds`, `resultBytes`)에 쓴다.
- api 결과 거부·등록 입력 오류 로그는 그대로다. 새 칸 이름은 오류 칸(field)에만 들고 값은 싣지 않는다.

## Sources

- `construction/nc3-revisit-facts/nfr-requirements/observability-requirements.md`
- `construction/nc3-revisit-facts/functional-design/functional-spec.md` 10절, `rules.md` BR2.4
- `inception/contract-design/contract-summary.md` C4
- `construction/nc3-revisit-facts/nfr-design/nfr-design-questions.md`
- 지금 코드: `worker/app/consumer/service.py`, `worker/app/processing/pipeline.py`
