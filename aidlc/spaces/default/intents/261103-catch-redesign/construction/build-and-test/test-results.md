# Catch 개편 — 빌드·시험 결과

실행: 2026-11-08, 이 작업 폴더(`worker/catch-개편`, CR2 커밋 `f2a48b66` 뒤), AC 전원, 부하 1분 평균 약 2.9. 시험 DB `catchu-db-test`(127.0.0.1:5433).

## 빌드

| 명령 | 종료 코드 | 시간 |
|---|---|---|
| `npm --prefix api run build` | 0 | 5초 |
| `npm --prefix web run build` | 0 | 6초 |
| worker `ruff check .`·`mypy` | 0 | 전체 시험 안에서 돌림 |

## Unit 시험(세 Unit의 `unit-test-instructions.md`, 같은 명령은 한 번)

| 명령 | Unit | 결과 | 종료 코드 |
|---|---|---|---|
| worker CR1 명령(11개 파일) | CR1 | 959 passed | 0 |
| worker CR3 명령(10개 파일) | CR3 | 655 passed | 0 |
| worker CR2 명령(10개 파일) | CR2 | 617 passed | 0 |
| web `node --test test/assets-view.test.mjs test/recipient.test.mjs` | CR1·CR3(같은 명령) | 61 pass / 0 fail | 0 |
| web `node --test test/u2-consent.test.mjs` | CR3 | 10 pass / 0 fail | 0 |
| api CR3 명령(고지·접수·동의 8개 파일) | CR3 | 147 pass / 0 fail / 1 skipped | 0 |
| api CR2 명령(7개 파일) | CR2 | 158 pass / 0 fail | 0 |

api CR3의 건너뜀 1건은 시험 안의 사유다(U6 실제 표가 있어 그 경우를 만들 수 없음, CR3 코드 요약).

## 전체 시험·커버리지(intent 검증 명령)

첫 실행(563초)은 api 시험 1건 실패로 종료 코드 1이었다.

- 실패한 시험: `test/runtime/bootstrap.test.cjs`의 「개발 소스 main: env 파일의 인증 설정으로 기동·발급·종료」(41초).
- 그 파일만 다시 돌리니 21 pass / 0 fail / 1 skipped였다. 같은 시험이 5.2초에 통과했다.
- 이 시험은 CR1·CR2·CR3이 바꾼 코드가 아니다. 한 시간 전 CR2 확인 검증에서도 통과했다.
- 실패 사다리 1단(이 단계 안 고침, 다시 돌림)으로 전체를 다시 돌렸다.

다시 돌린 결과(서비스마다 같은 명령을 차례로):

| 서비스 | 명령 | 결과 | 줄 커버리지 | 시간 |
|---|---|---|---|---|
| api | `lint && typecheck && test:coverage` | 1,794개 중 1,758 pass / 0 fail / 0 cancelled / 36 skipped | 98.39% | 8분 36초 |
| web | `lint && typecheck && test:coverage` | 905 pass / 0 fail | 95.45% | 21초 |
| worker | `ruff check . && mypy && pytest --cov` | 2,581 passed / 12 skipped | 96% | 2분 41초 |

같은 판본으로 CR2 확인 관문에서 돌린 intent 검증 명령도 종료 코드 0이었다(2026-11-07T15:08Z~15:20Z, 11분 57초).

## Target Verification Matrix

출처는 세 Unit의 `nfr-requirements/`·`nfr-design/`과 코드 생성 계획의 Testing Contract다. 판정은 각 목표의 「확인 기준」을 따른다.

