# U2 공용 기반 — 시험 안내

## 실행기와 설정

- api: 기존 `node --test` 실행기(`scripts/test-with-db.cjs`). 실행기가 시험 DB에 마이그레이션을 적용하므로 시험 DB가 떠 있어야 한다(api/README 「DB 테스트」). Redis를 쓰는 AiRun 시험은 로컬 Redis가 떠 있어야 한다.
- web: `node --test`. 새 시험 도구·설정 파일은 더하지 않는다.
- 파일 저장 설정: `dev-ci`와 예시 파일은 고치지 않는다. FileStorage·탈퇴 시험은 시험 안에서 임시 폴더를 만들어 `FILE_STORAGE_DRIVER=local`, `FILE_STORAGE_LOCAL_ROOT=<임시 폴더 절대 경로>`를 넣고 끝나면 지운다. "설정 없음" 시험은 두 값을 비우고 돌린다.
- 외부 AI: 실제 Claude를 부르지 않는다. U1처럼 Claude Messages API 응답 모양의 JSON을 시험 안에서 만들고 게이트에 시험용 fetch를 넘긴다. 키는 가짜 값만 쓴다.

## 이 Unit만 돌리는 명령

`api/`에서:

```bash
npm test -- test/u2/daily-run-limit.test.cjs test/u2/ai-consent.test.cjs test/u2/ai-run.test.cjs test/u2/file-storage.test.cjs test/u2/ai-gate-checks.test.cjs test/u2/ai-gate-jd.test.cjs test/u2/ai-gate-stream.test.cjs test/u2/withdrawal.test.cjs test/db/member-cascade-delete.test.cjs
```

U1 회귀(게이트 코드를 고치므로 함께 돌린다):

```bash
npm test -- test/ai-generation/citation-lines.test.cjs test/ai-generation/citation-request.test.cjs test/ai-generation/guarded-fetch.test.cjs test/ai-generation/response-items.test.cjs test/ai-generation/ai-generation-gate.test.cjs
```

커버리지(팀장이 넣은 명령):

```bash
TEST_COVERAGE_INCLUDE='dist/{ai-generation,ai-run,daily-run-limit,ai-consent,file-storage,withdrawal}/**' npm run test:coverage -- test/u2/daily-run-limit.test.cjs test/u2/ai-consent.test.cjs test/u2/ai-run.test.cjs test/u2/file-storage.test.cjs test/u2/ai-gate-checks.test.cjs test/u2/ai-gate-jd.test.cjs test/u2/ai-gate-stream.test.cjs test/u2/withdrawal.test.cjs test/ai-generation/citation-lines.test.cjs test/ai-generation/citation-request.test.cjs test/ai-generation/guarded-fetch.test.cjs test/ai-generation/response-items.test.cjs test/ai-generation/ai-generation-gate.test.cjs
```

`web/`에서:

```bash
node --test test/u2-consent.test.mjs test/u2-start-guide.test.mjs test/u2-withdrawal.test.mjs test/u2-error-pages.test.mjs test/u2-recipient-guide.test.mjs
node --test --experimental-test-coverage --test-coverage-include='src/**/*.ts' --test-coverage-include='src/**/*.tsx' test/u2-consent.test.mjs test/u2-start-guide.test.mjs test/u2-withdrawal.test.mjs test/u2-error-pages.test.mjs test/u2-recipient-guide.test.mjs
```

## 목표

- 시험량: Standard — 구성 요소마다 5~8개, 단위 시험과 경계(DB·Redis·HTTP) 통합 시험.
- 커버리지: U2가 만들거나 고친 api·web 파일의 줄 커버리지 80% 이상(mvp 기준). 못 미치면 기준을 낮추지 않고 그대로 보고한다.
- CI: `dev-ci`가 이 시험들을 돌린다. CI 설정은 고치지 않는다.

## 시나리오 표 (구현 전에 확정, functional-spec S1~S29)

