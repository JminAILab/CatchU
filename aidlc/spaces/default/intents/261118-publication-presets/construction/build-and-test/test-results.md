# Test Results — 261118-publication-presets

이 파일은 되돌아가기 1(U2 고침) 뒤 Step 9를 다시 돌린 결과다(Modify, 아래 「Loop-Back Log」는 그대로 둠).

실행: 2026-11-21 07:32(UTC)부터, 브랜치 `api/publication-presets` 885f9714. 기계: 로컬 macOS(충전기 연결, 시작 부하 1분 평균 4.10), 시험 DB `catchu-db-test`(127.0.0.1:5433, pgvector). 첫 실행(2026-11-20 14:29~15:04, 309d1fe1)의 결과는 아래 각 표의 「첫 실행」 칸과 「실패와 처리」에 남긴다.

## 빌드

| 명령 | 결과 | 시간 |
|---|---|---|
| `npm --prefix api run lint` | exit 0 | 3초 |
| `npm --prefix api run typecheck` | exit 0 | 6초 |
| `npm --prefix web run lint` | exit 0 | 6초 |
| `npm --prefix web run typecheck` | exit 0 | 1초 |
| `npm --prefix web run build` | exit 0 | 3초 |

## 전체 시험과 커버리지

| 명령 | 시험 | 통과 | 실패 | 건너뜀 | 줄 커버리지(all files) | 시간 | 첫 실행 |
|---|---|---|---|---|---|---|---|
| `npm --prefix api run test:coverage` | 2,032 | 1,994 | 0 | 38 | 98.46% (가지 90.20%, 함수 97.04%) | 445초 | 같은 수, 98.47% |
| `npm --prefix web run test:coverage` | 1,131 | 1,131 | 0 | 0 | 92.87% (가지 90.26%, 함수 88.26%) | 14초 | 1,127건, 92.84% |

두 명령 모두 exit 0. 저장소에 커버리지 문턱 설정이 없어, 범위(mvp) 바닥 80%를 각 출력 맨 아래 「all files」 줄로 판정했다. api 건너뜀 38건은 지금 dev에도 있는 조건부 시험이다(이 intent가 더하지 않음). worker는 이 intent가 바꾸지 않아 돌리지 않았다.

## 단위 명령(각 단위 `unit-test-instructions.md`, 같은 명령은 한 번)

| 단위 | 명령 | 시험 | 통과 | 실패 | 건너뜀 | exit | 시간 |
|---|---|---|---|---|---|---|---|
| u1 | 단위 명령(eligibility·preset-input·presets-api·publish-presets·first-copy·preset-publish-chain) | 41 | 41 | 0 | 0 | 0 | 12초(첫 실행 554초) |
| u1 | 회귀 명령(발행·열람·요약·질의응답·색인·MCP·연쇄 삭제·오류, 16개 파일) | 189 | 188 | 0 | 1 | 0 | 27초 |
| u1 | (첫 실행) 같은 회귀 명령 | 189 | 187 | 1 | 1 | 1 | 1,010초 |
| u1 | (첫 실행) 같은 회귀 명령 다시 돌림 | 189 | 188 | 0 | 1 | 0 | 28초 |
| u2 | api(publishable-filter·owner-catch-http) | 63 | 63 | 0 | 0 | 0 | 13초 |
| u2 | web(presets·publish·api-response) | 62 | 62 | 0 | 0 | 0 | 1초(첫 실행 58건) |
| u3 | web(reader-tabs 외 7개 파일, `u9-recipient-claude` 포함) | 157 | 157 | 0 | 0 | 0 | 1초 |
| u4 | web(privacy-policy) | 5 | 5 | 0 | 0 | 0 | 1초 미만 |

u1의 셋째 명령(publish-api·publish-pdf)은 둘째 명령에 든 파일이라 따로 돌리지 않았다. u4의 `git diff -- web/src/features/privacy/privacy-policy.md`는 바꾸기 전 대조용이라 돌리지 않았다(사본 글자는 u4 시험이 SHA-256으로 대조).

