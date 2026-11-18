# 코드 요약 — #559 받은 사람 질의응답 고치기

## 커밋

- `126ae048`(단계 A): 게이트 실패 로그 칸과 평가 기록의 게이트 로그 수 칸
- `6675f23d`(단계 B): 같은 Catch 줄 붙이기·항목 머리글·지시 수정·출처 옆 항목 제목·문서·계약 줄과 기준선 기록
- 브랜치 `api/질의응답-조각-답문구`이고, 아직 push하지 않았다.

## 만들고 바꾼 파일

| 쪽 | 파일 | 내용 |
|---|---|---|
| api 게이트 | `api/src/ai-generation/checked-gate.ts` | `ai_gate_failed`에 `dropReasons`·`nonItemLineCount`·`stopReason`(한 번 호출·스트리밍 공통 `fail()`) |
| | `api/src/ai-generation/ai-generation.types.ts` | `AiSource.itemContext?`(C-01 더하는 변경) |
| | `api/src/ai-generation/citation-request.ts` | 인용 문서 `context` = 자료 종류 + ` · ` + 머리글(있을 때만) |
| | `api/src/ai-generation/gate-policy.ts` | 입력 길이 검사에 머리글 길이도 셈 |
| api 질의응답 | `api/src/rag-answer/qna-sources.ts`(새) | `buildQnaSources`(같은 Catch 줄 붙이기·상한·건너뛰기·머리글), `chunkToSource`(옮김), 둘째 줄 다듬기, 한글 표 글자 |
| | `api/src/rag-answer/rag-answer-config.ts` | 상한 12·40·200(시작 값, 다시 잰 뒤 고치지 않음), `QNA_INSTRUCTION` 앞 문장 |
| | `api/src/rag-answer/qna-service.ts`·`qna.controller.ts`·`rag-answer-log.ts` | 사본으로 근거 만들기, `admit`에서 사본 읽기(NotFound면 404), `qna.completed.unattachedLineCount` |
| 평가 | `api/scripts/rag-eval/rag-eval.cjs`·`rag-eval-report.cjs` | 질문별 게이트 로그 수 칸(단계 A), 앱과 같은 `buildQnaSources`로 요청 만들기와 질문별 못 붙인 줄 수(단계 B) |
| web | `web/src/features/rag-answer/item-title.ts`(새)·`gated-item-view.tsx`·`base-summary-panel.tsx`·`qna-panel.tsx`·`rag-answer.module.css` | 출처 단추 뒤 항목 제목 `<span>`(Tab 순서 밖), 선택 prop `itemTitleOf` |
| | `web/src/features/recipient/recipient-view.tsx`·`recipient-slots.ts`(주석) | 받은 사람 화면의 2·3번 패널에만 제목 찾기 함수를 넘김. JD 패널에는 넘기지 않음 |
| | `web/src/features/publications/publication-detail-view.tsx` | 작성자 요약 패널에 제목 찾기 함수 |
| 문서 | `api/docs/rag-answer.md`·`api/docs/ai-generation.md`·`web/src/features/rag-answer/README.md`·`web/src/features/recipient/README.md` | 규칙·값·로그 칸·알려진 한계 셋·12월 FR6.2 읽는 법·평가 스크립트 |
| 계약 | `aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md` | C-01 `itemContext?` 한 줄, C-11 2번 자리 줄과 작성자 요약(owner-summary) 줄에 `itemTitleOf` |
| 기록 | `api/docs/rag-evaluation/2026-11-16-baseline.md` | 기준선 실행 결과와 메모 |

## 주요 결정

- **머리글에 숫자·영문자를 쓰지 않는다.** 요구사항 FR2.2의 「발행 항목 순번」 대신, 숫자 자리에 한글 한 글자(가·나·다…)를 쓴다(코드 계획 변경 요청 1번).
  - 표 글자는 사본 항목 전체를 position 순서로 세어 매긴다.
  - 둘째 줄이 같은지는 다듬고 200자로 자른 뒤의 글로 Catch끼리만 비교한다. 같으면 둘 다 `「표」 둘째 줄`이 된다.
