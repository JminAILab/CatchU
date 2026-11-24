# Code Summary — u1-preset-contract

이 단위는 api만 바꿨다. web·worker는 바꾸지 않았다. 바꾼 소스 경로 전부는 같은 폴더의 `source-manifest.json`에 있다.

## 만든 것·고친 것·지운 것

- 새 모듈 `api/src/presets/`: 프리셋 엔티티 둘(`preset`·`preset_item`), 입력 검사, 저장소(`preset-store.ts`), 컨트롤러(`GET/POST /v1/presets`, `GET/PUT/DELETE /v1/presets/:presetId`, `POST /v1/presets/measure`), 로그. `app.module.ts`에 등록했다.
- 새 모듈 `api/src/publishable-source/`: 사본 내용·글자 수(`source-content.ts`), 종류별 묶음 읽기와 발행용 잠금 읽기(`source-reader.ts`), 미리 읽은 Map만 받는 순수 판정(`eligibility.ts`).
- 마이그레이션 `1795140270696-AddPublicationPresets.ts`: 표 둘과 외래 키 → 변경 전 발행본 지우기 → `published_item`의 `preset_ordinal`·`preset_name`과 CHECK. down은 칸 둘과 표 둘을 지운다. 지운 발행본은 되살리지 않는다.
- 발행: 요청이 `presetIds`(1~5)로 바뀌었다. 프리셋을 트랜잭션 밖에서 한 번 편 뒤 빈 프리셋·20개를 보고, 트랜잭션 안에서 잠근 행으로 판정한다. 막힘은 `blockedSources`로 알리고, 새 코드는 `PRESET_LIMIT_REACHED`·`CATCH_PRIVATE`다. 비공개 Catch를 공개로 바꾸는 쓰기는 지웠다.
- 사본: 항목에 `presetOrdinal`·`presetName`·`isFirstCopy`를 더했다. `markFirstCopies`가 앞선 사본을 정한다. 받은 사람·작성자 응답에는 `isFirstCopy`·`source_id`가 나가지 않는다.
- 앞선 사본만 쓰는 곳: 조각 나누기, 요약 근거, 질의응답 머리글, 받은 링크 읽기.
- 오류 필터: `blockedSources`는 형식이 맞는 줄만 옮긴다. `catchIds` 복사는 지웠다.
- 지운 파일: `api/src/publications/snapshot-builder.ts`. 내용은 `source-content.ts`로 옮겼다.
- 문서: `api/docs/presets.md`를 새로 썼다. 문서 9개와 `api/CONVENTIONS.md`도 고쳤다(모듈 표 두 줄, 409 줄의 새 코드 둘, catchIds 설명).

## 핵심 구현 결정

- 판정을 읽기와 판정으로 나눠 조회 수를 고정했다(NFR 설계 Major 2). 프리셋 목록·상세·세기와 발행이 같은 판정 함수를 쓴다.
- 목록·상세·세기는 읽기 전용 REPEATABLE READ 한 트랜잭션이다. 같은 스냅샷에 원본 행이 없으면 500이다. 쓰기는 READ COMMITTED이고 프리셋 행은 잠그지 않는다.
- 글자 수는 `catchTextLength` 한 함수로 센다. PDF는 SQL `sum(char_length(text)) FILTER (WHERE readable)`로 센다. 발행 전체 글은 편 항목마다 더한다.
- 추출 미완료 400은 `blockedSources`와 함께 `violations: [{ field: 'presetIds', reason: 'extractionIncomplete' }]`를 싣는다. 다른 400과 구분하려는 것이다.
- 지우기의 행 수를 `RETURNING` 행 수로 읽어 남의 프리셋에도 204가 나가던 버그를 시험이 잡았다. 바뀐 행 수로 읽게 고쳤다.
- 마이그레이션 down이 `DROP INDEX "public"."..."`로 스키마를 붙여 써서, 격리 스키마 시험이 공용 시험 DB의 프리셋 색인 4개를 지웠다. 스키마를 붙이지 않게 고쳤다. 로컬 시험 DB의 색인 4개는 up과 같은 SQL로 다시 만들었다.

## 시험

