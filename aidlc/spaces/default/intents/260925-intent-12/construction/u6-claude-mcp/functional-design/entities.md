# U6 Claude MCP 본인 연결 — 엔티티

## Sources

작성일: 2026-10-31. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U6, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map)의 US13.1·US13.2, [사용자 스토리](../../../inception/user-stories/stories.md)(stories)의 US13.1·US13.2, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR13.1·FR13.2·FR14.1·FR14.6·FR14.8, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 ClaudeMcp 엔티티, [결정 기록](../../../inception/domain-design/decisions.md)의 ADR-009, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-13·C-14·C-15, [기능 설계 질문·답변](functional-design-questions.md) Q1~Q6, [업무 규칙](rules.md), [기능 명세](functional-spec.md).

## 범위

U6이 소유하는 표는 `mcp_client`, `mcp_connection`, `mcp_authorization_code`, `mcp_access_token` 넷이다(C-15 tables, ADR-009, components ClaudeMcp). 표 이름과 `member_id` 칸은 이미 U2 탈퇴 코드(`api/src/withdrawal/withdrawal.service.ts`)가 이름으로 부르므로 그대로 쓴다(BR7.4). components의 네 엔티티에 이 설계가 더한 칸은 `McpClient.approvedAt`(BR2.4)과 승인 코드의 `codeChallenge`·`redirectUri`·`resource`·`consentedAt`(BR3.7, BR4.3)이다. 승인·상태·해제 API와 이 칸들은 U6 안 세부라 계약 문서에 넣지 않는다(contract-summary 「Unit 안 세부」).

승인 대기 표는 두지 않는다. 승인 화면에 필요한 값은 `/authorize`에서 web으로 쿼리로 넘기고, 승인 요청 때 api가 다시 확인한다(BR3.1, BR3.2). Redis의 빈도 집계 키는 표가 아니며 BR6.4에 적는다.

