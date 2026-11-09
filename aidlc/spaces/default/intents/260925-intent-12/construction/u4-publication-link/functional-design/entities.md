# U4 발행·링크 — 엔티티

## Sources

작성일: 2026-10-27. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U4, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map), [사용자 스토리](../../../inception/user-stories/stories.md)(stories)의 US1.4·US2.1~US2.3·US3.1·US4.1·US4.3·US4.4·US5.1·US5.2, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR1.4·FR1.5·FR2·FR3.1·FR3.2·FR3.6·FR4·FR5·NFR1·NFR5·NFR7, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 Catches·Materials·Publication, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02~C-14·C-17, [기능 설계 질문·답변](functional-design-questions.md) Q1·Q2·Q5~Q9(Q3·Q4는 Q7·Q8이 대체). 10월 기준: `api/src/catches`·`api/src/share-links`·`api/src/recipient`.

## 범위

U4가 쓰는 저장 엔티티는 계약이 이미 모양을 고정한 네 가지다: `text_material`(C-13), `catch_asset`의 작성자 설명 칸(C-14), `publication`·`published_item`(C-07). 이름·자료형·제약은 계약 그대로이며 이 문서는 그것을 옮기고 U4 안에서만 쓰는 검증 값(Q5)과 값 객체를 더한다. 계약과 다른 칸을 더하지 않는다. 자료형·DB 제약은 계약 표기(`jsonb`, `varchar` + `CHECK IN`, `CHECK (position >= 1)` 등)를 그대로 쓰고, 길이·개수 상한은 DB 제약이 아니라 API 검증이다. `published_pdf_page`는 U8이 만들고(C-07), `publication_index`·`published_chunk`는 U3, `base_summary`는 U5, `jd_summary_run`은 U10 소유라 여기서는 참조만 적는다. 10월 `share_link` 표는 그대로 두며 정리는 담당 확인 필요다(Q8).

글자 수는 두 가지로 센다.

- **검증 길이**(Q5 상한): 유니코드 코드 포인트 수. 10월 링크 제목 검증과 같고 DB `char_length`와 같다.
- **위치**(C-07 char-offset): UTF-16 코드 단위. U3이 조각 위치에 쓰며 U4는 사본 문자열을 가공하지 않고 넘긴다.

