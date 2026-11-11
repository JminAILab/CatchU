# U10 최신 통합 반영·최종 검사 — 2026-11-10

[#452 팀장 예외 승인](https://github.com/JminAILab/CatchU/issues/452#issuecomment-6756893924)에 따른 로컬 merge와 검사 기록이다. **“AI-DLC 승인 뒤 직접 수정(검토·기록 없음)”**에 해당하며, AI-DLC를 호출하거나 승인·감사·claim을 손으로 고치지 않았다. 원격 CI는 **미실행**이다.

## 판본과 보존

- 작업 브랜치 `codex/u10-pr-fixes`, 시작 `a6f0ff8705b9ebab47b60d2c09c55f3534e37da8`.
- 앞선 보완을 `100b75f09aac9ebe846d45d24a17903e9d91a297`에 로컬 커밋했다. [앞선 보완 기록](u10-pr-fixes-2026-11-10.md)은 당시 판본의 기록이다.
- `git fetch --no-tags origin refs/heads/intent/260925-intent-12:refs/remotes/origin/intent/260925-intent-12`로 최신 통합 `be9d29054a64dd48fc59ee0dc1a479b5bec8ff1f`를 확인했다.
- `git merge --no-ff --no-commit origin/intent/260925-intent-12` 후 두 충돌을 해결하고 **`f1576f4a71f87f3b120f6cb23c0e6c35441a932a`**로 로컬 merge 커밋했다. 부모는 `100b75f0`·`be9d2905`이며 rebase·squash·이력 재작성은 하지 않았다.
- 충돌한 `api/test/integration/result-application-b.test.cjs`는 JD public 인덱스 보존 검사와 최신 CR2·U8 검사 모두를 유지했다. `api/docs/member-withdrawal-deletion.md`는 JD·요약 결과와 PDF 3표의 삭제 규칙을 모두 유지했다.
- 자동 병합된 `web/test/recipient.test.mjs`에는 U10 슬롯과 최신 근거 접기·재펼침 검사가 함께 남았다. U10 화면·연결은 보완 커밋과 같고 최신 `recipient-screen`·`snapshot-view`·동의 고지 v2는 통합 원본과 같다.
- U10 설계·승인 tree, 감사 shard, `.aidlc-unit-claim.json`, 12월 intent의 `aidlc-state.md`는 `100b75f0`와 Git 객체가 동일하다. 최신 `261103-catch-redesign` 전체 tree와 상태·감사는 `be9d2905`와 동일하다.

## 마이그레이션과 검사 환경

최신 통합 24개·35표에 U10 JD 마이그레이션 1개·3표를 합친 기대값은 **25개·38표**다. 표 수에는 `migrations` 기록 표가 포함된다. 등록 목록은 실제 DataSource의 마이그레이션과 명시적인 25개 기대 목록을 대조했고, 실제 시험 DB의 읽기 전용 조회에서도 **MIGRATIONS=25·TABLES=38**을 확인했다([실제 적용 이름 전체와 개수](u10-merge-final-2026-11-10/migration-inventory.txt)).

| 되돌리기 | 제거 대상 | 직후 표 수 |
| --- | --- | ---: |
| CR2 `CreateCommitAssignment1794054790720` | `commit_assignment`, Catch 복합 유일 조건 | 37 |
| U8 `CreatePdfMaterialTables1793977402870` | `pdf_material`, `pdf_page_text`, `published_pdf_page` | 34 |
| U10 `CreateJdSummary1793762571117` | `jd`, `jd_summary_run`, `jd_summary_result`, JD 인덱스 4개 | 31 |
| U6 `CreateMcpTables1793588083309` | MCP 표 4개 | 27 |

이후 전체 역순 되돌리기는 기록 표만 남기고, 전체 재적용은 같은 목록·38표 및 엔티티와 스키마 차이 없음을 확인한다. 격리 스키마에서 JD down을 수행하는 동안 public의 동명 인덱스 4개와 정의가 보존되어야 한다.

- Node **24.21.0**, npm **11.19.0**, 기존 이미지 `sha256:ca31ea5bd429e78cbd4f02206bbdf4703ff5fb400957bf61a9cb6eb4e000348f`를 사용했다. 새 의존성 설치·이미지 다운로드는 하지 않았다.
- api/web 잠금 파일은 기존 U10 설치본과 SHA256이 같고, 의존성 디렉터리는 읽기 전용으로 연결했다. 잠금 해시는 앞선 보완 기록과 같다.
- merge 커밋의 소스를 `.env`·기존 빌드·의존성을 제외하고 tmpfs에 복사해 바이트 일치를 확인했다. API 525파일의 결합 해시 `b5c97e3d24ff6db6c03e6d5810aafa017e4c74af4011f476905806788b848d90`, web 320파일 `f703bec0aca66c1c02c1f220d27541e4162045d4ea0f69d86fb5c3df133c6e8b`.
- 새 내부 네트워크 `catchu-u10-merge-20261110`의 PostgreSQL·Valkey·runner만 사용했다. DB는 tmpfs의 `catchu_u10_merge_test`, 브라우저는 별도 `catchu_u10_merge_browser_test`다. `PGSSLMODE=disable`은 TLS 없는 시험 DB용 프로세스에만 적용했다.
- 외부 AI 키·제품 큐·Google/GitHub/worker 연동을 비활성화했다. 합성 제공자와 실제 로컬 DB·Valkey를 구분하며 기존 개발 DB는 시작·초기화하지 않는다.

## 자동 검사

**과거 결과는 “79개 실행 중 1건 발견·수정, 관련 25개 재검사 통과”다.** 이를 최종 79개 전체 재통과로 표현하지 않는다. 아래는 전체 merge 판본의 별도 실행 결과다.

API 작업 위치 `/workspace/api`, 검사 판본 `f1576f4a`(코드 미커밋 변경 없음). 기존 영향 범위에 최신 PDF 표·동의 v2·CR2 외래 키 검사 3파일을 더했다.

```sh
npm run lint
npm run typecheck
npm test -- test/integration/result-application-b.test.cjs test/rag-answer/rag-answer-app.test.cjs test/jd/jd-management.test.cjs test/jd/jd-summary.test.cjs test/jd/jd-integration.test.cjs test/jd/jd-acceptance-race.test.cjs test/jd/jd-publication-access.test.cjs test/u2/ai-run.test.cjs test/u2/ai-gate-jd.test.cjs test/db/member-cascade-delete.test.cjs test/db/pdf-tables.test.cjs test/u2/ai-consent.test.cjs test/catches/upstream-foreign-keys.test.cjs
```

API 결과: lint·typecheck·재빌드와 영향 검사 **13파일 102/102 통과, 실패·skip 0, 종료 코드 0**. 실제 마이그레이션 목록·38표·역순·전체 재적용, public JD 인덱스 보존, 실제 앱 처리기 3종·중복 등록 거부, 타인 수정/삭제 거부 직후 소유자 원본 보존, 실제 C-10 경계, PDF 표·CR2 외래 키, 동의 v2, 실제 로컬 Valkey 전달·중복 억제를 포함한다. 외부 생성 응답은 합성이며 외부 AI 호출은 없다. `pg`의 동시 `client.query()` 사용에 대한 향후 pg@9.0 비권장 경고가 있었지만 실패는 없었다.

web 작업 위치 `/workspace/web`, 동일 merge 판본에 기본 검사 환경으로 `npm run check`를 실행한다. 브라우저용 인증 전환은 자동 검사에 섞지 않는다.

web 결과: **897/897 통과, 실패·skip 0**, lint·typecheck·프로덕션 빌드·`check:run`까지 종료 코드 **0**. smoke는 컨테이너의 `127.0.0.1:3001`에서 기본 화면 HTTP 200과 보안 헤더를 확인했다. 이때 브라우저용 API는 아직 시작하지 않았다.

문서 크기는 `bash .github/scripts/check-doc-sizes.sh`로 확인했다. Windows CRLF 작업 사본에서는 변경하지 않은 `docs/CatchU_coding_procedures.md`·`worker/docs/generation.md`가 각각 19,066/19,000 B·36,153/36,000 B로 실패했다. `f1576f4a`의 공식 checker와 검사 대상 **102개 파일**을 별도 LF 사본에 추출하고 모든 blob hash를 HEAD와 대조한 뒤, 별도 index에서 같은 스크립트를 실행해 **종료 코드 0**을 확인했다. 두 문서의 Git 원문은 각각 **18,981/19,000 B·35,958/36,000 B**다. 원본 문서·Git 설정·원본 index는 바꾸지 않았다. 이 로컬 재현은 GitHub CI 실행이 아니다.

## 실제 브라우저 검사

전체 merge 판본의 실제 AppModule·C-10·HTTP·새 합성 DB와 Next 개발 서버를 연결한다. 저장된 합성 DONE 결과를 열어 화면을 검사하며 실제 AI 완료·배포 환경 검사는 아니다. 앞선 두 파일 부분 조립 결과를 이번 결과로 재사용하지 않는다. 브라우저를 위해 runner만 새 브리지 `catchu-u10-merge-browser-20261110`에 연결해 `127.0.0.1:3410/3411`을 사용하고, 임시 사본에만 `allowedDevOrigins: ['127.0.0.1']`을 추가했다. 개발 로그인·인증 연결 전환은 브라우저 서버에만 켰다. 작업판의 설정·API 빌드는 변경하지 않았다.

ChatGPT 내장 브라우저, **1280×720**에서 실제 개발 로그인·세션 복원을 거쳐 확인했다. 아래 수치는 DOM에 표시된 값과 화면 관측이며 모델 단위 검사 결과를 대신 쓴 것이 아니다.

| 조작 | 실제 관측 | 판정 |
| --- | --- | --- |
| 초기 발행본 | Catch의 `details.open=false`, 근거 자세히 보기 기본 접힘 | 통과 |
| B JD 선택 후 A의 저장 DONE 열기 | B 선택을 유지하면서 A 결과 표시 | 통과 |
| BR3.5 안내 | 저장된 고정 안내 2건이 DOM에서는 1개, `Kubernetes 운영 경험`과 같은 원문 행에 표시. 결과 칸에는 중복 없음 | 통과 |
| 처음 `원문에서 확인` 클릭 | 접힘 false → true, `Docker 배포 절차를 검증했다.`가 mark로 강조. scrollY 2476 → 873.60, 초점이 해당 `published-item`으로 이동, 강조 top 351.52 / bottom 369.12로 viewport 안 | 통과 |
| 펼친 상태에서 같은 근거 재클릭 | 펼침·강조·항목 초점·스크롤 위치 유지 | 통과 |
| 직접 접은 뒤 같은 근거 재클릭 | false → true로 다시 펼침, 항목 초점·viewport 안 강조 확인 | 통과 |
| 각 클릭 뒤 선택·결과·안내 | B JD 선택값과 A 실행 결과가 유지되고 안내 개수도 1개 | 통과 |

화면 증거: [원문 옆 BR3.5 안내](u10-merge-final-2026-11-10/br35-final.jpg), [다시 펼쳐진 근거·강조·초점](u10-merge-final-2026-11-10/evidence-repeat-final.jpg). 모두 합성 자료이며 인증값·전체 공유 URL은 이미지에 포함하지 않았다. 실제 AI 호출, 브라우저 종료 후 큐 지속, 760/1024/1536px 관리 화면 전체, 배포 브라우저 성능은 이번 검사 범위가 아니다.

## claim·개인 절대경로·감사 이력 제출 처리

| 항목 | 확인한 결정과 현재 상태 |
| --- | --- |
| claim 파일 | #452의 기존 claim 보존 지시에 따라 원형 유지. 개인 절대경로가 없는 기존 맡기·감사 연결 기록이며 임의 삭제하지 않음 |
| 승인·감사 이력 | #452는 원본 보존, AGENTS의 Git Integration은 감사 shard 버전 관리를 요구한다. [#419 제출 안내](https://github.com/JminAILab/CatchU/pull/419#issuecomment-6457952898)는 12월 `aidlc-state.md` 제외이며 감사·claim을 손으로 거르는 허용이 아님 |
| 개인 절대경로 | 기존 U10 `runtime-recreation-2026-11-10.md` 24·57행과 감사 shard 7개 줄에 남아 있다. 내용을 새 문서에 재전재하거나 원본을 정제하지 않았다. **원격 제출 처리 미해결** |

[AI-DLC 안내](../ai-dlc/AI_DLC_2.11.2_GUIDE.md)의 개인 경로 업로드 금지와 [U10 검사 지침](../../aidlc/spaces/default/intents/260925-intent-12/construction/u10-jd/code-generation/unit-test-instructions.md)의 감사 원문·내부 절대경로 이슈/PR 게시 금지를 함께 적용한다. #452의 최신 승인 이후 이 제출 경계를 해소한 후속 결정은 확인하지 못했다. 로컬 commit·merge·초안은 완료할 수 있지만, 원격에 올리기 전 팀장이 원본 보존과 개인 경로 포함 기록의 제출 방식을 명시해야 한다. 삭제·이력 재작성으로 임의 해결하지 않는다.

## 종료 확인과 제출 전 조건

- 이번 작업 전용 라벨과 정확한 ID를 확인한 뒤 시험 컨테이너 3개와 네트워크 2개를 제거했고, 잔여 자원 0개를 확인했다. tmpfs의 시험 DB·빌드·임시 브라우저 설정도 함께 폐기됐다. 기존 `catchu-u10-db-20261104`·`catchu-u10-valkey-20261104`는 동일 ID·중지 상태를 유지했다.
- 검사 후 애플리케이션 코드 변경은 없다. 최종 기록·합성 화면·실제 마이그레이션 목록과 API 안내·web README의 검사 기록 링크만 문서 커밋으로 보존한다. 로컬 PR 초안에는 지정 문구·승인 링크와 이 기록을 연결한다.
- merge 전체 `git diff --check`에는 최신 통합 원본의 후행 공백 2건이 있다(`261103-catch-redesign/aidlc-state.md` 22행·동 intent 감사 shard 19903행). 양쪽 파일이 통합 원본 blob과 같음을 확인하고 보존했다. 코드·문서 범위의 diff 검사는 통과했다.
- **원격 CI 미실행**: push·워크플로 실행·원격 PR 생성·병합·이슈 종료를 하지 않았다. 로컬 결과로 CI 통과를 대신하지 않는다.
- 제출 전 개인 경로 포함 기록의 처리 결정, 최종 제출 SHA의 intent CI, 팀장 검토·merge commit이 남는다. 10월 28일 팀 운영에 따라 AI-DLC 통합 시험 단계는 사용하지 않는다.
- 기존 실제 AI 품질·같은 JD 전체 입력/검색 방식 비교·브라우저 종료 뒤 큐 지속·배포 성능 등 미검증 범위는 남는다. 이번 합성 검사로 통과 처리하지 않는다.
