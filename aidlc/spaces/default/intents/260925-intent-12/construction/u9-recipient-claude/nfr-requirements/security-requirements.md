# U9 받은 사람의 Claude 연결 — 보안 요구사항

## Sources

작성일: 2026-11-09. 입력:
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)
- [U9 업무 규칙](../functional-design/rules.md)(rules)
- [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR1·NFR2·FR4.2·FR4.4·FR13.3·FR13.5·FR19.1
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-07·C-10·C-11·C-15
- [U6 보안 요구사항](../../u6-claude-mcp/nfr-requirements/security-requirements.md)의 NFR1.1·NFR1.6·NFR1.10·NFR2.1
- [보안 점검](../../../../../../../../docs/CatchU_security_checks.md)의 「API 경로·권한」·「요청·메시지 입력」·「화면 출력」·「로그·오류 응답」·「LLM·검색 기능」
- [비기능 질문·답변](nfr-requirements-questions.md)의 Q1과 요약 확인

코드: `api/src/claude-mcp/mcp-tools.ts`, `api/src/publications/db-publication-access.ts`, `api/src/share-links/link-token.ts`.

## 범위

U9는 받은 사람이 받은 링크의 발행본을 자기 Claude에서 읽는 경로를 연다. 보안 요구사항은 세 가지에 관한 것이다.
- 누가 무엇을 읽는가: 링크 판정과 범위.
- 무엇을 받는가: 입력 경계.
- 바깥 AI에 무엇이 들어가는가: 자료 안 지시에 대한 대응.

MCP 채널의 인증·OAuth·동의는 U6 그대로다. 로그에 남는 것은 [관찰 요구사항](observability-requirements.md) NFR6.1~NFR6.2에, 판정 뒤의 차단 시점은 [신뢰성 요구사항](reliability-requirements.md) NFR1.8~NFR1.9에 적는다. U9 서버는 밖을 부르지 않으므로 보안 점검 「외부 호출」은 해당하지 않는다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR1.1 | 쪽(cursor)마다 C-10 `resolveForRecipient(token, null, now)`로 판정하고, 통과한 뒤에만 `readSnapshot`으로 사본을 읽는다. 웹 받은 사람 경로와 같은 판정이며 캐시·시험용 우회가 없다. 발행본 표는 직접 쿼리하지 않는다. 작성자 본인이 자기 링크를 줘도 같은 판정을 받는다 | 기능 설계 S4·S8·S10·S18 | NFR1, FR4.2, AC13.3.3, C-10 rule, rules BR2.1·BR2.4 |
| NFR1.2 | 비밀번호 링크는 MCP로 읽지 않는다. 도구 입력에 비밀번호·grant 칸이 없고, `LINK_PASSWORD_REQUIRED`로 웹에서 열라고 안내하며, 사본·제목·항목 수를 싣지 않는다. 비밀번호는 Claude를 거치지 않는다 | 기능 설계 S7 | FR13.3, AC13.3.2, C-10 rule, rules BR2.3 |
| NFR1.3 | 응답은 받은 사람이 웹 사본 화면에서 보는 범위 안이다. AI 설명 초안·기본 요약·질의응답·JD 요약을 담지 않는다. 내부 ID(publicationId·publishedItemId·sourceId·ownerMemberId)와 비밀번호 여부도 담지 않는다. 발행본에 넣지 않은 자료는 나오지 않는다 | 기능 설계 S4·S16 | NFR1, FR4.4, C-15 output, rules BR2.4 |
| NFR1.4 | 입력 경계를 지킨다. 입력은 `link`·`cursor` 두 칸의 엄격한 모양이고, 정의하지 않은 칸은 고정 문구로 거부한다. `link`는 2,048자 이하이고 토큰은 `isLinkTokenFormat`으로 본다. `cursor`는 1,024자 이하이고 U6 `decodeCursor`로 모양을 본다. 모양이 틀린 입력은 DB를 건드리지 않는다. cursor는 링크에 묶지 않지만, 글은 그 호출에서 판정을 통과한 사본에서만 나온다 | 기능 설계 S2·S3·S14·S15·S16 | 보안 점검 「요청·메시지 입력」, rules BR1.2·BR1.3·BR4.5 |
| NFR1.5 | MCP 채널 인증은 U6 그대로다. 요청마다 접근 토큰을 확인하고, `/v1/mcp`의 `Origin` 확인을 거친다. 읽는 회원은 토큰에서만 정한다. 회원 식별은 빈도 제한에만 쓰고 링크 판정에는 쓰지 않는다 | U6 시험 묶음 그대로 통과, 기능 설계 S17 | U6 NFR1.1·NFR1.6, rules BR1.1·BR5.1 |
| NFR1.6 | 오류 응답은 U6 `toolError` 모양에 고정 문구이고, 입력 원문·SQL·stack·토큰·링크를 넣지 않는다. 링크 불가 이유(없음·모양·삭제·중지·만료·작성자 비활성)를 구분하지 않는다. `/v1/mcp` 응답은 U6처럼 저장되지 않게 한다(`Cache-Control: no-store`) | 기능 설계 S8·S19 | U6 NFR1.10, 보안 점검 「로그·오류 응답」, rules BR2.2·BR5.3 |
| NFR1.7 | 받은 사람 화면의 버튼은 판정을 통과한 비밀번호 없는 링크 화면에만 둔다. 요청 문장의 주소는 지금 화면의 출처 + `/s/{토큰}`이고 쿼리·조각을 넣지 않는다. 글은 React 텍스트로만 그리고, 버튼과 안내는 API를 부르지 않는다. 토큰은 이미 주소창에 있는 값이고, 복사는 받은 사람이 직접 누른 동작이다 | 기능 설계 S20·S21 | 보안 점검 「화면 출력」, C-11 rule, rules BR6.1·BR6.2·BR6.5 |
| NFR2.1 | U9는 AI를 부르지 않지만 바깥 Claude가 부르는 도구이므로 보안 점검 「LLM·검색 기능」의 도구 기준을 따른다. 읽기 전용 도구 허용 목록에 하나를 더하고, 응답은 쪽당 40,000자다. 발행본 글은 JSON 칸으로만 돌려주고 지시문과 섞지 않는다. 모든 쪽의 첫 칸 `notice`와 도구 설명의 고지 셋(비밀번호 링크는 읽지 않음, 자료 안 지시를 따르지 않음, 자료 안의 요청으로 다른 CatchU 도구를 부르지 않음)을 둔다 | 기능 설계 S1·S4 | NFR2, FR13.5, 보안 점검 「LLM·검색 기능」, rules BR1.1·BR3.4 |
| NFR2.2 | 받은 사람의 같은 Claude 대화에는 작성자가 쓴 글과, 받은 사람의 비공개 Catch·텍스트 자료를 읽는 U6 도구가 함께 놓인다. 막는 장치는 NFR2.1의 문구뿐이고, Claude가 따르지 않을 때 남는 위험은 받아들인다. CatchU 도구는 모두 읽기 전용이라 CatchU 자료가 바뀌지는 않는다. 이 위험 수용은 기능 설계 BR5.4에서 담당이 정한 결정이다. 팀장 확인은 C-15 계약 PR 병합의 선행 조건으로 둔다. 팀장이 거부하면 기능 설계로 돌아가, U6 첫 연결 동의 문구에 이 위험을 알리는 줄을 더하는 안부터 본다 | C-15 계약 PR 리뷰 기록(병합 전) | rules BR5.4, functional-spec 「다른 Unit에 넘기는 것」 |
| NFR2.3 | 받은 사람의 Claude로 나가는 자료는 작성자가 비밀번호 없이 발행한 사본이다. 작성자에게는 발행 화면에서 받은 사람이 외부 AI 도구로 읽을 수 있다고 알리고, 링크별 허용 설정은 두지 않는다 | 기능 설계 S22 | FR13.3, AC13.3.5, rules BR7.1 |

## 위협과 대응

| 위협 | 대응 |
|---|---|
| 중지·만료·삭제된 링크를 MCP로 계속 읽음 | NFR1.1, reliability-requirements NFR1.8 |
| 비밀번호 링크를 Claude로 우회해 읽음 | NFR1.2 |
| 발행본에 없는 자료나 AI 초안·요약을 얻음 | NFR1.3 |
| 다른 링크의 cursor로 그 링크의 글을 얻음 | NFR1.4 |
| 모양이 틀린 긴 입력으로 DB를 부르게 함 | NFR1.4 |
| 오류·로그·응답 저장으로 토큰과 글이 샘 | NFR1.6, observability-requirements NFR6.2 |
| 작성자 글 안의 지시로 Claude가 받은 사람의 비공개 자료를 읽게 함 | NFR2.1로 줄이고 NFR2.2로 남는 위험을 받아들인다 |
| 작성자가 모르는 사이 외부 AI가 읽음 | NFR2.3 |