```yaml
entities:
  - name: TextMaterial
    table: text_material
    owner: U4 (Materials 텍스트 부분), 계약 C-13
    description: 작성자의 텍스트 자료 한 벌. 자기소개서·이력서·강점 문장 등 종류 구분 없음
    attributes:
      - { name: textMaterialId, column: text_material_id, type: uuid, required: true, unique: true, constraints: "PK" }
      - { name: memberId, column: member_id, type: uuid, required: true, references: "member_account.member_id ON DELETE CASCADE" }
      - { name: title, column: title, type: text, required: true, min: 1, max: 100, constraints: "DB는 char_length >= 1(C-13). 100자 상한은 API 검증(Q5 초기 설계값). 앞뒤 공백 제거 후 센다" }
      - { name: body, column: body, type: text, required: true, min: 1, max: 20000, constraints: "API 검증(Q5 초기 설계값). 공백·줄바꿈 가공 없이 저장. 주소를 적을 수 있음" }
      - { name: createdAt, column: created_at, type: timestamptz, required: true }
      - { name: updatedAt, column: updated_at, type: timestamptz, required: true, constraints: "저장마다 갱신. 마지막 저장이 남음, 충돌 감지 없음" }
    relationships:
      - { to: MemberAccount, cardinality: "N:1", direction: "TextMaterial → MemberAccount" }

  - name: CatchAuthorDescription
    table: catch_asset (칸 추가)
    owner: U4 (Catches 작성자 설명 부분), 계약 C-14
    description: 10월 Catch에 더하는 작성자 설명 두 칸. Catch 하나에 설명 하나
    attributes:
      - { name: authorDescription, column: author_description, type: text, required: false, default: null, max: 4000, constraints: "API 검증 0~4,000자(Q5 초기 설계값). 앞뒤 공백만 있으면 NULL로 저장(설명 지움)" }
      - { name: authorDescriptionUpdatedAt, column: author_description_updated_at, type: timestamptz, required: false, default: null, constraints: "CHECK (author_description IS NULL) = (author_description_updated_at IS NULL)" }
    existing-columns-read: [catch_id, owner_id, title, work_facts, subject_contribution, draft_status, draft_content, mismatch, visibility, work_facts_confirmed, contribution_confirmed, source_request_id]
    notes: "재분석은 (owner_id, work_identity)로 기존 행을 찾아 쓰므로 새 칸은 건드려지지 않는다(10월 registration-service)"

  - name: Publication
    table: publication
    owner: U4 (Publication), 계약 C-07
    description: 고정 발행본과 그 링크 하나
    attributes:
      - { name: publicationId, column: publication_id, type: uuid, required: true, unique: true, constraints: "PK" }
      - { name: memberId, column: member_id, type: uuid, required: true, references: "member_account.member_id ON DELETE CASCADE" }
      - { name: title, column: title, type: text, required: true, min: 1, max: 50, constraints: "DB char_length >= 1. 50자는 API 검증(10월 링크 제목 그대로). 앞뒤 공백 제거" }
      - { name: linkTokenReference, column: link_token_reference, type: text, required: true, unique: true, constraints: "256비트 난수 base64url(10월 link-token). 링크 주소 밖 응답·로그·오류에 싣지 않음" }
      - { name: passwordProtectionReference, column: password_protection_reference, type: text, required: false, default: null, constraints: "10월 scrypt 검증값. 비밀번호 원문은 8~64자(10월). 발행 뒤 변경 없음" }
      - { name: publishedAt, column: published_at, type: timestamptz, required: true }
      - { name: expiresAt, column: expires_at, type: timestamptz, required: true, constraints: "CHECK expires_at = published_at + 2160시간(90일)" }
      - { name: stoppedAt, column: stopped_at, type: timestamptz, required: false, default: null, constraints: "CHECK stopped_at IS NULL OR stopped_at >= published_at. 한 번 기록되면 바뀌지 않음" }
    derived:
      - { name: state, type: enum, allowed: [ACTIVE, STOPPED, EXPIRED], rule: "stoppedAt 있으면 STOPPED(만료보다 우선), 없고 now >= expiresAt이면 EXPIRED, 아니면 ACTIVE. 저장하지 않음" }
    relationships:
      - { to: MemberAccount, cardinality: "N:1", direction: "Publication → MemberAccount" }
      - { to: PublishedItem, cardinality: "1:N(API 검증 1~20)", direction: "PublishedItem → Publication" }

  - name: PublishedItem
    table: published_item
    owner: U4 (Publication), 계약 C-07
    description: 발행본에 고정한 항목 하나(Catch·텍스트 자료 사본)
    attributes:
      - { name: publishedItemId, column: published_item_id, type: uuid, required: true, unique: true, constraints: "PK" }
      - { name: publicationId, column: publication_id, type: uuid, required: true, references: "publication ON DELETE CASCADE" }
      - { name: position, column: position, type: integer, required: true, min: 1, constraints: "DB는 CHECK (position >= 1)뿐(C-07). 작성자가 고른 순서 1..n, unique(publication_id, position). 20개 상한은 API 검증이며 DB 제약이 아니다(Q5)" }
      - { name: itemKind, column: item_kind, type: varchar, required: true, allowed: [CATCH, TEXT_MATERIAL, PDF_MATERIAL], constraints: "CHECK IN ('CATCH','TEXT_MATERIAL','PDF_MATERIAL')(C-07). DB enum 형은 쓰지 않는다. U4는 CATCH·TEXT_MATERIAL만 만든다. PDF_MATERIAL은 U8" }
      - { name: sourceId, column: source_id, type: uuid, required: true, constraints: "원본 catch_id 또는 text_material_id. 외래 키 없음(사본)" }
      - { name: title, column: title, type: text, required: true, constraints: "Catch 제목(NULL이면 '제목 없는 Catch', 10월 화면 표기) 또는 텍스트 자료 제목" }
      - { name: snapshot, column: snapshot, type: jsonb, required: true, constraints: "C-07 그대로 jsonb. 아래 CatchSnapshot 또는 TextMaterialSnapshot" }
      - { name: pdfCopyKey, column: pdf_copy_key, type: text, required: false, default: null, constraints: "CHECK (item_kind = 'PDF_MATERIAL') = (pdf_copy_key IS NOT NULL). U4 항목은 NULL" }
    entity-constraints:
      - "unique(publication_id, position)"
      - "unique(publication_id, published_item_id) — published_chunk 복합 외래 키의 부모 짝(C-06)"
    relationships:
      - { to: Publication, cardinality: "N:1", direction: "PublishedItem → Publication" }

  - name: CatchSnapshot
    kind: value-object (published_item.snapshot, item_kind = CATCH)
    description: 발행 순간 Catch 원본에서 복사한 내용(C-07 snapshot-shape)
    attributes:
      - { name: workFacts, type: list<string>, required: true, source: "catch_asset.work_facts 순서 그대로" }
      - { name: subjectContribution, type: string, required: true, source: "catch_asset.subject_contribution" }
      - { name: evidence, type: "list<{sourceUrl, sourceRevision, representedFacts: list<string>}>", required: true, source: "catch_evidence를 position 오름차순으로" }
      - { name: authorDescription, type: string, required: false, default: null, source: "catch_asset.author_description" }
      - { name: aiDraft, type: string, required: false, default: null, source: "draft_status = GENERATED일 때 draft_content, 아니면 null. 화면 표시용, 조각·검색·합산 대상 아님" }
      - { name: mismatch, type: boolean, required: true, source: "catch_asset.mismatch" }

  - name: TextMaterialSnapshot
    kind: value-object (published_item.snapshot, item_kind = TEXT_MATERIAL)
    attributes:
      - { name: body, type: string, required: true, source: "text_material.body 그대로" }

  - name: PublishCommand
    kind: value-object (작성자 요청, 저장 안 함)
    attributes:
      - { name: title, type: string, required: true, min: 1, max: 50 }
      - { name: password, type: string, required: false, min: 8, max: 64, constraints: "없으면 비밀번호 없는 링크" }
      - { name: items, type: "list<{kind: CATCH | TEXT_MATERIAL, sourceId: uuid}>", required: true, min: 1, max: 20, constraints: "같은 (kind, sourceId) 중복 불가. 배열 순서가 position" }

  - name: SnapshotTextTotal
    kind: derived value (발행 크기 판정)
    description: 발행본 전체 글 상한(Q5, 60,000자 임시값)의 합산 대상
    rule: "조각 나누기 대상 필드(C-07 fieldPath)의 검증 길이 합: CATCH의 workFacts[i]·subjectContribution·evidence[i].representedFacts[j]·authorDescription, TEXT_MATERIAL의 body. 제목·aiDraft·sourceUrl·sourceRevision·mismatch는 넣지 않는다(C-09 publicationText와 같은 범위)"

  - name: RecipientAccess
    kind: value-object (C-10 반환)
    attributes:
      - { name: publicationId, type: uuid, required: true }
      - { name: ownerMemberId, type: uuid, required: true }
      - { name: passwordProtected, type: boolean, required: true }
      - { name: expiresAt, type: timestamptz, required: true }

  - name: OwnerAccess
    kind: value-object (C-10 반환)
    attributes:
      - { name: publicationId, type: uuid, required: true }
      - { name: state, type: enum, required: true, allowed: [ACTIVE, STOPPED, EXPIRED] }

  - name: PublishedSnapshot
    kind: value-object (C-10 readSnapshot 반환, 받은 사람 열람 응답 C-12)
    attributes:
      - { name: title, type: string, required: true }
      - { name: publishedAt, type: timestamptz, required: true }
      - { name: expiresAt, type: timestamptz, required: true }
      - { name: items, type: "list<{publishedItemId, position, itemKind, title, snapshot, pdfPages: list<{pageNumber, text, readable}> | null}>", required: true, constraints: "position 오름차순. U4 항목의 pdfPages는 null" }

  - name: LinkGrant
    kind: value-object (저장 안 함)
    description: 비밀번호 통과 증표. 10월 서명 방식(`LINK_GRANT_SECRET`, HMAC)에서 링크 ID 자리를 publicationId로 바꾼다
    attributes:
      - { name: publicationId, type: uuid, required: true }
      - { name: expiresAt, type: timestamptz, required: true, constraints: "발급 + 2시간, 링크 만료 시각을 넘지 않음" }
```

