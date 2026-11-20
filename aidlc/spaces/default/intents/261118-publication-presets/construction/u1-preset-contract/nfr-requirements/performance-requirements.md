# Performance Requirements — u1-preset-contract

근거: 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`(W2·W3·W4)와 `rules.md`(BR1.9·BR2.3·BR2.4·BR3.4), 요구사항 `inception/requirements-analysis/requirements.md`(NFR6), 계약 `inception/contract-design/contract-summary.md`(P-1), 코드 지식 기록 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`, 이 단계 질문 `nfr-requirements-questions.md`.

응답 시간 수치는 두지 않는다(포트폴리오 MVP, 이용자는 팀 관련자뿐 — 질문 파일 「정해 둔 것」). 대신 읽기 횟수가 데이터 양에 따라 늘지 않게 한다.

| ID | 요구 | 확인 방법 |
|---|---|---|
| NFR6.1 | 프리셋 목록(`GET /v1/presets`)은 그 회원의 프리셋 모두(최대 50개)를 한 번의 요청으로 돌려준다. 쪽을 나누지 않는다(BR1.9) | 프리셋 50개를 만든 회원으로 목록 시험: 50줄이 한 응답에 온다 |
| NFR6.2 | 목록·상세·세기 한 번에 DB 조회 수는 프리셋 수·항목 수와 무관하게 종류별로 일정하다. 프리셋·항목마다 따로 조회하지 않고, 원본(Catch·근거·소속 기록·보호 관측·텍스트 자료·PDF 쪽 글)은 종류별로 한 번에 읽는다 | 시험에서 프리셋 1개와 50개(항목 20개씩)의 조회 수를 세어 같음을 확인한다 |
| NFR6.3 | 세기 경로 한 번은 자료 1~50개다(BR2.4). Catch 고르기 목록의 한 쪽(20개), 회원의 PDF(최대 20벌)가 한 번에 들어간다 | 51개 요청이 400인 시험 |
| NFR6.4 | 발행 트랜잭션의 잠금은 지금처럼 원본 ID 집합으로 종류마다 한 번이다. 같은 자료가 여러 프리셋에 있어도 잠금 횟수는 늘지 않는다(BR3.7) | 같은 Catch가 두 프리셋에 있는 발행 시험이 통과한다 |
