# NC2 면접관 사본 칸과 표지 — 코드 요약

계획 `code-generation-plan.md` Step 1~12를 마쳤다. 시험 방식은 Testing Contract(custom)대로, 시험 파일마다 시나리오·기대 결과·실패 조건 주석을 먼저 쓰고(Step 3) 세부 시험 코드는 구현 뒤에 썼다.

## 만들거나 고친 파일

새 파일:
- `api/src/publications/work-limit-sentences.ts`: 한계 문장 상수 넷(`WORK_LIMIT_SENTENCES`·`WORK_LIMIT_PREFIXES`)과 고르는 함수 `isWorkLimit`·`pickWorkLimits`
- `api/test/publications/work-limit-sentences.test.cjs`

api:
- `api/src/publications/published-snapshot.ts`: `SnapshotEvidence`(선택 칸 `ownCommit?`)와 `CatchSnapshot`의 선택 칸 셋
- `api/src/publications/snapshot-builder.ts`: 행 형의 새 칸, `commitShaOf`·`koreanMonth`, `buildCatchSnapshot`이 새 칸을 담음
- `api/src/publications/publish.service.ts`: 잠금 조회에 `repository_registration`을 별칭 `rr`로 세 칸(`member_id`, `registration_id`, `repository_id`) LEFT JOIN·작성자 설명 시각, 근거 조회에 `coverage_limits`, 소속 기록 질의(회원·Catch·식별값으로 좁혀 한 번), 트랜잭션 결과 `repositoryNameMissing`과 커밋 뒤 경고
- `api/src/publications/publications-log.ts`: 사건 `SNAPSHOT_REPOSITORY_NAME_MISSING`과 `snapshotRepositoryNameMissing`
- `api/src/rag-answer/rag-answer-config.ts`: `AUTHOR_MATERIAL_VOICE_INSTRUCTION`을 `QNA_INSTRUCTION`·`BASE_SUMMARY_INSTRUCTION` 끝에 붙임
- `api/src/jd-summary/jd-generation-request.ts`: 같은 상수를 붙인 `JD_SUMMARY_INSTRUCTION`(새 내보내기, U10 영역)
- `api/src/catches/entities/commit-assignment.entity.ts`: 주석만(소속 기록이 표지 근거로도 쓰인다는 것, 한계 문장 상수 목록)
- `api/scripts/rag-eval/rag-eval.cjs`: 스크립트 전용 JD 지시를 빼고 운영 상수 `JD_SUMMARY_INSTRUCTION`을 불러 씀(아래 「계획에서 벗어난 것」 5)
- 시험: `api/test/publications/publish-api.test.cjs`·`publications-logging.test.cjs`·`support.cjs`(작성자 설명 시각·근거 한계 넣기, 등록 이름 고르기, `insertCommitAssignment`, `hideRegistrationNames`), `api/test/published-index/chunker.test.cjs`, `api/test/rag-answer/summary-sources.test.cjs`·`qna-controller.test.cjs`·`base-summary-handler.test.cjs`, `api/test/jd/jd-summary.test.cjs`
- 문서: `api/docs/publications.md`(「사본 선택 칸 넷 (새 Catch NC2, 계약 C3)」 절, 로그 표 한 줄, 시험 목록), `api/docs/published-index.md`(한 줄), `api/docs/catch-registration-rules.md`(「소속 기록 (CR2)」에 두 줄)

web:
- `web/src/lib/github-link-name.ts`: `OwnCommit`·`ownCommitsOf`·`isOwnCommitLink`, 표지 자리 주석 고침
- `web/src/features/publications/publications-api.ts`: 사본 형과 모양 검사
- `web/src/features/publications/snapshot-view.tsx`: 저장소 줄·작성 시점·한계 목록·표지, 새 내보내기 `editedMonthText`
- `web/src/features/publications/publications.module.css`: `.ownCommitMark`(`.kindBadge` 규칙을 함께 쓰고 왼쪽 여백 하나)
- `web/src/features/recipient/recipient-api.ts`: `pickItem`이 새 칸을 옮김
- 시험: `web/test/github-link-name.test.mjs`, `web/test/recipient.test.mjs`, `web/test/publications-owner.test.mjs`
- 문서: `web/src/features/publications/README.md`, `web/src/features/recipient/README.md`

## 주요 결정