## 다른 Unit 소유 참조

| 표 | 주인 | U4와의 관계 |
|---|---|---|
| `published_pdf_page` | U8 | `published_item` 연쇄 삭제. U4 항목에는 없다 |
| `publication_index`, `published_chunk` | U3 | 발행 트랜잭션 안에서 U3이 쓴다(C-08). 발행본 연쇄 삭제 |
| `base_summary` | U5 | 발행본 연쇄 삭제 |
| `jd_summary_run` | U10 | 발행본 연쇄 삭제 |
| `daily_execution_count`, `ai_consent` | U2 | 발행 때 C-03·C-04로만 부른다 |
| `share_link` | 10월(정리 담당 확인 필요, Q8) | 새 흐름은 쓰지 않는다. 표는 그대로 둔다 |

## 요약

U4는 새 표 셋(`text_material`·`publication`·`published_item`)과 `catch_asset` 두 칸을 소유한다. 모두 계약 C-07·C-13·C-14 모양 그대로이며 회원 연쇄 삭제(C-06)를 따른다. 발행본 상태는 저장하지 않고 `stopped_at`·`expires_at`과 현재 시각으로 구한다. 사본(`snapshot`)은 원본과 외래 키 없이 발행본 수명을 따른다. 길이 상한은 U4 제안 초기 설계값이며 전체 글 상한 60,000자는 AI 입력 한도 확인 뒤 조정한다(Q5, 검증된 값 아님).