- Step 2 기준선(고치기 전 트리, 고칠 기존 시험 16개): 175건 중 174 통과, 1 건너뜀(Redis 없음), 실패 0.
- Step 4 중간 확인(`publish-api`·`publish-pdf`): 32/32 통과.
- 단위 명령 1(새 시험 6개): 41/41 통과(13초).
- 단위 명령 2(고친 기존 시험 16개): 183건 중 182 통과, 1 건너뜀(기준선과 같은 Redis), 27초.
- 전체 api 시험(`npm --prefix api test`): 첫째 줄 1986건 중 1945 통과, 실패 3, 건너뜀 38(323초). 둘째 줄 30/30 통과(77초).
  - 실패 3건은 `test/integration/u7-analysis-chain.test.cjs`의 I4·I6·I8이다. 「worker 잠금 의존성과 CATCHU_TEST_WORKER_PYTHON 실행 파일 필요」라는 환경 실패이고, 이 변경과 관계없다.
- typecheck, `eslint . --max-warnings=0`, 문서 크기 검사(`check-doc-sizes.sh`)는 통과했다.
- 단위 명령은 시험 안내의 npm 명령이다. `--timeout-ms 3600000`의 Unit 확인 명령은 Build and Test에서 돈다. 이 단위는 api만 바꿔서 web·worker 시험은 돌리지 않았다.

## 쓰고 돌리지 않은 시험

없다. 다만 아래는 시험으로 확인하지 않았거나 다르게 확인했다.

- 동시 저장 500(NFR2.9)과 동시 51번째 프리셋: 설계에서 받아들인 결과라 시험하지 않았다.
- 같은 스냅샷 안 원본 없음 500: 외래 키 연쇄 삭제 때문에 실제 DB로는 만들 수 없다. 원본 조회 결과를 비우는 Proxy로 흉내 냈다.
- 옛 링크 404: API 경로 대신 마이그레이션 시험 안에서 `resolveForRecipientIn`이 `LinkUnavailable`을 내는 것으로 확인했다.
- 프리셋 저장·지우기 로그(`api/src/presets/presets-log.ts`, NFR4.5)는 따로 시험하지 않았다. 로그 함수가 회원 ID·프리셋 ID·오류 코드만 받는 모양으로 이름이 남지 않게 했다. NFR 요구가 적은 「로그 함수 시험」은 없다.
- 커버리지 80% 줄 문턱은 Build and Test가 전체 시험으로 잰다. 이 단계에서는 재지 않았다.

## 계획과 다르게 한 것

1. `PresetsModule`을 `application.module.ts` 대신 `app.module.ts`에 등록했다. `api/CONVENTIONS.md`가 기능 모듈을 `AppModule`에 두라고 하고, 시험도 `AppModule`을 쓴다.
2. 새 칸이 NOT NULL이고 요청 모양이 바뀌어, 계획 목록 밖의 파일도 고쳤다. 그대로 두면 깨진다.
   - 시험: `publications-logging`·`recipient-pdf`·`pdf-tables`·`materials/pdf-materials-api`·`u2/withdrawal`·`lock-wait-limit-role`·`result-application-b`·`rag-eval`과 각 support 파일
   - 스크립트: `scripts/rag-eval/rag-eval.cjs`
   - 문서: `api/docs/pdf-materials.md`
3. 사본 객체를 만드는 JD 시험이 없어 단위 명령 2에 더한 파일은 없다. JD 시험 3개는 바꾸지 않고 통과했다.
4. `test/publications/support.cjs`의 `eligibleCatch` 기본 공개 상태를 PUBLIC으로 바꿨다. 비공개가 이제 `CATCH_PRIVATE`로 막히기 때문이다.
5. 기존 발행 시험의 「없는 원본 404」 사례를 「남의 프리셋」과 「없는 프리셋 ID」 404로 바꿨다. 프리셋 항목의 외래 키 때문에 없는 원본은 담을 수 없다.
6. 배포 전 파일 지우기 안내는 `api/docs/presets.md` 「배포」에 두었다. `publications.md`에는 요약과 링크만 남겼다. 문서 크기 상한(36,000 B) 때문이며, `publications.md`는 지금 35,943 B다.

## 남은 것

- web은 아직 `details.catchIds`와 옛 요청 모양을 쓴다. U2가 맞출 때까지 dev 발행 화면은 발행에 실패한다(단위 Q2).
- 첫 PR 본문에 넣을 안내: dev 발행 화면은 U2까지 실패한다. 배포 전에 `members/*/publications/`만 지운다. S3는 `--dryrun`으로 먼저 보고, `members/*/materials/`와 `members/` 전체는 지우지 않는다. 로컬은 선택이다.
- `preset_item`의 원본 칸 셋에는 단독 색인을 두지 않았다. 원본을 지울 때 연쇄 삭제가 표를 훑지만, 회원당 최대 1,000행이다.