### Testing Contract

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-COV-api | 세 Unit 계획 Testing Contract scope_floor | 줄 커버리지 80% 이상 | 98.39% | 위 api 전체 시험 | build-and-test | Met |
| TC-COV-web | 같음 | 80% 이상 | 95.45% | 위 web 전체 시험 | build-and-test | Met |
| TC-COV-worker | 같음 | 80% 이상 | 96% | 위 worker 전체 시험 | build-and-test | Met |
| TC-CI | 같음 「Run the selected tests in CI before merge.」 | CI에서 시험 | — | `aidlc-state.md`: ci-pipeline SKIP | — | N/A — the plan runs no CI Pipeline |
| TC-UNIT | 세 Unit 시험 안내 | Unit 명령 모두 통과 | 7개 명령 모두 종료 코드 0 | 위 「Unit 시험」 | build-and-test | Met |

### CR1 `cr1-readable-catch`

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| CR1-NFR1.1 | nfr-requirements/security | 생성 요청에 기록의 글 없음 | 요청 본문 시험 통과 | worker CR1 명령(`test_generation_flow.py`·`test_generation_material.py`) | build-and-test | Met |
| CR1-NFR1.2 | 같음 | 12월 AI가 근거 글을 지시로 따르지 않는지 확인 기록 | 확인 기록 있음 | CR1 코드 요약 | build-and-test | Met |
| CR1-NFR2.1 | nfr-requirements/performance | 생성 호출은 후보마다 1번, 기록의 글 제목이면 고쳐 쓰기 없음 | 호출 수 시험 통과 | worker CR1 명령(`test_generation_title.py`·`test_generation_flow.py`) | build-and-test | Met |
| CR1-NFR2.2 | 같음 | 판정 호출 0 | CR1엔 판정 코드 없음(CR3이 판정 추가, AI 쪽 꺼짐이면 0) | worker CR3 명령(꺼짐 경로 호출 0 시험) | build-and-test | Met |
| CR1-NFR4.1 | nfr-requirements/reliability | 같은 수집 결과면 기록의 글·작업 사실·재료가 같음 | 결정성 시험 통과 | worker CR1 명령 | build-and-test | Met |
| CR1-NFR4.2 | 같음 | 나뉘지 않던 단위의 열쇠는 그대로 | 작업 동일성 시험 통과 | `test_candidate_identity.py`·`test_candidate_cases.py` | build-and-test | Met |
| CR1-NFR7.1 | nfr-requirements/tech-stack | worker 문서 36,000 B 이하 | 문서 크기 검사 통과 | `.github/scripts/check-doc-sizes.sh`(CR2 코드 생성·검토에서 통과) | build-and-test | Met |