- **게이트 로그 받기**: 평가 스크립트 안에서만 Nest `Logger.overrideLogger`로 받았다(`@nestjs/common` 12.0.4에서 확인). 그래서 계획의 대안(`GatedOutput.dropReasons`, C-01 변경)은 쓰지 않았다.
  - 원래 로거로 되돌리는 데 Nest 내부 속성 `Logger.staticInstanceRef`를 쓴다. Nest를 올리면 다시 봐야 한다. 그때 S17 시험이 깨져 알려 준다.
- **실패 로그 칸**: 계획의 셋(항목 아닌 줄 수, 끝난 이유, 위치 버림 수)을 넓혀, 버린 이유별 수(`dropReasons`)를 모두 남겼다. 잘림까지 있어야 세 경우가 갈린다. 남는 것은 모두 수다.
- **같은 칸 빼기**: 검색으로 맞은 (항목, 칸)은 붙이지 않는다. 맞은 조각끼리는 빼지 않으므로 검색 8개는 늘 그대로 간다.
  - 사본에 없는 항목의 맞은 조각은 머리글 없이 보낸다.
- **실패 처리**
  - 사본 읽기가 `NotFound`이면 `qna.rejected`(`LINK_UNAVAILABLE`)를 남기고 404다. 그 밖의 오류는 500이다. 둘 다 질문 수를 세기 전이다.
  - `buildQnaSources`는 생성 단계 안에서 부르므로, 사본 모양이 틀리면 `GENERATION_FAILED`다.
  - **위험(코드 생성 리뷰 R-03, 팀장 결정으로 그대로 둠)**: `buildQnaSources`는 `buildSummarySources`를 통째로 부르므로, 사본 어디 한 군데 모양이 틀려도 그 발행본의 모든 질문이 실패한다. 이 일 전에는 질의응답이 사본 모양과 무관했다.
    - 실패는 질문 수를 센 뒤, 다시 쓰기·검색(비용 발생)까지 마친 다음에 난다.
    - 같은 사본에서는 기본 요약도 실패하므로 새 위험은 작다. 다만 실패하는 시점이 늦다.
    - 모양 오류일 때 검색 조각만으로 조용히 답하게 하지 않는다. 그렇게 하면 고친 동작이 빠진 답이 실패 없이 나가기 때문이다.
  - `unattachedLineCount`는 생성 전에 끝난 질문에서 null이고, 평가 기록에서는 `-`다.
- **기준선(Step 5a)**: 5번은 재현되지 않았다(항목 1·버림 0·`end_turn`). 그래서 FR5.3의 항목 꼴 고침은 없다.
  - 팀장 결정(2026-11-16): 답 실패는 `NO_ITEMS`와 통과 항목 0개 질문(기준선의 8번)을 함께 센다.
  - 실행 메모와 한계는 기준선 기록에 적었다.

## 승인 때 함께 고친 것(코드 생성 리뷰, 2026-11-16 팀장)

- **R-01**: 둘째 줄 다듬기를 고쳤다(`qna-sources.ts` `sanitizeItemContextLine`).
  - 탭·세로 탭·쪽바꿈·U+0085는 지우지 않고 빈칸으로 바꾼다.
  - 서식 문자(Cf) 전체를 지운다. 글 방향 제어, 폭 없는 공백·이음, U+FEFF, U+2060~U+2064, U+061C, 태그 문자가 여기에 든다.
  - 시험 사례 하나를 더했다(`qna-sources.test.cjs` 14/14 통과). `api/docs/rag-answer.md`의 다듬기 설명도 고쳤다.
- **R-02**: `api/docs/rag-answer.md` 알려진 한계에 「상한 때문에 붙지 못하면 인용할 수 없다」를 더했다. 다시 재기에서 질문별 대조 버림과 못 붙인 줄 수를 나란히 본다.
- **R-03**: 그대로 두고, 위 「실패 처리」에 위험으로 적었다.
- **R-04**: 빌드와 시험 단계 첫 줄에 「`qna-controller.test.cjs`는 테스트 DB가 필요하다」를 옮긴다.
- **R-05**: 계약 C-11 2번 자리 줄에서 「팀원 3과 PR 리뷰에서 맞춤」을 뺐다. 작성자 요약 줄에는 그 문구가 없었다.

