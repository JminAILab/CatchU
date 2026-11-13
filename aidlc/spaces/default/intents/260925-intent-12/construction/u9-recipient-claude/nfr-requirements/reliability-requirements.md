# U9 받은 사람의 Claude 연결 — 신뢰성 요구사항

## Sources

작성일: 2026-11-09. 입력:
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)
- [U9 업무 규칙](../functional-design/rules.md)(rules)
- [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR1·NFR4·NFR5·NFR7·FR3.4·FR14·FR19.1
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-10 post-judgment-rule·deletion-rule
- [U6 신뢰성 요구사항](../../u6-claude-mcp/nfr-requirements/reliability-requirements.md)
- [비기능 질문·답변](nfr-requirements-questions.md)의 요약 확인

## 범위

신뢰성 요구는 네 가지를 다룬다.
- 링크가 바뀔 때 언제 막히는가.
- 의존하는 DB·Redis가 실패할 때 어떻게 되는가.
- 자료가 지워질 때 U9가 무엇을 하는가.
- 받은 사람이 실패를 어떻게 알아보는가.

가용성·복구 수치는 새로 만들지 않는다(NFR4). U9는 저장하는 자료가 없어 백업·복구 대상이 없다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR1.8 | 링크 중지·만료·삭제·작성자 비활성은 다음 쪽 호출의 재판정에서 막힌다. 첫 쪽을 읽은 뒤 링크를 중지하면, 그 cursor로 부른 다음 쪽은 `LINK_UNAVAILABLE`이다. 이것이 FR19.1 보호 흐름 「링크 중지 뒤 MCP 차단」의 U9 쪽 확인이다 | 기능 설계 S10, S23(개발 서버) | NFR1, FR19.1, AC13.3.3, rules BR2.1 |
| NFR1.9 | 판정을 통과한 호출은 그 뒤에 커밋된 중지·만료·작성자 비활성만을 이유로 취소하지 않는다. 판정 뒤 사본이 지워졌으면(`readSnapshot`의 `NotFound`) `LINK_UNAVAILABLE`이다. U9는 쓰는 것이 없어 되돌릴 저장·차감이 없다 | 기능 설계 S11 | C-10 post-judgment-rule·deletion-rule, rules BR2.5 |
| NFR4.7 | DB 실패와 작성자 회원 행 없음(`PublicationOwnerMissing`)은 `INTERNAL_ERROR`이고 로그를 남긴다. 다시 시도하지 않고, 다시 부를지는 Claude와 받은 사람이 정한다. 이름 붙은 오류만 따로 대응하고, 그 밖의 예외는 `INTERNAL_ERROR`로 바꾸며 삼키지 않는다. Redis가 없거나 오류이면 U6처럼 빈도 제한을 통과시킨다 | 기능 설계 S9·S17 | team.md Code Style, rules BR2.2·BR5.1 |
| NFR5.1 | U9는 표·파일·캐시를 두지 않는다. 작성자가 발행본을 지우거나 탈퇴하면 사본이 연쇄 삭제되어 C-10이 `LINK_UNAVAILABLE`로 막는다. 읽는 회원이 탈퇴하면 U6 토큰 확인이 막는다. 그래서 C-06 탈퇴 삭제 표에 더할 행이 없다 | 기능 설계 S8 | NFR5, FR14, C-06, entities 「범위」 |
| NFR7.1 | 받은 사람이 결과를 구분할 수 있게 한다. PDF의 읽을 수 없는 쪽은 `[n쪽] 읽을 수 없음`으로 표시하고 읽은 것처럼 채우지 않는다. Catch 글은 기록에서 확인한 내용과 작성자 설명을 다른 머리말로 나누고, AI 설명 초안은 넣지 않는다. 비밀번호 링크와 링크 불가는 서로 다른 오류와 문구로 알린다 | 기능 설계 S5·S6·S7·S8 | NFR7, FR3.4, rules BR3.1·BR3.3·BR2.2 |
| NFR7.2 | 화면에서 복사에 실패해도 받은 사람이 이어 할 수 있다. 복사가 실패하면 "복사하지 못했습니다. 아래 문장을 직접 선택해 복사해 주세요"를 보이고, 펼친 안내에는 요청 문장을 언제나 글로 보인다. "복사했습니다"는 성공일 때만 보인다 | 기능 설계 S21 | rules BR6.3 |

## 알려진 한계

- 실제 Claude에서 읽기와 중지 뒤 차단이 되는지는 U9가 `main`에 올라 개발 서버에 배포된 뒤에만 확인할 수 있다(S23). 통합 브랜치에 합칠 때는 시험 묶음(S1~S22)만 통과한 상태다.
- 판정과 사본 읽기가 두 트랜잭션이라, 그 사이에 커밋된 중지는 그 호출에 보이지 않는다. C-10 post-judgment-rule이 허용하는 범위다.

## 채택하지 않은 것

- **DB 실패 때 서버가 다시 시도:** 읽기 전용 도구이므로 다시 부르는 것은 호출하는 쪽이 정한다. U6과 같다.
- **판정과 사본 읽기를 한 트랜잭션으로 묶기:** C-10이 소비 Unit에 요구하지 않는다. 묶으려면 `PublicationAccess` 계약 밖의 `DbPublicationAccess` 내부 함수에 기대야 한다.