### CR2 `cr2-commit-assignment`

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| CR2-NFR4.1 | nfr-requirements/reliability | 같은 입력·같은 소속 집합이면 같은 열쇠·본인 목록, 재료 찾기가 모든 후보를 찾음 | 시험 통과 | `worker/tests/test_candidate_assignment.py` | build-and-test | Met |
| CR2-NFR4.2 | 같음 | 이미 있는 소속은 건너뛰고 반영 성공 | 시험 통과 | `api/test/catches/registration-postgres.test.cjs` | build-and-test | Met |
| CR2-NFR4.3 | 같음 | 소속 쓰기 실패면 전체 롤백 | 시험 통과 | 같은 파일 | build-and-test | Met |
| CR2-NFR4.4 | nfr-requirements/performance | 1,000행 묶음, 3,000개 모두 써짐 | 3,000개 등록 시험 통과, 더해진 시간 약 92ms(참고) | 같은 파일, CR2 코드 요약 | build-and-test | Met |
| CR2-NFR4.5 | nfr-requirements/observability | 로그에 `assignedShas`·`assignedUnits` | 시험 통과, 로컬 실제 분석 로그에서도 확인 | `test_candidate_assignment.py`, CR2 코드 요약 「로컬 실제 연결 확인」 | build-and-test | Met |
| CR2-NFR4.6 | nfr-requirements/security | 쓰는 길은 등록 하나 | 소속 표에 쓰는 코드가 `registration-service.ts` 한 곳 | CR2 코드 검토(READY) | build-and-test | Met |
| CR2-NFR4.7 | 같음 | 다른 회원 Catch로 쓴 행은 DB 거부 | 시험 통과 | `registration-postgres.test.cjs` | build-and-test | Met |
| CR2-NFR4.8 | nfr-requirements/performance | 유일 조건 열 순서 (member, repo, sha) | 마이그레이션·엔티티 대조 시험 통과 | api 전체 시험 | build-and-test | Met |
| CR2-NFR4.9 | nfr-requirements/security | 그 회원·저장소 것만, 키 없으면 401 | 시험 통과 | `api/test/db/worker-context-api.test.cjs` | build-and-test | Met |
| CR2-NFR4.10 | 같음 | 로그에 40자 16진수 없음 | 시험 통과 | `test_candidate_assignment.py` | build-and-test | Met |
| CR2-NFR4.11 | 같음 | 탈퇴 뒤 소속 0건, 삭제 목록 문서 행 | 시험 통과, 문서 행 있음 | `api/test/db/member-cascade-delete.test.cjs`, `api/docs/member-withdrawal-deletion.md` | build-and-test | Met |
| CR2-NFR4.12 | nfr-requirements/reliability | 연결 빈 묶음도 분석 계속, 빈 집합이면 지금과 같음 | 시험 통과 | `test_candidate_assignment.py` | build-and-test | Met |
| CR2-NFR6.1 | 같음 | 결과 판본 "3"(YAML·api 타입·worker), 나머지 "2" | 시험 통과 | `api/test/analysis/receiver.test.cjs`, `worker/tests/test_worker_messages.py` | build-and-test | Met |
| CR2-NFR6.2 | 같음 | 배포 안내에 함께 배포·진행 중 분석 없을 때 | 안내 있음 | CR2 코드 요약 「운영에 넣을 때」 | build-and-test | Met |
| CR2-NFR6.3 | nfr-requirements/scalability | worker 응답 상한 1 MiB, 3,000개 해석 | 시험 통과 | `worker/tests/test_request_context_settings.py`·`test_request_context.py` | build-and-test | Met |
| CR2-NFR6.4 | nfr-requirements/tech-stack | 엔티티와 마이그레이션 하나 | 엔티티·DDL 차이 0 | api 전체 시험 | build-and-test | Met |
| CR2-NFR6.5 | 같음 | 충돌 무시 삽입 | `orIgnore` 사용 | CR2 코드 검토(READY) | build-and-test | Met |
| CR2-NFR6.6 | 같음 | 표준 라이브러리만, 설정 기본값 | 새 의존성 없음 | CR2 코드 요약 | build-and-test | Met |
| CR2-NFR7.1 | 같음 | 새 문서, 큰 문서엔 링크만, 크기 검사 통과 | `worker/docs/commit-assignment.md` 6,144 B, 검사 통과 | CR2 코드 요약 | build-and-test | Met |

