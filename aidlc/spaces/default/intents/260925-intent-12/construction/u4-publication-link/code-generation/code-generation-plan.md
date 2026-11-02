# U4 발행·링크 — 코드 생성 계획

## Summary

- Builds: U4 본체 — Catch 설명·텍스트 자료(W1·W2), C-10 DB 구현과 발행·작성자 관리(W3·W5), 받은 사람 열람 경로 교체와 10월 공유 링크 제거(W4·W6). 세 번에 나눠 제출하며, 미결 항목은 보류 범위로 남긴다
- Touches: `api/src/publications/`, `api/src/materials/`, `api/src/catches/`(설명 API), `api/src/app.module.ts`, `api/src/share-links/`·`api/src/recipient/`(W6 제거), `web/src/features/recipient/`·`web/src/features/assets/`·새 `web/src/features/materials/`·`web/src/features/publications/`, `web/src/app/s/[token]/`, `api/test/publications/`·`api/test/materials/`, `web/test/`, `api/docs/publications.md` 등
- Tests: api 약 85개·web 약 45개(구성 요소별 5~8개, 시나리오 S1~S14와 보호 흐름, 경로 중복·기동 검사·회원 없음 500 포함). S15는 C-09 합의 뒤

## Sources

입력: [U4 기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md)·[엔티티](../functional-design/entities.md), [U4 비기능 요구사항](../nfr-requirements/), [U4 비기능 설계](../nfr-design/)(성능·보안·확장성·신뢰성·관측·논리 구성 요소), [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-02~C-14, [Unit 정의](../../../inception/units-generation/unit-of-work.md)의 U4, [요구사항](../../../inception/requirements-analysis/requirements.md)의 FR1~FR5·NFR1~NFR7, [사용자 스토리](../../../inception/user-stories/stories.md), 열린 PR [#422](https://github.com/JminAILab/CatchU/pull/422)(U4 첫 경계)·[#423](https://github.com/JminAILab/CatchU/pull/423)(U2 공용 기반), api 시험 실행기 `api/scripts/test-with-db.cjs`, web 시험(`node --test`).

구현하는 스토리: US1.4·US2.1·US2.2·US2.3·US3.1(텍스트)·US4.1·US4.3·US4.4·US5.1·US5.2(PDF 제외). 각 단계 끝 괄호에 스토리·규칙(BR)·비기능(NFR) ID를 적는다.

## Testing Contract

```json
{
  "version": 1,
  "methodology": "custom",
  "source": "team",
  "ordering": "각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
  "scope": "mvp",
  "test_strategy": "standard",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: custom\n- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.\n- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. Unit에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다."
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Meet an 80% line-coverage floor.",
      "Run the selected tests in CI before merge."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "custom",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Custom ordering - 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
      "Implementation and tests - preserve that exact ordering; do not convert it to layer-local TDD.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:b6cb6e0b1ba6bb0736259ab7987a5841cfc41f21a49cf2fb5eade7c786b2dc66",
  "contract_sha256": "sha256:19386d629b3092339d296f2cdf4cb18982564dbd19832a03198ee5687fbc32b6"
}
```

팀 순서대로, 각 제출의 첫 단계에서 그 제출이 다루는 시나리오·기대 결과·실패 조건을 기능 명세 「주요 시나리오와 확인」(S1~S15)에서 확정하고, 세부 시험 코드는 구현 뒤 쓰고 돌린다.

## 선행 조건과 제출 나누기

| 제출 | 범위 | 시작 조건 | 이유 |
|---|---|---|---|
| 제출 1 | W1 Catch 설명, W2 텍스트 자료(api·web) | [#422](https://github.com/JminAILab/CatchU/pull/422)가 통합 브랜치에 병합되고 이 폴더에 반영된 뒤 | #422가 `text_material` 표·`catch_asset` 설명 칸·엔티티를 만든다. U2·U3 의존 없음 |
| 제출 2 | C-10 DB 구현, W3 발행, W5 작성자 목록·상세·중지·삭제(api·web) | 제출 1 병합, U2 [#423](https://github.com/JminAILab/CatchU/pull/423)(C-02·C-03·C-04·C-05)과 U3 첫 제출(C-08 `PublishedIndexWriter`)의 인터페이스·가짜가 통합 브랜치에 병합된 뒤 | 발행 트랜잭션이 U2·U3 인터페이스를 주입받는다. U4 운영 코드에 임시 구현을 두지 않는다(기능 명세 「의존 처리」) |
| 제출 3 | W4 받은 사람 경로·화면과 W6 10월 공유 링크 제거 | 제출 2 병합 뒤 | 새 받은 사람 경로 등록과 10월 경로 해제를 한 변경으로 한다(보안 설계 「받은 사람 경로 교체」). 발행이 먼저 있어야 10월 발급을 없앨 수 있다 |

- 시작 조건이 갖춰지지 않으면 그 제출의 구현 단계에 들어가지 않고 멈춘다. 제출마다 통합 브랜치 대상 PR 하나로 낸다(#419 방식). PR에는 그 제출의 시험 결과와 보류 범위를 적는다.
- U2·U3 실제 구현 연결 전 결과는 '합성 연결을 포함한 사전 확인'으로 기록하고 실제 연결 성공으로 보고하지 않는다(team.md Walking Skeleton, OQ-U4-6).

## 보류 범위와 미결 (구현하지 않거나 합의 전 처리로 구현)

| 미결 | 결정 시점 | 이 계획에서의 처리 |
|---|---|---|
| OQ-U4-2 발행 빈도 1분 10회(임시) | W3 발행 전 | 상수 하나로 구현하고 임시임을 주석에 적는다. 값만 바꾸면 되게 한다 |
| OQ-U4-4 전체 글 60,000자(임시) | W3 발행 전 | 위와 같다 |
| OQ-U4-3 `share_link`·`idempotency_record` 정리 | W6·P1 검증 전 | `share_link` 표·`share-link.entity.ts`·`member-analysis`의 `createShareLink`·`idempotent-creation.ts`를 바꾸지 않는다 |
| OQ-U4-5 C-09 소비자에 U4 추가 | 색인 상태 연결 전 | `indexState` 칸·`POST /publications/{id}/reindex`·[검색 다시 준비] 버튼을 만들지 않는다. S15는 미실행으로 기록한다. U4 완료로 보고하지 않는다 |
| OQ-U4-6 U2·U3 제공 시점 | 별도 확인 | 제출 2의 시작 조건으로 둔다 |
| OQ-U4-7 C-11 형 정의 | 받은 사람 화면 연결 전 | 제출 3에서 C-11 `RecipientSlotProps`·`showEvidence`를 U4 화면 안 형으로 두고, 공용 형으로 내보낼지는 결정 뒤 따른다 |
| OQ-U4-NFR-1·2 GitHub 주소 포트·본문 주소 끝 판정 | 본문 링크 구현 전 | 본문·작성자 설명 자동 링크를 구현하지 않는다. 근거 링크는 10월 `isGithubSourceUrl` 그대로 |
| OQ-U4-NFR-3 AI 글 안 주소 링크 | 각 화면 연결 전 | `aiDraft`에 링크를 만들지 않는다 |
| OQ-U4-NFR-4 C-12에 형식 오류 토큰 응답 적기 | 받은 사람 경로 구현 전 | 10월 동작(404)으로 구현하고 계약 문서는 고치지 않는다 |
| OQ-U4-NFR-5 C-10 따로 부를 때의 틈 | U5·U10 실제 연결 전 | U4 열람 경로만 판정·읽기를 한 읽기 전용 REPEATABLE READ 트랜잭션으로 묶는다. C-10 계약은 바꾸지 않는다 |
| OQ-U4-NFR-6 소유 회원 비활성·회원 없음 | 받은 사람 경로(W4) 구현 전 | 합의 전 처리대로 10월 동작을 유지한다: 비활성 404, 회원 행 없음 500 `INTERNAL_ERROR`. 결정이 바뀌면 그 단계만 고친다 |
| U4 고정 안내(BR7.1) 축소 문구 | 받은 사람 화면 연결 전 | 제출 3에서 G5·G6 범위 안의 문구로 정하고 PR에 적는다 |
| #423 U2 문구 2건 | #423 병합 뒤 | 제출 3에서 G7로 대조만 한다 |

## 적용하지 않는 층

- 새 배포 산출물(Dockerfile·IaC)은 없다. 환경변수 이름(`LINK_GRANT_SECRET`·`SHARE_LINK_WEB_BASE_URL`)을 바꾸지 않아 배포 설정 변경이 없다(비기능 설계 R-01).
- 마이그레이션은 #422가 만든다. 이 계획은 새 표를 만들지 않는다.
- PDF(U8)·조각 나누기·색인(U3)·요약·질의응답(U5)·JD(U10) 화면 컴포넌트는 만들지 않는다. 받은 사람 화면은 그 자리만 둔다.

## Steps

### 제출 1 — W1·W2 (선행: #422 병합)

- [x] Step 1: 시작 조건 확인과 시험 실행기 확인. #422가 통합 브랜치에 병합돼 이 폴더에 있는지(`api/src/materials/text-material.entity.ts`, `catch_asset` 설명 칸 마이그레이션) 확인하고, 없으면 멈춘다. `cd api && npm test -- test/db/publication-tables.test.cjs`와 `cd web && node --test test/recipient.test.mjs`가 도는지 확인해 unit-test-instructions의 명령을 확정한다(team.md Testing Posture)
- [x] Step 2: 제출 1 시나리오 확정. S1(설명 저장·두 탭·공백·4,001자), S2(재분석 뒤 설명 유지), S3(텍스트 자료 CRUD·남의 자료 404)의 기대 결과·실패 조건을 시험 파일 머리 주석에 적는다(US2.1~US2.3, US3.1)
- [x] Step 3: Catch 설명 API. `api/src/catches`에 `PUT /v1/catches/{catchId}/description`을 더한다. 본인 Catch만(조회 조건에 소유자, 형식 오류 UUID·남의 것·없음 같은 404), 0~4,000자 코드 포인트, 앞뒤 공백만이면 두 칸 NULL, 마지막 저장 유지. `catches`는 `publications`를 import하지 않는다(US2.1·US2.2, BR1.1·BR1.2·BR2.1·BR10.1, NFR1.1·NFR1.8·NFR4.2)
- [x] Step 4: 재분석 보존 확인. 결과 반영이 설명 두 칸을 쓰지 않는지 확인하고, 쓰는 곳이 있으면 멈추고 묻는다(US2.3, BR1.4)
- [x] Step 5: 텍스트 자료 API. `api/src/materials`에 모듈·컨트롤러·서비스(`GET/POST /v1/text-materials`, `GET/PUT/DELETE /v1/text-materials/{id}`), 10월 cursor 목록, 제목 1~100·본문 1~20,000, 본인 것만. `materials`는 `publications`를 import하지 않는다(US3.1, BR3.1~BR3.4, NFR1.1·NFR4.2·NFR4.11)
- [x] Step 6: 작성자 화면 W1·W2. `web/src/features/assets`의 Catch 상세에 기록 확인 내용·작성자 설명·AI 설명 초안을 나눈 편집 영역을, 새 `web/src/features/materials`에 자료 목록·편집 화면(민감 정보 안내 고정)을 만든다. 응답 성공 뒤에만 "저장됨", 실패 때 입력 유지와 "저장되지 않았습니다"·로그인 만료 안내, 저장 전 이탈 경고. 조작 요소에 `data-testid`(US1.4·US2.1·US2.2·US3.1, BR1.3·BR2.2·BR2.3·BR3.3, NFR6.1·NFR7.1·NFR7.5)
- [x] Step 7: 제출 1 시험. api `test/catches/author-description-api.test.cjs`(S1·S2, 거부 사례: 남의 Catch 404, 형식 오류 UUID 404, 4,001자 400, 정의 밖 필드 400, 로그에 설명 본문 없음)·`test/materials/text-materials-api.test.cjs`(S3, 회원 두 명 교차 접근 404 포함), web `test/author-description.test.mjs`·`test/materials.test.mjs`(저장 성공·실패 입력 유지·로그인 만료·이탈 경고). 커버리지는 `npm run test:coverage -- <파일>`로 재고 80% 미만이면 원인을 적는다(NFR1.1·NFR6.4, Testing Contract)
- [x] Step 8: 제출 1 문서. `api/docs/publications.md`(또는 #422가 만든 문서)에 설명·텍스트 자료 API를 더하고, `web/src/features/materials/README.md`를 쓴다

### 제출 2 — C-10 DB 구현·W3·W5 (선행: 제출 1, #423·U3 C-08 병합)

- [ ] Step 9: 시작 조건 확인. U2 `AiRun`·`DailyRunLimit`·`AiConsentGate`·`FileStorage`와 U3 `PublishedIndexWriter` 인터페이스·가짜가 통합 브랜치에 있는지 확인하고, 없으면 멈춘다
- [ ] Step 10: 제출 2 시나리오 확정. S4~S7·S9(작성자 쪽)·S10~S13의 기대 결과·실패 조건과, 작성자 실패 안내 표(신뢰성 설계 「작성자 실패 안내」)를 시험 머리 주석에 적는다(US4.1·US5.1·US5.2)
- [ ] Step 11: `PublicationsModule` 구성. `api/src/publications`에 모듈을 만들고 grant 키(`readLinkGrantKey`)·web 주소 설정(`readShareLinksConfig`)·unlock 정책·제어(`PRODUCT_UNLOCK_POLICY`·`createUnlockControls`)·발행 빈도 제한기·자체 시계 `PUBLICATIONS_CLOCK`를 자기 공급자로 선언한다. `share-links` 폴더에서는 표·API 비의존 도구만 import하고 `ShareLinksModule`·`share-links.service.ts`는 import하지 않는다. `OwnerProfileReaderModule`을 import한다(OQ-U4-NFR-6 합의 전 처리). 순환이 생기면 멈추고 공용 폴더 분리를 다시 검토한다. 이 제출에서는 아직 `AppModule`에 `ShareLinksModule`이 남아 있다(보안 설계 R-01·R-05, NFR1.5·NFR1.6)
- [ ] Step 12: C-10 DB 구현. #422의 `PublicationAccess` 인터페이스를 DB로 구현한다: `resolveForRecipient`(토큰 형식 → 발행본 → 중지·만료 → 소유 회원 비활성 404·회원 없음 500 → 비밀번호면 grant), `resolveForOwner`(소유자 아니면 NotFound, 중지가 만료보다 우선), `readSnapshot`(`published_item`만, 발행본 없으면 빈 사본을 만들지 않고 실패). 캐시 없음. 메모리 가짜는 시험용으로 둔다(US4.4·US5.1, BR6.1·BR6.2·BR6.4·BR6.5, NFR1.3·NFR1.4·NFR1.12·NFR4.7, C-10)
- [ ] Step 13: 발행 API. `POST /v1/publications`: 판정 순서(인증 → 빈도 1분 10회 임시 → 입력 → 동의 → 트랜잭션 밖 토큰·scrypt → 트랜잭션: `consume` → Catch `catch_id`·자료 `text_material_id` 오름차순 `FOR UPDATE` 재읽기·자격(409 `details.catchIds`)·전체 글 60,000자 임시 → 쓰기 → PRIVATE→PUBLIC → `chunkInTransaction` → 커밋) → 커밋 뒤 `EMBED_PUBLICATION`·`BASE_SUMMARY` 등록(실패는 로그만, 201). 응답 `url`에만 토큰(US4.1, BR4.1~BR4.9·BR5.1~BR5.5, NFR2.1·NFR4.2~NFR4.6·NFR5.1·NFR5.2)
- [ ] Step 14: 작성자 관리 API. `GET /v1/publications`(cursor, `indexState` 없음)·`GET /v1/publications/{id}`(`indexState` 없음)·`PUT .../stop`(행 잠금, 처음 시각 유지, 만료는 `{EXPIRED, null}`)·`DELETE`(접두어 먼저, 실패면 500·DB 유지, 성공이면 연쇄 삭제). reindex 경로는 만들지 않는다(OQ-U4-5)(US5.1·US5.2, BR8.1~BR8.6, NFR5.3~NFR5.7)
- [ ] Step 15: 로그. Nest `Logger('Publications')` 한 줄에 발행본 ID·회원 ID·오류 코드·결과 분류(발행 성공·실패, 작업 등록 결과와 작업 종류, 접두어 삭제 실패)만 남긴다. 칸 이름·값 표기는 여기서 정하고 임시임을 코드 주석에 적는다(NFR6.2·NFR6.3·NFR6.5·NFR6.6)
- [ ] Step 16: 작성자 화면 W3·W5. 새 `web/src/features/publications`에 발행 화면(본인 Catch·자료 선택과 위/아래 순서, 비공개 Catch 공개 전환 안내, 고를 수 없는 Catch 표시, 확인 단계의 항목·순서·비밀번호 여부·90일 만료, 발행 중 버튼 잠금)과 발행본 목록·상세(사본·상태·만료·링크 주소, 고정 안내 BR7.2, 비공개 전환 안내 BR7.3, 중지·삭제 확인)를 만든다. 오류 코드별 안내는 신뢰성 설계 「작성자 실패 안내」 표대로(409 두 종류는 10월 문구, 하루 한도 "오늘 한도에 도달했습니다", 빈도 초과는 `Retry-After` 동안 버튼 잠금). 기본 요약 패널(U5) 자리는 비워 둔다. 조작 요소에 `data-testid`(US4.1·US4.3·US5.1·US5.2, BR4.4·BR4.6·BR5.6·BR7.2·BR7.3, NFR7.5)
- [ ] Step 17: 제출 2 시험. api `test/publications/publication-access-db.test.cjs`(판정 순서·grant·만료·중지·형식 오류 토큰 404·비활성 404·회원 없음 500)·`publish-api.test.cjs`(S4~S7, 빈도 429·입력 400·동의 403·하루 한도 429·자격 409·전체 글 400·`chunkInTransaction` 예외 롤백·등록 실패 201)·`publications-manage-api.test.cjs`(S9 작성자 쪽·S10~S13, 회원 두 명 교차 접근 404)·`publications-logging.test.cjs`(로그 칸·합성 비밀값 비노출)·`publications-module.test.cjs`(공급자 구성, 운영 설정에서 `LINK_GRANT_SECRET` 없음·http 주소면 기동 실패). web `test/publish.test.mjs`(오류 코드별 안내·입력 유지·버튼 잠금)·`test/publications-owner.test.mjs`(목록·상세·중지·삭제 실패 안내). U2·U3는 계약 모양 가짜로 성공·실패를 고른다(NFR1.1·NFR1.12·NFR5.1~NFR5.7·NFR6.4·NFR7.5)
- [ ] Step 18: 제출 2 문서. `api/docs/publications.md`에 C-10 구현·발행·관리 API·로그 칸·임시값을 적고 `web/src/features/publications/README.md`를 쓴다

### 제출 3 — W4 받은 사람·W6 10월 제거 (선행: 제출 2, 한 PR)

- [ ] Step 19: 제출 3 시나리오 확정. S8·S9(받은 사람 쪽)·S14, G1~G7, 판정과 읽기의 시점(보안 설계 R-04)의 기대 결과·실패 조건을 시험 머리 주석에 적는다(US4.4·US5.1)
- [ ] Step 20: 받은 사람 컨트롤러. `PublicationsModule`에 `GET /v1/public/links/:token`(판정과 `readSnapshot`을 한 읽기 전용 REPEATABLE READ 트랜잭션에서, 발행본 없음은 404 `LINK_UNAVAILABLE`)·`POST /v1/public/links/:token/unlock`(10월 순서, 시도 제한이 해시보다 먼저, 링크 단위 키는 `publicationId`)을 메서드 단위 `@Public()`으로 더한다(US4.4, BR6.1·BR6.3·BR6.4, NFR1.2·NFR1.3·NFR1.7, C-12)
- [ ] Step 21: 10월 경로 해제(같은 변경). `AppModule`에서 `RecipientModule`·`ShareLinksModule`을 빼고 `PublicationsModule`을 등록한다. 10월 전용 파일(`share-create.ts`·`share-create-fingerprint.ts`·`share-link-issuance.ts`·`share-link-list.ts`·`share-link-response.ts`·`share-link-state.ts`·`issue-rate-limit.ts`·`share-links.service.ts`·`share-links.controller.ts`·`public-links.controller.ts`·`link-access.service.ts`·`share-links.module.ts`, `api/src/recipient/`)을 지운다. 재사용 도구·`share-link.entity.ts`·`member-analysis`·`idempotent-creation.ts`는 남긴다. 지우기 전에 import 관계를 다시 확인해 계획과 다르면 멈추고 적는다(BR9.1, 보안 설계 R-02·R-07, OQ-U4-3)
- [ ] Step 22: 받은 사람 화면. `web/src/features/recipient`를 발행본 화면으로 고친다: 판정·unlock·grant 보관·근거 링크 판정 동작 유지, 상태별 U4 h1(`tabIndex={-1}`, 첫 초점), 판정 통과 화면에만 0번 `RecipientGuide`(U2, `showClaudeConnect={false}`) 자리, U4 고정 안내(발행 시각 위주, 문구는 G5·G6 안에서 정함), 1번 발행본 자료(항목 순서, Catch는 기록·설명·AI 초안·불일치 표지 구분, 근거는 `isGithubSourceUrl`로만 링크, `aiDraft`·본문은 글자), 2~4번 자리(U5·U10 컴포넌트는 제공 뒤 연결), `onAccessLost`·`showEvidence`·`isLoggedIn`. 10월 공개 프로필·Catch 목록·상세 화면과 `web/src/app/s/[token]/catches/[catchId]`, 10월 `web/src/features/share-links`(작성자 공유 화면)를 지운다(US4.3·US4.4, BR6.6·BR7.1·BR7.5·BR7.6·BR9.1, NFR1.10·NFR1.11·NFR7.1~NFR7.4, C-11)
- [ ] Step 23: 제출 3 시험. api `test/publications/recipient-api.test.cjs`(S8·S9·S14, 형식 오류 토큰 404, 판정 뒤 중지 커밋 때 그 요청은 판정 시점 내용, 다음 요청 404, 비활성 소유자 열람·unlock 404·재활성 뒤 열림, **소유 회원 행이 없을 때 열람·unlock 500과 응답·로그에 SQL·내부 메시지·토큰 없음**(10월 `recipient-http.test.cjs` 회원 없음 사례처럼 `readOwnerState` 결과만 시험 대역))·`recipient-unlock-policy.test.cjs`(10월 `public-links-unlock*`·`public-links-client-address` 사례를 발행본 경로로 옮김)·`app-routes.test.cjs`(등록된 (메서드, 경로) 중복 없음, 두 받은 사람 경로가 새 컨트롤러 하나에만 연결, `/catches/:catchId`·10월 발급·목록·중지 경로 없음, `@Public()` 메서드 단위, `ShareLinksModule` 미등록, 운영 기동 검사 유지). 10월 시험 정리는 보안 설계 「web 시험 유지·제거」 표대로: 유지 묶음 그대로, 응답 모양만 바꿔 유지, W6 묶음과 api 10월 발급·목록·수신자 시험 제거. `share-links`를 참조하는 그 밖의 시험(`member-analysis`·`result-application`·`lock-wait-limit-role`·`member-cascade-delete`·`security-headers` 등)의 참조 내용을 확인해 고친다. web `test/recipient.test.mjs`(G1~G4, 사본 표지 구분, 근거 링크, 404·401·429·grant)(NFR1.2·NFR1.3·NFR1.7·NFR1.12·NFR6.4·NFR7.1~NFR7.4)
- [ ] Step 24: 제출 3 문서. `api/docs/publications.md`에 받은 사람 경로·판정 시점·소유 회원 처리(OQ-U4-NFR-6 합의 전)를, `web/src/features/recipient/README.md`를 발행본 화면으로, `api/docs/share-links.md`에 W6로 대체됐다는 안내와 남은 도구 목록을 적는다. PR 「리뷰 요청」에 U4 고정 안내 문구, G5~G7 검토 결과, 보류 범위를 적는다
- [ ] Step 25: 전체 확인. api 빌드(`npm run build`), U4 시험 전체(unit-test-instructions의 명령), 커버리지 80% 확인. FR19.2 확인 표에 S1~S14 결과를 적고 S15는 미실행으로 적는다(NFR6.8)

## 스토리 대응

| 스토리 | 단계 |
|---|---|
| US1.4 | Step 6, 22 |
| US2.1·US2.2 | Step 2, 3, 6, 7 |
| US2.3 | Step 2, 4, 7 |
| US3.1 | Step 2, 5, 6, 7 |
| US4.1 | Step 10, 13, 16, 17 |
| US4.3 | Step 16, 22 |
| US4.4 | Step 12, 19, 20, 22, 23 |
| US5.1 | Step 12, 14, 16, 17, 20 |
| US5.2 | Step 14, 16, 17 |
