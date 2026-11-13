<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-11T00:52:41Z [unit nc2-snapshot-fields] 사람이 플랜 승인 때 두 가지를 더하게 했다(문장 대조 실패 메시지에 상수 이름과 고칠 두 파일, 소속 기록 설명 자리에 표지 근거와 한계 상수 목록 한 줄). Step 12 전에 rag-eval.cjs의 JD 지시를 운영 상수로 바꾸게 했다(계획 밖, code-summary 「계획에서 벗어난 것」 5).
- 2026-11-11T00:52:41Z [unit nc2-snapshot-fields] 사람이 로컬 확인 DB를 catchu-cr1-db(55460, pgvector)로 바로잡았다. 5432의 catchu-db-86은 pgvector가 없는 옛 컨테이너다. 로컬 확인 환경은 NC1 code-summary의 기록을 먼저 보고 정한다.
- 2026-11-11T07:50:00Z [unit nc3-revisit-facts] 사람이 플랜 승인 때 Q1 B 빈틈을 막게 했다: RevisitFacts가 끝에서 자기 결과를 api 등록 검사와 같은 규칙으로 확인해, 규격을 어기면 정해진 예외로 그 후보 사실만 비게 한다(Step 5·6·8, 실패 조건 한 줄).
- 2026-11-11T07:50:00Z [unit nc3-revisit-facts] Step 16 최소 연결: 합성 분석은 개발 회원만 되고, 후보가 있는 MOCK 결과는 등록 단계에서 설계상 멈춘다(좌표 공급자 LIVE 전용). 그래서 사람이 cr1 DB 백업 뒤 Google 회원의 TheMe Catch 둘에 소속 기록 커밋으로 값을 직접 넣어 화면을 보고 되돌리게 했다. 로컬 실행은 cr1 환경 파일에 더해 ~/catchu-local-live/secrets.env를 값 출력 없이 불러와야 api(GitHub 설정)·worker(생성 키)가 뜬다.
- 2026-11-11T07:50:00Z [unit nc3-revisit-facts] 개발자에게 엔진 brief 전문 대신 표지 두 줄·파일 안내와 승인된 계획·시험 안내 파일 경로를 넘겼다(두 파일이 brief 본문과 같음). 가드는 막지 않았다.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