### CR3 `cr3-ai-drafts`

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| CR3-NFR1.1 | nfr-requirements/security | 생성 요청에 커밋 메시지·PR 제목 없음(켜져도) | 시험 통과 | worker CR3 명령(`test_generation_claude.py`·`test_generation_flow.py`) | build-and-test | Met |
| CR3-NFR1.2 | 같음 | Catch 판정 요청 입력 제한 | 시험 통과 | `test_judgement.py` | build-and-test | Met |
| CR3-NFR1.3 | 같음 | 재료 판정 입력 제한(가린 줄 없음) | 시험 통과 | `test_judgement.py` | build-and-test | Met |
| CR3-NFR1.4 | 같음 | 지시문·자료 분리, 답은 확률·고르기·점수만 | 시험 통과 | `test_judgement.py` | build-and-test | Met |
| CR3-NFR1.5 | 같음 | 저장 끔 설정이 있으면 켬, 없으면 고지 v3에 기본 보관 적음 | 설정 없음 → 고지 v3 3절에 적음 | CR3 코드 요약 「고지 v3」 | build-and-test | Met |
| CR3-NFR1.6 | 같음 | 저장소 안 경로를 주면 확인 명령이 거부 | 시험 통과 | `test_judgement_confirmation.py` | build-and-test | Met |
| CR3-NFR2.1 | nfr-requirements/performance | 판정 호출 N+M 이하, 꺼지면 0 | 호출 수 시험 통과 | `test_generation_flow.py` | build-and-test | Met |
| CR3-NFR2.2 | 같음 | 시간 제한 20초, 남은 시간 부족이면 안 보냄 | 시험 통과, FR10 가장 긴 재료 판정 2.4초 | `test_generation_flow.py`, CR3 코드 요약 | build-and-test | Met |
| CR3-NFR2.3 | 같음 | 요청당 판정 300·300 상한 | 시험 통과 | `test_generation_flow.py` | build-and-test | Met |
| CR3-NFR2.4 | 같음 | 판정 요청 질문 400개 이하 | 시험 통과 | `test_judgement.py` | build-and-test | Met |
| CR3-NFR2.5 | nfr-requirements/reliability | 자동 재시도 없음, 실패 코드 | 시험 통과 | `test_judgement.py` | build-and-test | Met |
| CR3-NFR2.6 | nfr-requirements/observability | 생성 로그에 판정 건수 | 로그 칸 있음(로컬 실제 분석 로그에서도 보임) | `test_generation_flow.py`, CR2 로컬 확인 worker 로그 | build-and-test | Met |
| CR3-NFR3.1 | nfr-requirements/reliability | FR10 기준 통과 뒤에만 켬 | 틀린 제목 0·틀린 문장 0, 팀장 결정 「켬」, 서버 설정은 v3 배포 뒤 | CR3 코드 요약 「FR10 확인」 | build-and-test | Met |
| CR3-NFR3.2 | nfr-requirements/observability | 판정 결과 건수 로그 | 로그 칸 있음 | `test_generation_flow.py` | build-and-test | Met |
| CR3-NFR4.1 | nfr-requirements/reliability | 판정은 경계·소속·열쇠를 바꾸지 않음 | 시험 통과 | `test_generation_flow.py`, CR2 `test_candidate_assignment.py` | build-and-test | Met |
| CR3-NFR5.1 | nfr-requirements/security | 키는 비밀값에만, 예시엔 이름만, 기동 뒤 환경에서 지움 | 시험 통과, 예시는 이름만 | `test_consumer_settings.py`, `worker/.env.example` | build-and-test | Met |
| CR3-NFR5.2 | 같음 | 키·원문을 로그·결과·화면에 남기지 않음 | 시험 통과 | `test_judgement.py`·`test_consumer_settings.py` | build-and-test | Met |
| CR3-NFR5.3 | 같음 | 배포 안내에 두 켜는 설정과 「고지 v3 뒤」 | 안내 있음 | `worker/docs/generation-judgement.md` 배포 안내 | build-and-test | Met |
| CR3-NFR7.1 | nfr-requirements/tech-stack | 새 문서, 모든 worker 문서 36,000 B 이하 | 검사 통과 | `worker/docs/generation-judgement.md`, 문서 크기 검사 | build-and-test | Met |

### 화면

화면 쪽 시험(목록 2줄, 설명 칸 숨김, 받은 사람 안내)은 Node에서 컴포넌트 출력과 원문을 단언했다. 실제 브라우저에서 돌린 시험은 아니다. 화면은 팀장이 로컬 실제 분석 때 브라우저로 봤다(CR1 확인 다섯 가지, CR2 세 번 분석).

## 남은 것

- CR3 FR10 확인표 원문이 아직 `~/catchu-local-live/cr3-fr10/`에 있다. 「확인이 끝나면 팀장이 지운다」(NFR1.6)는 팀장 정리 몫이다.
- cr1 로컬 환경(DB·큐 컨테이너, `~/catchu-local-live/cr1/`)이 남아 있다. 정리는 cr1 도구 README 「끝난 뒤 정리」다.
