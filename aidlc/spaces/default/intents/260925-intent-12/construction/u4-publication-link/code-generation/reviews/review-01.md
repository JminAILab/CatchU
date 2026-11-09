## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-03T05:18:28Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | api/src/common/errors/api-error.ts > ErrorDetails.catchIds, api/src/common/errors/api-exception.filter.ts > withDetails, web/src/lib/api-response.ts > details.catchIds | 모든 경로가 공유하는 오류 본문에 `details.catchIds`를 새로 열었다. code-summary D5가 스스로 「팀장 확인 필요(계약 수정 여부)」로 남겼고, 기존 오류 계약의 `details` 허용 키는 `violations`·`existingRequestId` 둘뿐이라 아직 승인된 계약이 아니다. 코드 영향은 좁다(UUID만 복사하고 다른 키는 그대로 버리며, 새 키가 없으면 응답이 달라지지 않는다). 그래도 승인 없이 합치면 계약과 구현이 어긋난 채 남는다. | 승인 전에 팀장에게 `catchIds` 추가를 계약 수정으로 확정받아 오류 계약 문서에도 같은 키를 적는다. 받아들이지 않으면 409에서 Catch 목록을 전하는 방식을 다시 정하고, 필터·web 해석기 변경을 되돌린다. | New |
| R-02 | Minor | api/src/publications/publications.module.ts > providers (`UNLOCK_POLICY`, `UNLOCK_CONTROLS`) | 제출 2에는 쓰는 곳이 없는 unlock 정책·제어 공급자를 미리 등록했다(주석도 「지금은 선언만」). 제출 3이 쓸 자리를 앞당긴 것이라, 기동 때 메모리 제한기 인스턴스가 하나 더 생기고 읽는 사람에게 쓰임이 불분명하다. 동작 결함은 아니다. | 제출 3에서 받은 사람 unlock을 붙일 때 같이 등록하거나, 지금 두려면 쓰임과 제거 시점을 한 줄로 분명히 한다. | New |
| R-03 | Minor | api/src/publications/publication-manage.service.ts > remove | 삭제만 `assertMemberExists`와 트랜잭션을 거치지 않는다. 목록·상세·중지는 회원 행이 없으면 401 AUTH_INVALID인데, 삭제는 소유 확인 실패로 404가 된다. 소유 확인과 접두어 삭제 사이에는 잠금이 없어 그 사이 다른 요청의 삭제와 겹칠 수 있다(마지막 `deleted === 0` 확인으로 응답은 404로 맞게 끝난다). 보안·무결성 결함은 아니고 응답 일관성 문제다. | 회원 없음 응답을 다른 관리 API와 맞출지 정하고, 그대로 둔다면 이유를 `docs/publications.md`에 한 줄 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/code-generation/code-summary.md > 로그인 만료 기본 모드 설명, 발행 화면의 401 처리 | 기본 모드(통합 모드 꺼짐)에서는 공통 클라이언트가 토큰을 지우고 회원 가드가 로그인으로 보내서 입력이 사라진다고 적혀 있다. 이 검증은 텍스트 자료·Catch 설명에 대한 것이고, 발행 화면(고른 항목·제목·비밀번호 입력)의 401도 같은 경로를 타는지는 기록이 없다. D13은 401을 확인 단계에 남아 입력을 유지한다고 적었다. 기본 모드에서는 이 문장과 다를 수 있다. | 발행 화면의 401을 기본 모드와 통합 모드로 각각 확인해 결과를 code-summary에 적고, 기본 모드에서 입력이 사라지면 D13의 설명을 고치거나 공통 기반 변경을 팀장에게 요청한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| api 시험(제출 2 명령, `TEST_DB_PORT=5443`) | PASS: tests 47, pass 47, fail 0, 약 64초 | 발행(S4~S7, 400·403·404·429, 60,000자 경계), DB 판정, 관리 API, 로그, 모듈 의존 방향 시험이 통과한다. |
| web `node --test` (author-description, materials, publish, publications-owner) | PASS: tests 31, pass 31, fail 0 | 링크 열기의 ACTIVE 조건, URL 복사의 클립보드 성공 판정, 실패 구분과 입력 유지가 시험으로 닫혀 있다. |
| `api` `tsc --noEmit` | PASS (출력 없음) | 타입 오류 없음. |
| `web` `tsc --noEmit` | PASS (출력 없음) | 타입 오류 없음. |

### Summary

팀장 결정 #416(2026-11-03)과 설계 대조에서 막는 결함은 찾지 못했다. 발행 트랜잭션의 순서(빈도, 입력, 동의, 트랜잭션 밖 토큰·scrypt, 하루 횟수, Catch 잠금 후 텍스트 자료 잠금, 쓰기, 공개 전환, 조각 나누기, 커밋 뒤 두 작업 등록·실패는 로그만 201)가 코드에 그대로 있고, 판정 순서와 캐시 없음, `BASE_SUMMARY` 상시 등록, `PUBLICATION_ACCESS` export, 삭제 시 접두어 먼저(실패면 500·DB 유지), 로그에 토큰·본문 없음도 확인했다. 승인 전에 풀어야 할 것은 공유 오류 본문의 `catchIds` 계약 확정(Major)이고, 나머지는 정리 수준이다. 제출 3 범위의 미구현 항목은 지적하지 않았다.