### 실패와 처리

- 첫 회귀 실행의 실패: `api/test/publications/recipient-api.test.cjs:215` 「S9: 중지·만료·삭제된 발행본은 유효한 grant가 있어도 GET·unlock 모두 404이고…」 — `TimeoutError: The operation was aborted due to timeout`(983초). 몇 분 앞서 돈 api 전체 커버리지 실행에서는 같은 시험이 통과했다.
- 조치(이 단계 안 1회): 시험 DB에 다른 연결이 없음을 `pg_stat_activity`로 확인하고 같은 명령을 그대로 다시 돌려 통과(S9 1.19초, 전체 28초).
- 원인은 밝히지 못했다. 같은 묶음의 u1 단위 명령도 554초로 평소보다 길었다. 그 시각 시험 DB를 쓰던 다른 연결의 잠금 대기로 짐작하지만 확인하지 못했다. 코드를 고치지 않았고 시험 기대도 바꾸지 않았다. 다시 생기면 그때 `pg_stat_activity`의 대기 잠금을 본다.
- 되돌아가기 뒤 다시 돈 실행에서는 같은 두 명령이 12초·27초로 끝나 다시 생기지 않았다. 코드가 아니라 그 시각의 실행 환경 문제로 본다.

## 코드 확인

- 이 intent가 바꾼 `web/src`·`api/src` 파일에 `console.` 호출 0건, dev 대비 새 `console.` 줄 0건(u2 NFR4.1, u3 NFR4.3).

## 브라우저 확인

2026-11-22 팀장이 실제 브라우저(6c382740 배포 빌드, 복사한 로컬 DB)로 확인했다. 결과는 아래 표의 U2-BROWSER·U3-BROWSER·U4-BROWSER 줄. 확인하지 못한 것: U3 다른 탭 출처 이동(로컬에 Claude 키 없음), 「저장했습니다.」의 화면 낭독기 읽힘, U2 개발 모드 멈춤, 자료 화면 거절 때 초점. 320px 회원 머리글 넘침은 U2 전부터 있던 문제라 U2 PR에 한계로 적는다.

