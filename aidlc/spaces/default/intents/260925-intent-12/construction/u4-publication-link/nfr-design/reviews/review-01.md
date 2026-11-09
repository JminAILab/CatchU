## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-29T04:58:35Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > 재사용하는 10월 도구 (Q1 A) 표, 그리고 nfr-design-questions.md > 답 분석 「확인」 | 재사용 도구 9개는 코드로 확인한 대로 `node:crypto`·`node:net`·`common/node-env`와 같은 폴더 도구만 import한다. 그런데 이 도구들이 동작하는 데 필요한 조립부는 모두 `ShareLinksModule`에만 있다. `LINK_GRANT_KEY`(`readLinkGrantKey`, 운영에서 `LINK_GRANT_SECRET` 없으면 기동 중단), `UNLOCK_POLICY`·`UNLOCK_CONTROLS`(제한기 싱글턴), `SHARE_LINKS_CONFIG`(`readShareLinksConfig`, `url`을 만들 web 주소와 운영 https 검사), 시계 토큰 `SHARE_LINKS_CLOCK`(서비스 파일 `share-links.service.ts`에 정의)가 그것이다. 설계는 "ShareLinksModule 전체 등록이 필요 없다"고만 적고 이 공급자를 누가 어디서 만드는지 적지 않았다. `share-links.config.ts`는 `buildRecipientLinkUrl`로 `url`을 만드는 데 필요한데 재사용 표에도 없다. W6에서 `ShareLinksModule`을 빼면 기동 시점 비밀키·https 검사와 제한기 공급이 함께 사라질 수 있다. 시계 토큰을 그대로 import하면 서비스 파일을 통해 표·API 의존이 새로 들어온다. | 재사용 표에 `share-links.config.ts`를 더하고, `PublicationsModule`이 `LINK_GRANT_KEY`·`UNLOCK_POLICY`·`UNLOCK_CONTROLS`·`SHARE_LINKS_CONFIG`·시계를 자기 공급자로 직접 선언한다고 적는다. 시계는 서비스 파일이 아닌 자기 토큰으로 둔다. 기동 시 검사(`LINK_GRANT_SECRET`, https 주소)가 W6 뒤에도 유지되는지 확인 항목으로 넣고, 이것이 어려우면 Q1 B 재검토 조건에 해당함을 적는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > api 인증·권한 구조, 마지막 Assumptions 항목 (10월 경로 제거는 W6) | 새 받은 사람 컨트롤러가 `GET /public/links/{token}`과 `POST /public/links/{token}/unlock`을 선언하는데, 같은 경로가 이미 `api/src/recipient`(`@Get(':token')`, `@Get(':token/catches/:catchId')`)와 `share-links/public-links.controller.ts`(`@Post(':token/unlock')`)에 등록돼 있고 `AppModule`이 두 모듈을 불러온다. 설계는 제거를 W6에 연결한다고만 적고, 새 경로 등록과 옛 컨트롤러 해제가 같은 변경에서 일어나야 하는지, 중간 상태에서 어느 쪽이 요청을 받는지는 적지 않았다. 같은 경로가 둘이면 Nest는 먼저 등록된 쪽이 조용히 받아 10월 `share_link` 판정이 새 판정 대신 동작하거나 그 반대가 될 수 있다. 보안 판정이 두 구현으로 갈리는 구간이다. | 새 받은 사람 컨트롤러 등록과 `RecipientModule`·`ShareLinksController`·`PublicLinksController` 해제를 한 변경(한 PR)에서 하도록 W6 연결 문장에 적는다. 그 사이에 어느 경로도 두 구현에 동시에 열리지 않는다는 확인(경로 중복 시험)을 보안 시험 항목에 넣는다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > web 화면 출력 (Q2 A) | "`web/test/recipient.test.mjs`를 유지한다"는 범위가 넓다. 코드 확인 결과 이 시험과 `recipient-store.ts`·`recipient-api.ts`·`recipient-screen.tsx`의 대부분은 W6에서 지울 공개 프로필·Catch 목록·상세(`/catches/[catchId]`)와 엮여 있다. `isGithubSourceUrl`의 현재 호출처(`recipient-screen.tsx` 254행 근거 링크)도 Catch 상세 쪽이다. 어느 시험 묶음이 남고 어느 것이 함께 사라지는지, 근거 링크 판정의 새 호출처가 어디인지가 설계에 없다. | 유지할 시험 묶음(판정 응답 처리, unlock 429, `recipient-grants`, `isGithubSourceUrl`)과 W6와 함께 지울 묶음을 나누어 적고, `isGithubSourceUrl`을 새 화면의 어느 자리에서 쓰는지 한 줄 더한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > 링크 판정 (C-10 `PublicationAccess`) 아래 `readSnapshot` 항목 | 10월 `LinkAccessService`는 링크 판정과 후속 읽기를 읽기 전용 REPEATABLE READ 한 트랜잭션으로 묶어 같은 시점을 보게 했다. C-10에서는 `resolveForRecipient`와 `readSnapshot`이 따로 호출되고 설계도 "한 행 조회 → 판정 → 항목 읽기"로만 적어, 판정 직후 중지·삭제가 끼어들 때의 동작이 정해져 있지 않다. 삭제는 읽기 실패(404)로 끝나지만, 중지는 판정 통과 직후의 한 번 읽기를 허용하는 창이 남는다. | 이 창을 허용하는 한계로 적거나(중지 직후 한 요청 분량), `readSnapshot`이 `publicationId`로 읽을 때 부모 행이 사라졌으면 `LinkUnavailable`로 끝난다는 동작을 적는다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/logical-components.md > 구성 요소 표 「Catch 설명·텍스트 자료 API」·「작성자 화면」 | C-13·C-14 저장 API와 작성자 화면의 위치를 "코드 생성 계획에서 정함"으로 미뤘다. 10월 `catches` 모듈이 `catch_asset`을 소유하는데 발행 트랜잭션은 그 행을 `FOR UPDATE`로 읽으므로, 새 API가 어느 모듈에 놓이는가에 따라 `publications`와 `catches` 사이 순환 의존이 생길 수 있다. 미룬 것 자체는 명시돼 있어 문제 삼지 않지만, 순환을 피하는 판단 기준이 없다. | 코드 생성 계획에서 정할 때 `publications → catches` 한 방향만 허용하고 순환이 생기면 멈춘다는 기준을 한 줄 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json (UTF-8 JSON 파싱, `upstream_ids` 대 nfr-requirements 6개 문서의 `NFRx.y` 전수 대조) | PASS: 누락 0, 초과 0 | 상류 요구사항 ID가 모두 덮여 있고 존재하지 않는 ID도 없다. |
| 재사용 도구 import 확인(`link-token`·`link-password`·`link-grant`·`request-rate-limiter`·`unlock-limiter`·`link-limiter`·`unlock-policy`·`hash-gate`·`client-address`) | PASS: `node:crypto`·`node:net`·`common/node-env`·같은 폴더 도구만 import, `share_link`·엔티티·서비스·모듈 import 없음 | 도구 자체는 표·API 비의존이라는 설계 설명이 맞다. 다만 이 도구를 움직이는 공급자는 `ShareLinksModule`에만 있다(첫째 Major). |
| 판정 순서 대조(C-10 계약, 10월 `link-access.service.ts`, 설계 흐름도) | PASS | 형식 → 존재 → 중지·만료 → grant 순서가 C-10과 일치한다. grant가 `[linkId, 만료]`만 담고 소문자 UUID를 요구하므로 `publicationId`로 바꿔 써도 맞는다. |
| 전제 점검(Q1 A·Q2 A, 임시값, OQ-U4-2~7, OQ-U4-NFR-1~4) | PASS | 미결을 확정한 곳은 찾지 못했다. 본문 자동 링크 미구현, `aiDraft` 링크 없음, 1분 10회·60,000자 임시 표시, 결과 분류 표기 임시는 모두 전제대로다. |
| `security-events` 기록 기준 | PASS | 기록은 경로가 아닌 오류 코드로 정해지므로 새 컨트롤러에도 별도 작업 없이 적용된다. |
| Mermaid 문법(흐름도, 시퀀스 다이어그램) | PASS | 구문 오류 없음, 텍스트 대체 설명 있음. |

### Summary

도구 재사용 판단과 판정 순서는 코드와 계약에 맞고 미결 항목도 임의로 확정하지 않았다. 다만 도구를 돌리는 공급자(grant 키·제한기·web 주소·시계)의 조립 위치와 10월 경로 해제 시점이 설계에 없어, 이 두 가지는 코드 생성 전에 보완하는 편이 안전하다.