- **본인 커밋 판정:** 소속 기록 행이 (근거의 Catch, 그 Catch의 분석 요청 `repository_id`, 근거 커밋 주소 식별값)과 맞고 회원도 같을 때만 참이다. 다른 저장소의 같은 식별값은 참이 되지 않는다(NFR 설계 검토 Major). 근거 주소의 소유자/저장소 이름을 등록 이름과 한 번 더 견주는 검사는 두지 않았다.
- **저장소 줄 자리:** `CatchSnapshotView` 맨 위에 그린다. 결과는 h3 바로 아래, 불일치 표지 위다. 시험이 `</h3>` 바로 뒤에 오는지 본다.
- **안전망 시험:** 순수 함수 시험이 이름이 null인 행을 `buildCatchSnapshot`에 넘긴다. 서비스·로그 시험은 `hideRegistrationNames`(발행 트랜잭션 manager를 감싸 잠금 조회 결과의 등록 이름만 null로 바꾸는 대리)로 실제 경로를 끝까지 돌린다. 칸이 빠지고, 커밋 뒤 경고가 남고, 롤백이면 남지 않는다.
- **공통 지시 상수 자리:** `rag-answer-config.ts`에 두고 JD 요약이 불러 쓴다.

## 시험 결과

| 실행 | 고치기 전(Step 2) | 고친 뒤 |
|---|---|---|
| api Unit 명령 | 56/56 통과 | 75/75 통과 |
| web Unit 명령 | 100/100 통과 | 118/118 통과 |
| `rag-eval.test.cjs`(스크립트 변경 뒤, 오케스트레이터가 돌림) | — | 8/8 통과 |

- 새 web 파일 확인용 커버리지: `github-link-name.ts` 줄 100%, 분기 98.98%(판정용 아님).
- 문서 크기 검사(`docs-size`): 통과. 가장 큰 바뀐 문서 `api/docs/publications.md` 32,791 B(상한 36,000 B).

### intent 검증 명령 (Step 11, `verification-command.txt`의 단계를 서비스별로 나눠 돌려 시간을 쟀다)

- 시작 전: 충전기 연결. 1분 부하가 Unit 시험 직후 8.43이라 4.48로 내려간 뒤 시작했다.

| 서비스 | 결과 | 걸린 시간 |
|---|---|---|
| api | lint·typecheck 통과. `test:coverage` 1767개 중 1730 통과·0 실패·37 건너뜀. 줄 커버리지 98.40% | 453초 |
| web | lint·typecheck 통과. `test:coverage` 1004/1004 통과. 줄 커버리지 93.42% | 20초 |
| worker | ruff·mypy 통과. pytest 2581 통과·12 건너뜀. 커버리지 96% | 174초 |

- api 37개·worker 12개 건너뜀이 어디서 오는지는 확인하지 않았다. 이 Unit은 건너뛰는 시험을 더하지 않았다.
- `rag-eval.cjs` 변경은 이 검증 뒤에 했다. 그 뒤로는 `rag-eval.test.cjs`만 다시 돌렸다(위 표).

## 이 Stage에서 쓰고 돌리지 않은 시험

- 없음. Unit 명령의 시험은 모두 돌렸다.
- AC8.1.1~AC8.1.3의 답 말투는 이 Unit 시험이 판정하지 않는다. 지시 문장이 붙었는지만 본다. 판정은 빌드와 시험의 질의응답 10개 다시 재기(FR11.2, NFR3)다.

## 계획에서 벗어난 것

1. **h4 시험 고침이 필요 없었다.** 「작성자 설명」 h4를 글자로 찾는 기존 web 시험이 없었다(모두 부분 글자 대조). 새 시험이 h4 안 작성 시점을 직접 본다.
2. **새 내보내기 `JD_SUMMARY_INSTRUCTION`.** 계획에 이름이 없었다. U10 영역이고, 어차피 U10 담당 확인을 받는 JD 지시 변경 안이다.
3. **시험 도우미 `api/test/publications/support.cjs` 고침.** 계획의 「publications 시험」 범위 안이다.
4. **기존 시험 기대 고침.** `publish-api.test.cjs`의 S4(저장된 사본 전체를 견주는 시험)가 새 칸을 기대하게 고쳤다. 계약 C3에 따른 것이다.
5. **`api/scripts/rag-eval/rag-eval.cjs` 고침(Step 12 확인 전 팀장 결정, 2026-11-11).** 스크립트 전용 JD 지시(`SCRIPT_JD_INSTRUCTION`)를 빼고 운영 상수 `JD_SUMMARY_INSTRUCTION`을 불러 쓴다. 재는 것과 실제를 같게 하기 위해서다. JD 결과를 판정에 쓰지 않는다는 앞 결정은 그대로다.

## 문서 확인

