## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T00:41:45Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-design/performance-design.md > 목록 아래 둘째 항목 「읽기 경로는 잠그지 않는다(READ COMMITTED, 지금 본인 Catch 목록과 같음)」 | 지금 코드와 어긋난다. `api/src/catches/owner-catch-store.ts`의 `list`·`get`은 `REPEATABLE READ` 트랜잭션 안에서 회원 행을 확인한 뒤 읽는다. 목록·상세·세기는 프리셋 행 → 항목 행 → 종류별 원본을 여러 문장으로 나눠 읽는데, `READ COMMITTED`면 문장 사이에 자료가 지워질 때 항목은 있는데 원본 행이 없는 상태를 읽는다. 이때 처리가 적혀 있지 않다(세기만 「수가 다르면 404」). 같은 사본 읽기도 `recipient-access.service.ts`에서 읽기 전용 `REPEATABLE READ`를 쓴다. | 목록·상세·세기를 읽기 전용 `REPEATABLE READ` 한 트랜잭션에서 읽는다고 고치고, 「지금 본인 Catch 목록과 같음」 문장을 바로잡는다. 읽기 경로에서 회원 행 확인(`AUTH_INVALID`)을 지금 Catch 목록과 같이 둘지도 한 줄로 정한다. 같은 스냅샷 안에서 항목은 있는데 원본이 없는 경우는 데이터 문제로 보고 500이라고 적는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-design/reliability-design.md > NFR2.10 「판정 함수를 자료마다 부른다」와 performance-design.md > NFR6.2 | 두 문장이 부딪친다. 지금 판정 함수 `assertCatchesEligible`(`publish.service.ts`)은 `manager`를 받아 호출마다 `PROTECTION_SQL`을 직접 조회한다. 자료마다 부르면 보호 관측 조회가 Catch 수만큼 늘어 NFR6.2의 「조회 수는 프리셋 1 + 항목 1 + 종류별 고정 수」와 「프리셋 1개와 50개의 조회 수가 같음」 시험을 지킬 수 없다. 또 이 함수는 여러 Catch를 한 묶음으로 받아 확인 필요 → 원 요청 불일치 → 보호 순으로 던지므로, 자료마다 이유 하나를 돌려주는 BR2.2와 모양이 맞지 않는다. logical-components의 「잠금 없는 읽기와 잠근 행용 함수」가 이 나눔을 말하지만 성능·안정 설계는 따르지 않는다. | PublishableSource를 읽기와 판정으로 나눈다고 적는다. 읽기는 묶음으로 한 번에(잠금 있음·없음 두 형태), 판정은 미리 읽은 Catch 행과 보호 관측 Map만 받아 DB를 부르지 않는 함수다. 목록·상세·세기와 발행이 같은 판정을 쓰되, 기록 문제 예외는 그대로 던진다. 발행의 묶음 순서(확인 필요 → 기록 문제 → 보호)와 읽기의 자료별 순서를 각각 어떻게 지킬지도 한 줄로 쓴다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-design/reliability-design.md > NFR2.8 「프리셋 펴기만 맨 앞(트랜잭션 밖, PDF 확인 전)에 더한다」 | 기능 설계 W4는 빈도·본문·동의 다음에 펴기를 둔다. 「맨 앞」으로 읽어 지금 `publish`의 빈도 제한이나 동의 확인보다 먼저 두면, 동의가 없거나 빈도가 넘은 요청이 404로 바뀔 수 있다. | 「빈도·본문·동의 다음, PDF 추출 확인 앞」으로 고친다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-design/performance-design.md > NFR6.2 「PDF 행과 쪽 글」 | 쪽 글을 통째로 읽어 코드 포인트를 세면 프리셋 50개 × 항목 20개의 PDF 본문이 한 요청에 메모리로 올라올 수 있다. 읽을 수 있는 쪽의 글자 수만 필요하다. | PDF 글자 수는 SQL 집계(읽을 수 있는 쪽의 `char_length` 합)로 구하고 본문은 읽지 않는다고 적는다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-design/scalability-design.md > NFR6.5 색인 `(member_id, created_at)` | 규칙 BR1.9는 「만든 시각 오름차순, 같으면 presetId 순」이다. 색인에 preset_id가 없으면 같은 시각의 순서를 색인이 받쳐 주지 않고, 설계에도 정렬 키가 적혀 있지 않다. | 색인을 `(member_id, created_at, preset_id)`로 하거나 정렬 키를 `created_at, preset_id`로 못박는다. | New |
| R-06 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-design/reliability-design.md > NFR2.12 「기존 시험의 사본 객체 만드는 곳」 | isFirstCopy를 필수 칸으로 만들면 시험만이 아니라 시험 밖에서 `PublishedSnapshotItem`을 만드는 곳(`in-memory-publication-access.ts`, `db-publication-access.ts`의 `readSnapshotIn`)도 컴파일이 깨진다. 설계는 시험만 적었다. | 고칠 곳에 `in-memory-publication-access.ts`를 포함한다고 쓴다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 현재 코드 대조(`publications.controller.ts`, `publications-log.ts`, `publish.service.ts`, `api-exception.filter.ts`, `owner-catch-store.ts`, `published-snapshot.ts`, 마이그레이션 외래 키) | 위 두 Major 외 일치 | 전역 Bearer 가드(`APP_GUARD`)·`withDetails`의 `catchIds` 복사·`publishFailed(owner, code)`·잠금 순서·publication 연쇄 삭제(`ON DELETE CASCADE`)가 설계 문장과 맞다. 읽기 트랜잭션 격리 수준과 판정 함수의 조회 방식만 어긋난다. |
| 이 단계의 검증 도구 | 정의 없음 | 실행할 도구가 없어 실행하지 않았다. |

### Summary

NFR 요구 27개가 모두 설계에 대응하고 보안·로그·마이그레이션 문장은 현재 코드와 맞는다. 다만 읽기 경로의 격리 수준 서술이 지금 코드와 다르고, 판정 함수를 자료마다 부르라는 문장이 조회 수 고정 요구와 부딪친다. 두 건 모두 Major 두 개 이내이므로 READY이며, 코드 생성 전에 두 문장을 바로잡는 편이 안전하다.