| 시험 파일 | 시나리오 | 기대 결과 | 실패 조건 |
|---|---|---|---|
| daily-run-limit | S1 29회 뒤 실행 / S2 30회 뒤 실행 / S3 동시 두 번 / S4 KST 자정 | 허용 / 429 "오늘 한도에 도달했습니다"·남은 횟수 없음 / 하나만 허용 / 다른 날짜 행 | 31회 / 접수됨 / 둘 다 허용 / 같은 행 합산 |
| ai-consent | S5 동의 없는 접수 / S6 옛 판본 동의 | 403, 횟수 그대로 / 400, 행 없음 | 실행·횟수 증가 / 기록됨 |
| ai-gate-checks | S7 80,001자 / S8 인용에 없는 숫자 / S9 Catch PR 번호 / S10 해석에 숫자 / S11 api·C 표기 / S17 남은 항목 0개 | 호출 없이 AiInputTooLarge / 그 항목만 버림 +1 / 남음 / 버림 / api 통과·C는 발행본에 없으면 버림 / 정상 빈 결과 | 호출됨 / 남거나 다른 항목도 버림 / 버림 / 남음 / C 통과 / 오류 |
| ai-gate-jd | S12 머리줄 밖·물음표 규칙 위반 넷 / S12b 정상 머리줄 / S12c 기본 요약·질의응답 / S13 질문 숫자 / S14 질문의 JD 줄 표기 / S15 확인되지 않는 점의 JD 숫자 / S16·S16b·S16c·S16d "찾지 못함" | 넷 다 버림 +4 / 역할 붙음 / U1 동작 그대로·jdRole 없음 / 버림 / 남음 / 버림(한계) / SERVER_NOTICE 항목, 일반 낱말·첫 낱말 제외, 줄당 3개, sources 기준 | 하나라도 남음 / 역할 틀림 / U1 시험 실패 / 남음 / 버림 / 남음 / 항목 없음·잡음·4개 이상·publicationText 기준 |
| ai-gate-stream | S18 중간 잘림 | 끝난 항목만 나감 | 미완 항목이 나감 |
| ai-run | S19 Redis 끊김 / S20 콜론 runKey / S21 늦은 결과 | ENQUEUE_FAILED·시한 뒤 FAILED / 거부 / 버림·재시도 없음 | 예외·영원히 PENDING / 등록됨 / 저장·재시도 |
| file-storage | S22 `..` 키 / S23 없는 접두어 삭제 / 설정 없음 / 빈 문자열 / 틀린 값 | 거부 / 성공 / 호출 때 StorageUnavailable / 없음과 같음 / 기동 실패 | 뿌리 밖 접근 / 오류 / 기동 실패 또는 성공 처리 / 기동 실패 / 기동 성공 |
| withdrawal | S24 정상 / S25 2단계 실패 / 재요청 / S26 탈퇴 뒤 Access / S27 재가입 | 204·모두 지워짐 / 500·링크 차단 유지·회원 행 남음 / 성공 / 401 / 새 memberId | 남은 자료 / 204 / 실패 / 통과 / 이전 자료 |
| web u2-* | S28 404 / 동의 창 / 시작 안내 / 탈퇴 화면 | 홈 링크·내부 정보 없음 / 재전송 한 번 / 링크 여섯 / 성공·실패 상태 구분 | 스택 노출 / 재전송 반복 / 링크 누락 / 실패를 성공으로 |

S29(외부 Google 계정 로그인)는 배포 환경 수동 확인이라 통합 확인 표에 남긴다.

`ai-gate-jd`와 `u2-recipient-guide` 시험은 C-01·C-11 계약 수정 PR에 적은 모양으로 쓴다(계획 Step 12). 리뷰에서 모양이 바뀌면 그 두 시험 파일만 고친다.

## 대역(mock)과 시험 자료

- DB는 실제 시험 DB를 쓰고 대역으로 바꾸지 않는다. 시험마다 회원을 새로 만들고 끝나면 지운다.
- U4 `publication`, U6 `mcp_*` 표가 아직 통합 브랜치에 없으면 탈퇴 시험이 C-07·C-06 모양의 시험용 표를 시험 안에서 만들고 지운다. 두 Unit이 합쳐진 뒤에는 실제 표로 통합 시험을 다시 돌린다(U2 완료 조건).
- 시험 자료에는 실제 사용자 자료·키를 넣지 않는다.