- `api/docs/catch-visibility.md`: 10월 공개 Catch 조회(`PublicCatchStore`)만 다루고 발행 사본 칸이 없어 고치지 않았다.
- 소속 기록을 적은 api 문서: `api/docs/catch-registration-rules.md` 「소속 기록 (CR2)」에 ①(표지 근거로도 쓰임)·②(한계 문장을 더하면 api 상수 목록에도) 두 줄을 더했다. `api/docs/catch-registration-database.md`는 표 모양만 적어 고치지 않았다.
- JD 요약 지시 문장을 적은 api 문서는 없어 `api/docs/jd.md`는 고치지 않았다.

## 로컬 실제 연결 확인 (B2 최소 연결 첫 결과, 2026-11-11)

판정: **보일 결과 통과.** 「이 기록으로 알 수 없는 것」은 화면으로 보지 못했다(아래). 실제 로그인과 로컬 api·DB·web으로 확인했다. 개발 서버·배포 확인은 아니고, 전체 완료도 아니다.

환경:
- 이 작업 폴더(NC2 변경, 커밋 전)의 api·web을 NC1 때와 같은 로컬 환경(`~/catchu-local-live/cr1`, DB `catchu-cr1-db` 55460, pgvector)으로 띄웠다.
- 띄우기 전에 DB를 백업했다: `~/catchu-local-live/cr1/backup/cr1-before-nc2-20261111.dump`.
- 이 작업 폴더 판본으로 DB 이주를 돌렸다. 새로 더해진 것은 U10의 JD 요약 이주(`CreateJdSummary`) 하나다.
- GitHub·Google 로그인 설정만 더했다. Claude 키와 임베딩 키는 넣지 않아 외부 AI를 부르지 않았고, 임베딩은 개발 모드 합성 제공자다.
- 쓴 Catch: TheMe의 「SET_TOKEN 코드 수정」(Catch 개편 때 실제 분석한 것). 이미 **실제 소속 기록**이 있어 합성 소속 기록은 넣지 않았다. 본인 커밋 `0874001`이 이 Catch에 배정되어 있다.

사람이 브라우저에서 한 것과 본 것(11/11 09:31 KST 발행):
- 작성자 설명은 고치지 않았다. 「짚어 볼 곳」에 두 커밋 링크(`0874001` 본인 커밋, `947dc99` PR 없이 합친 병합 커밋)가 11/10부터 들어 있었다.
- ① 제목 아래 작은 줄에 `ljm0850/TheMe`가 보였다.
- ② 「작성자 설명」 제목 안에 「2026년 11월에 마지막으로 고침」이 보였다.
- ③ 「커밋 0874001」 링크 바로 뒤에 「이 작업의 본인 커밋」 표지가 하나 보였다.
  - 표지는 링크와 강조 밖의 형제 요소였고 `tabindex`·`role`이 없었다.
  - Catch 종류 표지와 모양이 같았다.
  - Tab 키를 누르면 `0874001` 링크에서 `947dc99` 링크로 바로 넘어갔다.
- ④ 「커밋 947dc99」 뒤에는 표지가 없었다. 근거 목록의 「GitHub 근거 열기」 링크에도 표지가 없었다.
- 공개 응답: `repositoryName` `"ljm0850/TheMe"`, `authorDescriptionEditedMonth` `"2026-11"`, `workLimits` 키 없음, `ownCommit`은 `0874001` 근거 true·`947dc99` 근거 false.
- 작성자 발행본 상세 화면에서도 ①~④가 같게 보였다.

화면으로 보지 못하고 시험으로만 확인한 것:
- 「이 기록으로 알 수 없는 것」: 로컬 DB의 Catch 가운데 작업 전체 한계 문장이 있는 것이 없다. 이 Catch의 `947dc99` 근거 한계는 근거 하나의 조회 상태 문장이라 담지 않는다.
- 작성자 말로 옮기라는 AI 지시 문장: 로컬에 Claude 키가 없어 실제 답으로는 보지 못했다. 빌드와 시험의 질의응답 10개 다시 재기에서 본다.

## PR 본문에 적을 것

- GitHub·AI 호출 수는 그대로다. 지시 문장 하나가 붙었을 뿐 새 호출이 없다(NFR1.1·NFR1.2).
- 표지 자리: FR10.3 「판본·커밋 이름 바로 뒤」를 「링크 바로 뒤」로 읽었다(기능 설계 Q3 B, README에 까닭).
- JD 요약 지시 변경(`jd-generation-request.ts`)과 `rag-eval.cjs`의 JD 지시 바꿈은 U10 영역이라 U10 담당 확인을 받는다.
- AC8.1.1~AC8.1.3의 답 말투는 빌드와 시험의 질의응답 10개 다시 재기에서 판정한다.
- 표지는 소속 기록 마이그레이션 전에 등록된 Catch와 다른 Catch에 배정된 커밋에는 붙지 않는다(README 한계).
