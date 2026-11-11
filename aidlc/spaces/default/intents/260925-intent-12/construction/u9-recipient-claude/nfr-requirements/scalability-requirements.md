# U9 받은 사람의 Claude 연결 — 규모 요구사항

## Sources

작성일: 2026-11-09. 입력:
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)
- [U9 업무 규칙](../functional-design/rules.md)(rules)
- [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·FR13.6
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-15 common-errors
- [U6 규모 요구사항](../../u6-claude-mcp/nfr-requirements/scalability-requirements.md)
- [비기능 질문·답변](nfr-requirements-questions.md)의 요약 확인

## 범위

U9는 시연 규모다. 동시 사용자·처리량·자료 증가 목표는 새로 만들지 않는다(NFR4). U9는 저장하는 자료가 없으므로 자료 증가 계획도 없다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.5 | 빈도 제한은 U6의 회원당 1분 60회를 쓰고, `list_my_catches`·`list_my_text_materials`·`read_shared_publication` 세 도구가 함께 센다. 쪽 하나가 호출 한 번이다. 큐 연결(Redis)이 있을 때, 넘으면 `RATE_LIMITED`이고 DB를 읽지 않는다. 큐 연결이 없거나 오류인 상태는 「알려진 한계」로 둔다 | 기능 설계 S17(큐 연결이 있을 때). S23 개발 서버 확인 때 큐 연결 여부를 함께 적는다 | FR13.6, C-15 RATE_LIMITED, rules BR5.1 |
| NFR4.6 | 서버는 상태를 두지 않는다. U6처럼 요청마다 새 MCP 서버·전송 객체를 만들고 세션이 없으며, cursor는 응답에 담긴다. 그래서 api가 여러 개여도 같은 결과다 | 기능 설계 S1·S12 | U6 BR5.6, rules BR1.1·BR4.4 |

## 채택하지 않은 것

- **받은 링크 읽기만 따로 세는 한도:** 세 도구가 한 회원의 같은 Claude 연결에서 나오므로 함께 센다(rules BR5.1).
- **링크별·발행본별 한도:** 웹 받은 사람 열람에도 링크별 한도가 없다. 요구사항에도 근거가 없다.

## 알려진 한계

- U6처럼 큐 주소(Redis)가 없거나 오류이면 빈도 제한이 꺼진다. 개발 서버와 EKS에 큐 연결을 켜기 전까지는 받은 링크 읽기에도 빈도 제한이 없다. NFR4.5의 확인은 큐 연결이 있을 때만 해당하고, S23 때 개발 서버의 큐 연결 여부를 확인 표에 함께 적는다([관찰 요구사항](observability-requirements.md) NFR6.3).
- 쪽마다 사본 전체를 다시 읽으므로, 긴 발행본을 여러 사람이 동시에 끝까지 읽으면 DB 일이 쪽 수만큼 는다([성능 요구사항](performance-requirements.md) NFR4.3).
