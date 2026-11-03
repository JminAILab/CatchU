## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-29T05:14:08Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > 재사용하는 10월 도구 (Q1 A) 표, 그리고 nfr-design-questions.md > 답 분석 「확인」 | 재사용 도구 9개는 코드로 확인한 대로 `node:crypto`·`node:net`·`common/node-env`와 같은 폴더 도구만 import한다. 그런데 이 도구들이 동작하는 데 필요한 조립부는 모두 `ShareLinksModule`에만 있다. `LINK_GRANT_KEY`(`readLinkGrantKey`, 운영에서 `LINK_GRANT_SECRET` 없으면 기동 중단), `UNLOCK_POLICY`·`UNLOCK_CONTROLS`(제한기 싱글턴), `SHARE_LINKS_CONFIG`(`readShareLinksConfig`, `url`을 만들 web 주소와 운영 https 검사), 시계 토큰 `SHARE_LINKS_CLOCK`(서비스 파일 `share-links.service.ts`에 정의)가 그것이다. 설계는 "ShareLinksModule 전체 등록이 필요 없다"고만 적고 이 공급자를 누가 어디서 만드는지 적지 않았다. `share-links.config.ts`는 `buildRecipientLinkUrl`로 `url`을 만드는 데 필요한데 재사용 표에도 없다. W6에서 `ShareLinksModule`을 빼면 기동 시점 비밀키·https 검사와 제한기 공급이 함께 사라질 수 있다. 시계 토큰을 그대로 import하면 서비스 파일을 통해 표·API 의존이 새로 들어온다. | 재사용 표에 `share-links.config.ts`를 더하고, `PublicationsModule`이 `LINK_GRANT_KEY`·`UNLOCK_POLICY`·`UNLOCK_CONTROLS`·`SHARE_LINKS_CONFIG`·시계를 자기 공급자로 직접 선언한다고 적는다. 시계는 서비스 파일이 아닌 자기 토큰으로 둔다. 기동 시 검사(`LINK_GRANT_SECRET`, https 주소)가 W6 뒤에도 유지되는지 확인 항목으로 넣고, 이것이 어려우면 Q1 B 재검토 조건에 해당함을 적는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > api 인증·권한 구조, 마지막 Assumptions 항목 (10월 경로 제거는 W6) | 새 받은 사람 컨트롤러가 `GET /public/links/{token}`과 `POST /public/links/{token}/unlock`을 선언하는데, 같은 경로가 이미 `api/src/recipient`(`@Get(':token')`, `@Get(':token/catches/:catchId')`)와 `share-links/public-links.controller.ts`(`@Post(':token/unlock')`)에 등록돼 있고 `AppModule`이 두 모듈을 불러온다. 설계는 제거를 W6에 연결한다고만 적고, 새 경로 등록과 옛 컨트롤러 해제가 같은 변경에서 일어나야 하는지, 중간 상태에서 어느 쪽이 요청을 받는지는 적지 않았다. 같은 경로가 둘이면 Nest는 먼저 등록된 쪽이 조용히 받아 10월 `share_link` 판정이 새 판정 대신 동작하거나 그 반대가 될 수 있다. 보안 판정이 두 구현으로 갈리는 구간이다. | 새 받은 사람 컨트롤러 등록과 `RecipientModule`·`ShareLinksController`·`PublicLinksController` 해제를 한 변경(한 PR)에서 하도록 W6 연결 문장에 적는다. 그 사이에 어느 경로도 두 구현에 동시에 열리지 않는다는 확인(경로 중복 시험)을 보안 시험 항목에 넣는다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > web 화면 출력 (Q2 A) | "`web/test/recipient.test.mjs`를 유지한다"는 범위가 넓다. 코드 확인 결과 이 시험과 `recipient-store.ts`·`recipient-api.ts`·`recipient-screen.tsx`의 대부분은 W6에서 지울 공개 프로필·Catch 목록·상세(`/catches/[catchId]`)와 엮여 있다. `isGithubSourceUrl`의 현재 호출처(`recipient-screen.tsx` 254행 근거 링크)도 Catch 상세 쪽이다. 어느 시험 묶음이 남고 어느 것이 함께 사라지는지, 근거 링크 판정의 새 호출처가 어디인지가 설계에 없다. | 유지할 시험 묶음(판정 응답 처리, unlock 429, `recipient-grants`, `isGithubSourceUrl`)과 W6와 함께 지울 묶음을 나누어 적고, `isGithubSourceUrl`을 새 화면의 어느 자리에서 쓰는지 한 줄 더한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > 링크 판정 (C-10 `PublicationAccess`) 아래 `readSnapshot` 항목 | 10월 `LinkAccessService`는 링크 판정과 후속 읽기를 읽기 전용 REPEATABLE READ 한 트랜잭션으로 묶어 같은 시점을 보게 했다. C-10에서는 `resolveForRecipient`와 `readSnapshot`이 따로 호출되고 설계도 "한 행 조회 → 판정 → 항목 읽기"로만 적어, 판정 직후 중지·삭제가 끼어들 때의 동작이 정해져 있지 않다. 삭제는 읽기 실패(404)로 끝나지만, 중지는 판정 통과 직후의 한 번 읽기를 허용하는 창이 남는다. | 이 창을 허용하는 한계로 적거나(중지 직후 한 요청 분량), `readSnapshot`이 `publicationId`로 읽을 때 부모 행이 사라졌으면 `LinkUnavailable`로 끝난다는 동작을 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/logical-components.md > 구성 요소 표 「Catch 설명·텍스트 자료 API」·「작성자 화면」 | C-13·C-14 저장 API와 작성자 화면의 위치를 "코드 생성 계획에서 정함"으로 미뤘다. 10월 `catches` 모듈이 `catch_asset`을 소유하는데 발행 트랜잭션은 그 행을 `FOR UPDATE`로 읽으므로, 새 API가 어느 모듈에 놓이는가에 따라 `publications`와 `catches` 사이 순환 의존이 생길 수 있다. 미룬 것 자체는 명시돼 있어 문제 삼지 않지만, 순환을 피하는 판단 기준이 없다. | 코드 생성 계획에서 정할 때 `publications → catches` 한 방향만 허용하고 순환이 생기면 멈춘다는 기준을 한 줄 적는다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > 링크 판정 (C-10 `PublicationAccess`) 흐름도와 `PublicationsModule` 공급자 구성 | 10월 `LinkAccessService.usableLink`는 링크 판정 직후 같은 스냅샷에서 소유 회원 상태를 읽어, 비활성(`accountState`가 `ACTIVE`가 아님)이면 다른 불가 사유와 같은 404를 돌려준다. 그래서 `ShareLinksModule`이 `OwnerProfileReaderModule`을 import한다. 새 판정 흐름도와 공급자 표에는 이 단계도 import도 없다. 요구사항·계약 요약에는 소유 회원 비활성이 언급되지 않아, 10월에 있던 차단을 W6에서 조용히 없애는지 의도적으로 뺀 것인지 알 수 없다. 탈퇴는 C-06 연쇄 삭제로 막히지만 비활성 상태는 삭제가 아니다. | 비활성 회원의 발행본을 계속 열 수 있게 둘지, 10월처럼 404로 막을지를 판정 설명에 한 줄로 정한다. 막는다면 `OwnerProfileReaderModule` import와 같은 스냅샷 읽기를 `PublicationsModule` 구성과 시험 항목에 더한다. 요구사항 근거가 없어 정하기 어렵다면 미결 항목(담당·결정 시점·합의 전 처리 포함)으로 올린다. | New |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md > 받은 사람 경로 교체의 「남기는 것」과 logical-components.md > 10월 코드 정리 | `api/src/share-links/`에는 재사용 표 밖의 파일 `share-create.ts`, `share-create-fingerprint.ts`, `share-link-issuance.ts`, `share-link-list.ts`, `share-link-response.ts`, `share-link-state.ts`, `issue-rate-limit.ts`도 있다. 설계는 「남기는 것」을 재사용 도구와 `share-link.entity.ts`로만 적고 이들의 처리는 말하지 않는다. 일부(`share-link-issuance.ts`, `share-link-response.ts`)는 `ShareLink` 엔티티를 직접 import하므로 남기면 유지 책임이, 지우면 `member-analysis`의 `createShareLink` 연산 쪽 참조 확인이 필요하다. | 위 파일을 W6에서 지울지 남길지 한 줄로 적거나 코드 생성 계획에서 목록으로 확인한다고 적는다. 지운다면 `member-analysis`·`idempotent-creation.ts`의 참조가 남지 않음을 확인 항목에 넣는다. | New |

