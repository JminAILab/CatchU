# U7 본인 커밋 관측과 측정

현행 메시지는 `api/contracts/repository-analysis`의 v2다. 과거 10월 승인 YAML은 보존하며 런타임은 새 정본만 읽는다. 네 메시지 종류의 v1 혼입·추가 필드·필수 관측 누락·잘못된 조합은 거부한다. [API 등록·배포 조건](../../api/docs/repository-analysis-u7.md)을 함께 따른다.

수집은 연결 GitHub 숫자 ID로 본인 커밋 SHA를 중복 제거해 센다. 기본 목록·관계·기준 브랜치에서 하나라도 확인하면 FOUND다. 필요한 조회를 마쳤고 방해 한계·불명 작성자가 없으며 본인 커밋이 0개일 때만 NONE이다. 이 경우 PR/이슈 후보도 Catch로 만들지 않는다. 그 밖에는 UNKNOWN이다. 후보 0개는 본인 커밋 0개의 증거가 아니다.

`CollectionOutcome.with_observation` → 후보 출력 → `GenerationOutput` → 생성 → Result까지 관측/수집 한계를 유지한다. 후보 없는 조기 종료, 부분 수집, 생성 실패에서도 이미 확인한 FOUND를 버리지 않는다. 요청 조회 불명은 UNKNOWN/null이며 실행 불명과 확인된 실패를 기존 방식대로 구별한다. 작업 동일성, 본인 기여, 가리기, Haiku 5.5 및 생성 실패 자동 재시도 없음 규칙은 그대로다.

안전 집계는 기존 로그의 목록·상세·관계·호출·응답 bytes·후보/제외·생성 건수에 수집 소요초, 결과 bytes·관측 수·한계 수·처리 소요초를 더한다. 토큰·저장소 원문·diff·SHA·파일 경로를 새 집계 로그에 넣지 않는다. 동시 실행 수는 1이다.

`tests/test_u7_budget.py`는 합성 커밋 500개와 필수 관계를 읽고 기존 상세 상한 200·후보 200·생성 200·Result 200을 대조한다. 관측 FOUND/500과 수집 한계가 함께 남는다. `tests/u7_chain_output.py`는 API 통합 시험이 넘긴 실제 v2 요청 맥락에 이 합성 흐름을 실행하고 Result와 안전 집계만 stdout으로 반환한다. 실제 GitHub·모델 실행이나 상한 확정의 근거가 아니다.

검사: `uv run --locked pytest tests/test_u7_observation.py tests/test_u7_pipeline.py tests/test_u7_budget.py tests/test_worker_messages.py tests/test_request_check.py tests/test_processing.py tests/test_live_processing.py`. 전체 수집·후보·생성·소비자 회귀와 80% 줄 커버리지는 [Unit 검사 지침](../../aidlc/spaces/default/intents/260925-intent-12/construction/u7-repository-analysis/code-generation/unit-test-instructions.md)을 따른다. 실제 큐는 전용 `CATCHU_TEST_REDIS_URL`이 필요하다. Linux 프로세스 신호 검사는 배포 플랫폼에서 확인하며 Windows의 `/proc`, SIGKILL, signal handler 차이는 별도 기록한다.

현재 실제 분석은 CatchU 공개 적용, 실제 C-03 제공자, 고지 v2 확정, 계정·자료·외부 전송·비용 조건을 확인하기 전에는 실행하지 않는다. 실제 약 500개에서 목록/상세/관계/묶음·제외/생성/전달/DB 반영 수와 시간·bytes를 대조한 뒤 최종 상한을 결정한다.