```yaml
entities:
  # ---- 저장하는 엔티티(U6 소유) ----
  - name: McpClient
    table: mcp_client
    description: Claude가 등록한 OAuth 클라이언트 하나. 회원을 가리키지 않고 비밀값이 없는 공개 클라이언트다(C-15 tables, ADR-009, BR2.1)
    identifier: mcpClientId
    attributes:
      - { name: mcpClientId, type: string, required: true, unique: true, constraints: "기본 키. OAuth client_id" }
      - { name: clientName, type: string, required: false, default: null, constraints: "최대 200자, 넘으면 등록 거부(BR2.3). 클라이언트가 스스로 적은 값이라 화면에 보이지 않는다(BR3.5)" }
      - { name: redirectUris, type: list<string>, required: true, constraints: "1개 이상. 항목마다 허용 목록과 정확히 일치(BR2.2)" }
      - { name: registeredAt, type: timestamp-with-zone, required: true, constraints: "등록 시각" }
      - { name: approvedAt, type: timestamp-with-zone, required: false, default: null, constraints: "승인 버튼으로 코드를 처음 만들 때 한 번 채운다(BR3.7). 비어 있고 등록한 지 7일이 지나면 정리 대상(BR2.4)" }
    entity_constraints:
      - "비밀값 칸이 없다(BR2.1)"
      - "회원 참조가 없어 회원 탈퇴를 따라 지워지지 않는다(C-06 「클라이언트 등록 제외」)"
    relationships:
      - { to: McpConnection, cardinality: "1:N", direction: "McpConnection → McpClient", owned_by: McpClient, note: "등록 삭제 때 연쇄 삭제. 지우는 행은 승인에 쓰인 적 없어 자식이 없다(BR2.4)" }
      - { to: McpAuthorizationCode, cardinality: "1:N", direction: "McpAuthorizationCode → McpClient", owned_by: McpClient, note: "등록 삭제 때 연쇄 삭제" }

  - name: McpConnection
    table: mcp_connection
    description: 한 회원과 한 클라이언트의 연결 기록. 동의 시각과 만료를 갖는다. 그 회원의 행이 하나라도 있으면 동의한 것이다(BR3.3)
    identifier: connectionId
    attributes:
      - { name: connectionId, type: uuid, required: true, unique: true, constraints: "기본 키" }
      - { name: memberId, type: uuid, required: true, references: "MemberAccount.memberId (ON DELETE CASCADE)", constraints: "칸 이름 member_id 고정(BR7.4)" }
      - { name: mcpClientId, type: string, required: true, references: "McpClient.mcpClientId (ON DELETE CASCADE)" }
      - { name: consentedAt, type: timestamp-with-zone, required: true, constraints: "승인 코드의 consentedAt을 옮겨 쓴다(BR4.3)" }
      - { name: expiresAt, type: timestamp-with-zone, required: true, constraints: "접근 토큰 만료와 같은 값을 같은 트랜잭션에 쓴다. 접근 판정은 토큰의 만료로 한다(BR4.7)" }
    entity_constraints:
      - "unique (memberId, mcpClientId). 접근 토큰의 복합 외래 키가 가리키는 짝이다(C-06)"
    relationships:
      - { to: MemberAccount, cardinality: "N:1", direction: "McpConnection → MemberAccount", owned_by: MemberAccount, note: "회원 탈퇴 때 연쇄 삭제(C-06)" }
      - { to: McpClient, cardinality: "N:1", direction: "McpConnection → McpClient", owned_by: McpClient, note: "연쇄 삭제" }
      - { to: McpAccessToken, cardinality: "1:0..1", direction: "McpAccessToken → McpConnection", owned_by: McpConnection, note: "연결을 지우면 토큰도 지워진다" }

  - name: McpAuthorizationCode
    table: mcp_authorization_code
    description: 승인 코드 하나. 원문은 저장하지 않고 5분·한 번만 쓴다(BR4.1)
    identifier: codeHash
    attributes:
      - { name: codeHash, type: string, required: true, unique: true, constraints: "기본 키. 코드 원문의 SHA-256" }
      - { name: memberId, type: uuid, required: true, references: "MemberAccount.memberId (ON DELETE CASCADE)", constraints: "칸 이름 member_id 고정(BR7.4)" }
      - { name: mcpClientId, type: string, required: true, references: "McpClient.mcpClientId (ON DELETE CASCADE)" }
      - { name: codeChallenge, type: string, required: true, constraints: "PKCE S256 값(BR3.1, BR4.3)" }
      - { name: redirectUri, type: string, required: true, constraints: "승인 때 확인한 돌아갈 주소. 토큰 교환 때 정확히 같아야 한다(BR4.3)" }
      - { name: resource, type: string, required: false, default: null, constraints: "요청에 있으면 MCP 주소와 같다고 확인한 값(BR4.6)" }
      - { name: consentedAt, type: timestamp-with-zone, required: true, constraints: "그 회원의 기존 동의 시각, 없으면 이번 동의 시각(BR3.7)" }
      - { name: expiresAt, type: timestamp-with-zone, required: true, constraints: "만든 시각 + 5분" }
      - { name: usedAt, type: timestamp-with-zone, required: false, default: null, constraints: "토큰 교환에 쓴 시각. 비어 있어야 쓸 수 있다" }
    entity_constraints:
      - "전체 해제는 usedAt이 빈 행만 지운다(C-15 disconnect, BR7.2). 쓴 행은 다시 토큰으로 바꿀 수 없다"
    relationships:
      - { to: MemberAccount, cardinality: "N:1", direction: "McpAuthorizationCode → MemberAccount", owned_by: MemberAccount, note: "회원 탈퇴 때 연쇄 삭제(C-06)" }
      - { to: McpClient, cardinality: "N:1", direction: "McpAuthorizationCode → McpClient", owned_by: McpClient, note: "연쇄 삭제" }

  - name: McpAccessToken
    table: mcp_access_token
    description: 접근 토큰 하나. 불투명 난수이고 원문은 저장하지 않는다(BR4.2)
    identifier: tokenHash
    attributes:
      - { name: tokenHash, type: string, required: true, unique: true, constraints: "기본 키. 토큰 원문의 SHA-256" }
      - { name: memberId, type: uuid, required: true, references: "MemberAccount.memberId (ON DELETE CASCADE)", constraints: "칸 이름 member_id 고정(BR7.4)" }
      - { name: mcpClientId, type: string, required: true, references: "(memberId, mcpClientId) → McpConnection(memberId, mcpClientId) ON DELETE CASCADE", constraints: "복합 외래 키로 그 회원의 연결에만 달린다(C-06)" }
      - { name: expiresAt, type: timestamp-with-zone, required: true, constraints: "발급 시각 + 토큰 수명(기본 7일, BR4.2)" }
    entity_constraints:
      - "unique (memberId, mcpClientId). 같은 회원·클라이언트의 토큰은 교체한다(BR4.4)"
    relationships:
      - { to: MemberAccount, cardinality: "N:1", direction: "McpAccessToken → MemberAccount", owned_by: MemberAccount, note: "회원 탈퇴 때 연쇄 삭제(C-06)" }
      - { to: McpConnection, cardinality: "0..1:1", direction: "McpAccessToken → McpConnection", owned_by: McpConnection, note: "복합 외래 키, 연쇄 삭제" }

  # ---- 읽기만 하는 엔티티 ----
  - name: MemberAccount
    description: 회원. U6은 memberId와 accountState만 읽고, 접근은 ACTIVE일 때만 허용한다(BR4.7)
    owner: 기존 회원 표(MemberAccount 컴포넌트)
  - name: CatchAsset
    description: 본인 Catch. U6은 catch_id, owner_id, title, work_facts, subject_contribution, visibility, mismatch, author_description을 읽고 draft_content는 읽지 않는다(C-14)
    owner: 기존 Catches 컴포넌트, 설명 칸은 u4-publication-link
  - name: CatchEvidence
    description: Catch의 근거. U6은 catch_id, source_url을 읽는다(C-14)
    owner: 기존 Catches 컴포넌트
  - name: TextMaterial
    description: 텍스트 자료. U6은 member_id로만 걸러 읽는다(C-13)
    owner: u4-publication-link
```

## 행이 지워지는 때

| 표 | 지워지는 때 |
|---|---|
| `mcp_client` | 승인에 쓰인 적 없고 등록한 지 7일이 지난 행을, 다음 등록 요청 때(BR2.4). 승인에 쓰인 행은 남는다 |
| `mcp_connection` | 전체 해제, 탈퇴, 그 회원의 다음 토큰 교환 때 만료된 행(BR7.2, BR7.4, BR4.4) |
| `mcp_authorization_code` | 전체 해제(쓰지 않은 행만), 탈퇴, 그 회원의 다음 토큰 교환 때 만료된 행(BR7.2, BR7.4, BR4.4) |
| `mcp_access_token` | 전체 해제, 탈퇴, 같은 회원·클라이언트의 새 토큰으로 교체, 그 회원의 다음 토큰 교환 때 만료된 행(BR7.2, BR7.4, BR4.4) |

새 외래 키는 모두 연쇄 삭제다(C-06). 같은 PR에서 `api/docs/member-withdrawal-deletion.md`에 `mcp_connection`(회원, 클라이언트 등록), `mcp_authorization_code`(회원, 클라이언트 등록), `mcp_access_token`(회원, 연결) 행을 더하고 `test/db/member-cascade-delete.test.cjs`의 `MEMBER_ROWS`에 넣는다.