> R-01 Reviewer note: 「재사용하는 10월 도구」 표에 `share-links.config`가 들어갔고, 「`PublicationsModule` 공급자 구성」이 grant 키·web 주소 설정·unlock 정책·제어·발행 빈도 제한기·자체 시계(`PUBLICATIONS_CLOCK`)를 직접 선언한다. `share-links.module.ts`의 공급자 구성과 일치하고, `readLinkGrantKey`·`readShareLinksConfig`의 기동 검사 설명(운영에서 `LINK_GRANT_SECRET` 없음·64자 hex 아님·`AUTH_JWT_SECRET`과 같음, https 아님)이 코드와 맞는다. W6 뒤 기동 실패 확인 항목과 Q1 B 재검토 조건도 있다. 단 `ShareLinksModule`이 가져오던 `OwnerProfileReaderModule`은 아래 새 발견 참고.

> R-02 Reviewer note: 「받은 사람 경로 교체」가 새 컨트롤러 등록과 `RecipientModule`·`ShareLinksModule` 해제를 한 변경(한 PR)으로 묶고, 중간 상태를 통합 브랜치에 두지 않는다고 적었다. `AppModule`을 띄우는 경로 중복 시험(같은 쌍 중복 없음, 두 경로가 새 컨트롤러 하나에만 연결, 옛 `/catches/:catchId`와 발급·목록·중지 경로 부재)이 명시됐다.