## 계획과 달라진 곳

- **C-11 owner-summary 줄**: 계획은 C-11 2·3번 자리 한 줄만 적었다. 작성자 화면에도 같은 prop을 넘기므로, 그 줄에도 짧게 덧붙였다(같은 규칙을 적은 다른 자리, 프로젝트 규칙).
- **실패 로그 칸 범위**: 위 「주요 결정」대로 `dropReasons` 전체를 남겼다.
- **시험 안내 문장**: 「이 범위의 시험은 DB를 쓰지 않는다」는 틀렸다. `qna-controller.test.cjs`에는 테스트 DB가 필요하다. 승인된 안내는 고치지 않았다. 대신 시험을 이렇게 돌렸다.
  - 로컬 테스트 DB `catchu-db-test`(127.0.0.1:5433)를 팀장 허락을 받고 켰다.
  - 환경변수 `DB_HOST=127.0.0.1 DB_PORT=5433 DB_USER=catchu DB_PASSWORD=catchu_local DB_NAME=catchu_test`(README 기본값)를 붙여 돌렸다.
- **준비 명령**: 이 폴더에 `node_modules`가 없어 `api/`·`web/`에서 README의 `npm ci`를 돌렸다. 잠금 파일 그대로이고 새 의존성은 없다.

## 시험

| 명령 | 결과 |
|---|---|
| `npm --prefix api run lint` / `typecheck` | 오류 0 / 오류 0 |
| `npm --prefix web run lint` / `typecheck` | 오류 0 / 오류 0 |
| `npm --prefix api run build` | 성공 |
| api 범위 시험 7개 파일(테스트 DB 환경변수 붙임) | 75/75 통과(바꾸기 전 기존 55개 + 새로 20개) |
| 같은 명령, 테스트 DB 없이 | 58/75. 실패 17은 모두 `qna-controller.test.cjs`의 DB 연결 |
| web 범위 시험 6개 파일 | 100/100 통과(바꾸기 전 96 + 새로 4) |
| `.github/scripts/check-doc-sizes.sh` | 통과(rag-answer.md 29,527 B, ai-generation.md 27,396 B, 상한 36,000 B) |

- 새 시험: `api/test/rag-answer/qna-sources.test.cjs` 13개(S1~S7, S13, S15, S16), `web/test/rag-answer-item-title.test.mjs` 4개(S14, S15)
- 기존 시험에 더한 사례: `ai-gate-checks`·`ai-gate-stream`(S9), `rag-eval`(S12·S17), `citation-request`(S8), `qna-controller`(S10·S11)
- 기존 시험에서 새로 깨진 것은 없다. `qna-controller` 첫 시험의 `qna.completed` 기대값에 새 칸 `unattachedLineCount: 0`을 더했다.

## 쓰고도 이 단계에서 돌리지 않은 시험

- **DB를 쓰는 주변 시험**: base-summary-handler·summary-controller·rag-answer-app·jd-summary 시험은 돌리지 않았다. 테스트 DB에 마이그레이션이 없어 `member_account`가 없다고 실패한다. 이번 변경과는 관계없다. 전체 시험(`npm --prefix api test`, 마이그레이션 포함)은 빌드와 시험 단계에서 돈다.
- **다시 재기(NFR1)**: 실제 Claude·Voyage를 부르므로 팀장 확인 뒤 빌드와 시험 단계에서 한다.
  - 기준선과 나란히 적을 것: 질문별 대조 버림(fact), 질문별 못 붙인 줄 수, 답 실패(`NO_ITEMS` + 통과 0개)

## 남은 일

- **PR 리뷰**: C-11 `itemTitleOf`(받은 사람 화면 담당 팀원 3)를 맞춘다.
- **코드 기록**: `aidlc/spaces/default/codekb/CatchU/`에 옛 지시 문장과 `chunkToSource` 위치가 남아 있다. 계획의 「함께 고칠 문서」 밖의 역분석 기록이라 고치지 않았다.
- **켜 둔 컨테이너**: `catchu-db-test`(5433), `catchu-nc3-measure-db`(55470). 다시 재기 때 다시 쓴다.
