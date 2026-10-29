# 회원 탈퇴 DELETE /v1/me — 12월 intent U2

로그인 회원 본인이 계정과 자료를 지우는 API(`src/withdrawal/`)다. DB 연쇄 삭제 규칙은 [회원 탈퇴의 DB 연쇄 삭제](member-withdrawal-deletion.md)에 있고, 이 문서는 탈퇴 순서·응답·실패 처리를 다룬다.

기준 문서: [계약 C-06](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) withdrawal-order, [U2 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/functional-spec.md) W7·W8·[업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR7, [U2 보안·신뢰성 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/nfr-design/).

## 요청

`DELETE /v1/me`, `Authorization: Bearer <Access 토큰>`. 본문·쿼리는 없다(있으면 400 `VALIDATION_FAILED`). Refresh 쿠키를 지우므로 갱신·로그아웃과 같은 허용 출처 검사(`AUTH_WEB_ORIGIN`)를 한다(다르면 403 `AUTH_ORIGIN_FORBIDDEN`). 공통 Guard가 확인한 회원 본인만 지운다. 다른 회원 ID를 받는 입력은 없다(BR7.1, NFR1.1).

## 순서

| 단계 | 하는 일 | 대상이 없을 때 |
|---|---|---|
| 1 | 한 트랜잭션: 그 회원의 모든 세션 폐기(`revoked_at`), 중지되지 않은 발행 링크 `publication.stopped_at = now`, `mcp_access_token`·`mcp_authorization_code`·`mcp_connection`의 그 회원 행 삭제 | — |
| 2 | `FileStorage.deletePrefix(members/{memberId}/)` | 성공 |
| 3 | GitHub 연결의 자격정보 파일 삭제(`CredentialVault.remove`) | 연결·참조·파일이 없으면 성공 |
| 4 | `member_account` 행 삭제(연쇄 삭제) | — |

- 앞 단계가 실패하면 뒤 단계를 하지 않고 500 `WITHDRAWAL_FAILED`("탈퇴를 끝내지 못했습니다. 팀에 알려 주세요")로 끝난다(교착 포함, BR7.4). 1단계 효과(세션 폐기·링크 중지·MCP 삭제)는 되돌리지 않는다.
- 4단계까지 끝나야 204와 Refresh 쿠키 제거(`Max-Age=0`)를 보낸다(BR7.5).
- 1단계가 끝나면 세션이 모두 폐기되어 남은 Access 토큰은 다음 요청부터 401이다(Guard가 요청마다 DB 세션을 확인, NFR1.2).
- 실패한 회원은 다시 로그인해 탈퇴를 다시 요청할 수 있다. 2·3단계는 대상이 없으면 성공이라 같은 자리에서 막히지 않는다(NFR5.1).
- 탈퇴한 Google 계정으로 다시 로그인하면 `googleSubject`에 맞는 행이 없어 새 회원(새 memberId, 빈 자료)으로 시작한다(BR7.6).

## U4·U6 표가 아직 없을 때

1단계의 `publication`(U4, 계약 C-07)과 `mcp_*`(U6, 계약 C-15) 표가 통합 브랜치에 아직 없으면 그 표는 건너뛴다(`to_regclass`로 확인). 표가 없으면 막을 행도 없기 때문이다. 표 이름은 계약에 고정된 값이다. **U4·U6를 합친 뒤 실제 표로 탈퇴 통합 시험을 다시 돌리는 것이 U2 완료 조건이다**(기능 명세 가정 4).

## 로그

실패 때 `withdrawal_failed` 한 줄: `step`(1~4), `error`(오류 이름). 회원 ID·파일 경로·오류 메시지는 남기지 않는다(관측 설계 NFR6.7). 공통 오류 필터의 500 로그(경로 틀·분류명·코드 위치)도 함께 남는다.

## web

회원 정보 화면(`/profile`)의 [탈퇴] → 확인창("탈퇴하면 계정과 자료, 발행 링크, Claude 연결이 바로 지워지고 되돌릴 수 없습니다") → [탈퇴하기] → `DELETE /v1/me`. 204면 페이지 전체를 `/?withdrawn=1`로 다시 열어 메모리 토큰을 버리고 "탈퇴했습니다"를 보인다. 실패·결과 불명은 안내만 보이고 다시 보내지 않는다(`web/src/features/withdrawal/`).

## 시험

`test/u2/withdrawal.test.cjs`(8개, 실제 AppModule·Guard·테스트 DB, 임시 폴더의 파일 저장·자격정보 보관): 정상(S24), 2단계 실패(S25), 3단계 실패 뒤 재요청, 탈퇴 뒤 401(S26), Google 재가입(S27, 합성 Google 응답), 인증·출처·입력 거부, 파일 저장 설정 없음, U4·U6 표 없음.

- U4·U6 표가 없으면 시험이 C-07·C-15 모양의 시험용 표를 만들고 끝나면 지운다. 실제 표가 이미 있으면 만들지도 지우지도 않으며, 그때는 시험의 자료 넣기가 실제 표 모양과 달라 실패하므로 실제 표 모양으로 시험을 고친다.
- 다른 회원의 JD 원본이 남는지(S24 일부)는 U10 `jd` 표가 합쳐진 뒤 확인한다.