자동 시험 가운데 실제 브라우저 엔진으로 돈 것은 없다. 위 web 시험은 모두 Node에서 서버 렌더링(`web/test/u2-render.mjs`)과 순수 함수로 돌았다. 로그인(Google)이 필요한 화면이라 이 기계에서 자동으로 브라우저를 돌리지 못했다. 브라우저에서 볼 항목은 `integration-test-instructions.md` 「브라우저에서만 볼 수 있는 것」에 있다.

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| COV-API | Testing Contract scope_floor(mvp) | 줄 커버리지 ≥ 80% | 98.47% | `npm --prefix api run test:coverage` exit 0 | build-and-test | Met |
| COV-WEB | Testing Contract scope_floor(mvp) | 줄 커버리지 ≥ 80% | 92.84% | `npm --prefix web run test:coverage` exit 0 | build-and-test | Met |
| CI-MERGE | Testing Contract scope_floor | 고른 시험을 병합 전 CI에서 돈다 | — | — | ci-pipeline | N/A — CI Pipeline, later in this plan, sets up CI to run these tests before merge |
| BUILD | 단위 확인 명령 | lint·typecheck·build 통과 | 모두 exit 0 | 위 「빌드」 | build-and-test | Met |
| U1-PERF | u1 NFR6.1~NFR6.4 | 목록 한 응답 50줄, 조회 수 일정, 세기 51개 400, 잠금 횟수 그대로 | 통과 | u1 단위 명령(presets-api·publish-presets) | build-and-test | Met |
| U1-SCALE | u1 NFR6.5·NFR6.6 | 프리셋 50×20, 발행 20개·60,000자 상한 | 통과 | u1 단위 명령(preset-input·publish-presets) | build-and-test | Met |
| U1-REL | u1 NFR2.7·2.8·2.10~2.14 | 원자적 쓰기, 발행 실패 정리, 500 드러냄, 필수 칸, PDF 두 번 셈, 마이그레이션 오르내림 | 통과 | u1 단위 명령 + 회귀 다시 돌림 + api 전체 | build-and-test | Met |
| U1-SEC | u1 NFR2.1~2.6·NFR3.1 | 401·404·400, 이름 그대로 저장 | 통과 | u1 단위 명령(presets-api·publish-presets) | build-and-test | Met |
| U1-DATA | u1 NFR4.1~4.4 | 로그·details·사본 응답·AI 근거에 이름·원본 ID 없음 | 통과 | u1 단위·회귀 명령(summary-sources·qna-sources·recipient-api) | build-and-test | Met |
| U1-OBS | u1 NFR4.5~4.8 | 로그 한 줄씩, 새 오류 코드, 예외를 삼키지 않음 | 통과 | u1 단위 명령, api 전체 | build-and-test | Met |
| U1-DEPLOY | u1 NFR2.15 | 배포 전 파일 지우기 안내를 배포 안내와 첫 PR 본문에 적음 | 배포 안내는 `api/docs/presets.md:78`에 있음. dev PR은 아직 없음 | `api/docs/presets.md:78`, `build-instructions.md` 「준비」 | dev PR 작성(사람) | Unverified |
| U1-N/A | u1 NFR2.9·NFR6.7 | 설계 결정(시험하지 않음·새 자원 없음) | — | `cross-unit-traceability.md` | — | N/A — 측정할 목표가 아닌 설계 결정 |
| U2-REQ | u2 NFR6.1~6.6·NFR5.1·5.2·NFR1.1 | 화면 요청 수 고정, 늦음·실패 표시, 안내 역할 속성 | 통과(Node 서버 렌더링, 가짜 호출 셈) | u2 web 명령 | build-and-test | Met |
| U2-SEC | u2 NFR2.1~2.4·NFR3.1·3.2·NFR4.1~4.3 | 404 같은 글, publishable 본인 목록만·`true`만·커서 범위, 이름 글자로, 세 칸만 옮김, catchIds 없음, console 없음 | 통과 | u2 api·web 명령, 위 「코드 확인」 | build-and-test | Met |
| U2-BROWSER | u2 NFR 설계(Build and Test로 넘긴 확인), 되돌아가기 1 | 첫 저장 뒤 고치기 화면으로 옮기고 프리셋이 하나만 생김, 개발 모드에서 멈추지 않음, 「저장했습니다.」를 화면 낭독기가 읽음, 초점 | 팀장 실제 브라우저 확인(6c382740, 배포 빌드, 복사한 로컬 DB, 2026-11-22): 첫 저장 뒤 `/presets/{id}`로 옮겨 「프리셋 고치기」·이름·담은 자료·[프리셋 지우기]·「저장했습니다.」가 보이고 두 번째 저장은 PUT이라 프리셋 수가 늘지 않음(통과), 순서 바꾼 뒤 초점(통과). 확인 못 함: 「저장했습니다.」의 화면 낭독기 읽힘, 개발 모드 멈춤(②, Node 시험만) | 팀장 확인 답(2026-11-22), `web/test/presets.test.mjs`(Node) | build-and-test | Unverified — 화면 낭독기·개발 모드는 실제 브라우저로 못 봄(나머지 통과) |
| U2-LIMIT | 팀장 2026-11-21 | 320px 머리글 넘침(U2 전부터), 검토 Minor 1·3 | 고치지 않고 U2 PR 본문에 한계로 적기로 함 | `u2-applicant-screens/code-generation/code-summary.md` 「받아들인 한계」 | dev PR 작성(사람) | N/A — 팀장이 받아들인 한계 |
| U3-REQ | u3 NFR5.1·5.3·5.4·5.5·NFR1.2·NFR1.1 | 탭 바꿈 요청 0, 처음 PDF 요청 0, 갱신 뒤 같은 탭, 출처 한 번에 바뀜, 역할·키 | 통과(Node 서버 렌더링·순수 함수) | u3 web 명령 | build-and-test | Met |
| U3-SEC | u3 NFR3.1·3.2·NFR4.1~4.3 | 이름 글자로, id에 이름 없음, 두 칸만 옮김, 칸 없으면 조회 실패, console 없음 | 통과 | u3 web 명령, 위 「코드 확인」 | build-and-test | Met |
| U3-BROWSER | u3 NFR5.2와 코드 요약 「돌리지 않은 시험」 | 탭을 오가도 PDF를 다시 받지 않음, 숨긴 패널 안 보임, 출처 이동 뒤 초점·스크롤, 320px 줄바꿈, 거절 때 초점 | 팀장 실제 브라우저 확인(6c382740, 배포 빌드, 2026-11-22): 키보드 탭 이동·숨긴 패널(통과), PDF를 연 채 탭을 오가도 요청 1번·같은 뷰어 3쪽 유지(통과), 320px 탭 줄(통과). 확인 못 함: 다른 탭 출처 이동(로컬에 Claude 키 없어 요약·답 출처를 만들 수 없음, Node 시험만), 자료 화면 거절 때 초점(답에 없음) | 팀장 확인 답(2026-11-22), `web/test/reader-tabs.test.mjs`(Node) | build-and-test | Unverified — 출처 이동·거절 초점은 실제 브라우저로 못 봄(나머지 통과) |
| U4-BROWSER | u4 화면 | `/privacy` 본문 | 팀장 실제 브라우저 확인(2026-11-22): 다섯 곳 통과 | 팀장 확인 답 | build-and-test | Met |
| U4-TEXT | u4 계획(C1~C5), 시험 SHA-256 | 화면 본문이 확정 문구와 같음, 목록 34항목 | 통과 | u4 web 명령 | build-and-test | Met |