> R-03 Reviewer note: 「web 시험 유지·제거」가 세 묶음으로 나누고 줄 번호를 적었다. `web/test/recipient.test.mjs`의 130·143·157·192·212·228·287·305·678·685행과 제거 묶음 115·261·329·489·510·602·624·649·666행이 실제 시험 제목과 일치한다. `isGithubSourceUrl`의 새 사용 위치(발행본 자료 안 Catch 사본의 `snapshot.evidence[].sourceUrl`)도 적혔다.

> R-04 Reviewer note: 「판정과 읽기의 시점」 표가 10월 구현(`withLinkSnapshot`의 읽기 전용 REPEATABLE READ 한 트랜잭션, 코드와 일치)과 U4 열람 경로, 진행 중 중지·삭제, 다음 요청 차단을 구분했다. U5·U10·U9가 C-10을 따로 부를 때의 틈은 OQ-U4-NFR-5로 미결에 올렸고 담당·시점·합의 전 처리가 있다.

> R-05 Reviewer note: 「의존 방향」이 허용 방향(`publications → catches` 등)과 막는 방향을 정하고 순환이 생기면 멈추며 `forwardRef`로 우회하지 않는다는 기준을 적었다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 읽기(UTF-8) | PASS: 유효한 JSON, `coverage` 47행 모두 `OK` | 형식 이상 없음 |
| `upstream_ids` 대 nfr-requirements의 `NFRx.y` | PASS: 47개가 양방향으로 일치(누락·초과 없음) | NFR7.5가 reliability-design 「작성자 실패 안내」를 가리키고 해당 절이 실제로 있다 |
| 설계가 인용한 시험 줄 번호·파일 | PASS: `recipient.test.mjs` 인용 줄이 모두 제목과 일치, 인용한 api 시험 파일(`api/test/db/public-links-unlock*.test.cjs` 등)이 실제로 있다 | 인용 정확 |
| 코드 사실 대조 | PASS: `readLinkGrantKey`·`readShareLinksConfig` 검사, `share-links.module.ts` 공급자 목록, `link-access.service.ts`의 REPEATABLE READ 읽기 전용 트랜잭션, 에러 코드 `CONFIRMATION_REQUIRED`·`SOURCE_RESTRICTED`(409)·`RATE_LIMITED`(429)와 web 문구가 설계 서술과 일치. `DAILY_LIMIT_REACHED`는 계약 요약 C-03 `http-error`가 근거 | 새 결정을 임의로 확정한 곳은 찾지 못했다. 문구 미정 두 건은 "코드 생성 때 정함"으로 범위를 제한했다 |
| Mermaid 문법 | PASS(육안): flowchart 노드·분기 형식에 문제 없음, 텍스트 대체 있음 | |

### Summary

R-01~R-05는 모두 설계에 반영되어 코드 사실과 맞고, 미결(OQ-U4-NFR-1~5 등)과 승인된 결정은 유지됐다. 남은 것은 10월 판정의 소유 회원 비활성 404가 새 판정 흐름에 빠진 점과 W6 뒤 `share-links` 폴더의 나머지 파일 처리 미정으로, 둘 다 구현을 막지 않는 Minor이므로 승인 때 사람이 판단하면 된다.
