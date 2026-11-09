# CR2 소속 저장 — 성능 요구사항

입력: CR2 기능 설계(`functional-spec.md` W1·W7, `rules.md` BR3.2), 요구사항 `inception/requirements-analysis/requirements.md`의 NFR4·NFR6, 이 단계의 답 `nfr-requirements-questions.md`(Q1 A, Q2 B), 지금 코드(`api/src/catches/registration-service.ts`, `worker/app/request_context/settings.py`).

| ID | 요구사항 | 확인 기준 |
|---|---|---|
| NFR4.4 | 소속 쓰기는 Catch 하나마다 한 번에 최대 1,000행씩 묶어 쓴다. 행마다 따로 쓰지 않는다. 후보 하나의 최대는 3,000행(수집 상한)이다. | 시험: 3,000개 SHA 후보를 등록하면 3,000행이 모두 써진다. 코드 생성 때 3,000행 등록에 더해진 시간을 한 번 재서 `code-summary.md`에 적는다. 일반 시험에 시간 단언은 넣지 않는다. |
| NFR4.8 | 맥락 조회의 소속 SHA 읽기는 (회원, 저장소)로 좁힌 한 번의 조회다. 소속 기록의 유일 조건 (회원, 저장소 ID, SHA)의 앞부분이 이 조회를 받친다. 따로 색인을 더하지 않는다. | 마이그레이션 시험: 유일 조건 열 순서가 (member_id, github_repository_id, commit_sha)다. |

## 정하지 않는 것

- 응답 시간 목표 수치는 새로 두지 않는다. 맥락 조회는 지금 worker 읽기 시간 제한(5초) 안에서 끝나야 하고, 결과 반영은 지금 반영 시한 안에서 끝나야 한다. 둘 다 기존 장치다.
- 결과 메시지 크기 상한을 더하지 않는다. SHA 하나가 약 43바이트라 결과 하나가 수백 KB를 넘기 어렵고, worker 결과 한도(16 MiB)와 큐에 여유가 있다(계약 C2의 열린 질문을 여기서 닫는다).