## Loop-Back Log

### Loop-back 1 — 2026-11-21T00:00:00Z

- **Diagnosis**: 팀장이 실제 브라우저에서 U2 프리셋 편집 화면을 확인해 결함 둘을 찾았다. ① 새 프리셋 첫 저장(201) 뒤 `history.replaceState`로 주소를 `/presets/{id}`로 바꾸면, 회원 가드(`session-member-guard`)가 주소마다 회원을 다시 확인하며 화면을 내렸다 올려 편집 화면이 빈 「새 프리셋」으로 다시 그려진다. 이어서 저장하면 프리셋이 또 생긴다(배포 빌드에서 두 번 재현). Node 서버 렌더링 시험은 가드의 주소별 재확인을 돌리지 않아 잡지 못했다. ② 편집 화면 모델의 `open()`이 `disposed`를 `false`로 되살리지 않아, 개발 모드(React Strict Mode의 마운트→해제→마운트)에서 저장·상세 결과가 버려지고 「저장하고 있습니다.」에 멈춘다.
- **Root-cause stage**: code-generation(u2-applicant-screens). ①은 NFR 설계 Q1 A(주소만 바꾸고 화면은 그대로)의 전제가 회원 가드와 맞지 않은 것이라 NFR 설계 문서도 함께 고친다.
- **Planned fix**(팀장 지시 2026-11-21): ① NFR 설계 Q1을 B로 바꿔 첫 저장 뒤 `router.replace`로 `/presets/{id}`에 옮기고, 「저장했습니다.」는 한 번 쓰고 버리는 표시로 새 화면에 넘긴다. ② `open()`에서 `disposed`를 되살린다(`jd-management-model` 등의 `activate()`와 같은 방식). 두 결함 모두 시험을 더하고 단위 확인 명령을 다시 돌린다. 320px 머리글 넘침은 U2 전부터 있던 문제라 고치지 않고 U2 PR에 한계로 적는다.
- **Estimated impact**: 공수 web 파일 2~4개와 시험 1~2개, 반나절 이내. 비용 없음. 위험 낮음(편집 화면 안의 이동·표시만 바뀜, api 무변경). 다시 도는 확인 명령 약 15~20분.
