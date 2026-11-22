# Entities — u1-preset-contract

근거: 단위 `inception/units-generation/unit-of-work.md`(U1)와 `unit-of-work-story-map.md`, 요구사항 `inception/requirements-analysis/requirements.md`, 구성 요소 `inception/domain-design/components.md`(PresetLibrary·PublishableSource·SnapshotContract·Publications)와 `decisions.md`, 계약 `inception/contract-design/contract-summary.md`(P-1·P-3·P-6), 이 단계 질문 `functional-design-questions.md`(Q1~Q4).

이 단위가 새로 만드는 엔티티는 Preset·PresetItem이고, 바꾸는 엔티티는 PublishedItem(칸 둘)이다. 화면에 내주는 모양(PresetSummary·PresetDetail·ItemMeasure)은 저장하지 않고 읽을 때 만든다(ADR-005).

```yaml
entities:
  - name: Preset
    description: 지원자 한 명이 만든 발행용 자료 묶음. 발행 때 탭 하나가 된다
    attributes:
      - { name: presetId, type: uuid, required: true, unique: true }
      - { name: memberId, type: uuid, required: true, references: Member, on_delete: cascade }
      - { name: name, type: text, required: true, constraints: "앞뒤 공백을 뺀 값을 저장. 1~50자(코드 포인트). 같은 회원 안에서 같은 이름 허용" }
      - { name: createdAt, type: timestamp, required: true }
      - { name: updatedAt, type: timestamp, required: true, constraints: "만들 때 createdAt과 같고, 고칠 때마다 새로 씀" }
    constraints:
      - "회원 한 명당 50개까지(BR1.3). DB 제약으로 막지 않고 만들 때 센다"
    relationships:
      - { to: Member, cardinality: "N:1", direction: "Preset → Member" }
      - { to: PresetItem, cardinality: "1:N(0~20)", direction: "Preset → PresetItem" }

  - name: PresetItem
    description: 프리셋에 담긴 자료 하나와 그 자리
    attributes:
      - { name: presetItemId, type: uuid, required: true, unique: true }
      - { name: presetId, type: uuid, required: true, references: Preset, on_delete: cascade }
      - { name: position, type: integer, required: true, min: 1, max: 20, constraints: "프리셋 안에서 1부터 빈틈없이. (presetId, position) 유일" }
      - { name: catchId, type: uuid, required: false, references: CatchAsset, on_delete: cascade }
      - { name: textMaterialId, type: uuid, required: false, references: TextMaterial, on_delete: cascade }
      - { name: pdfMaterialId, type: uuid, required: false, references: PdfMaterial, on_delete: cascade }
    constraints:
      - "catchId·textMaterialId·pdfMaterialId 가운데 정확히 하나만 채움"
      - "한 프리셋 안에서 같은 자료는 한 번: (presetId, catchId)·(presetId, textMaterialId)·(presetId, pdfMaterialId) 각각 유일(채운 칸만)"
      - "가리키는 자료는 프리셋 주인과 같은 회원의 것(저장 때 확인, BR1.5). 외래 키로 막지 않는다"
    relationships:
      - { to: Preset, cardinality: "N:1", direction: "PresetItem → Preset" }
      - { to: CatchAsset, cardinality: "N:0..1", direction: "PresetItem → CatchAsset" }
      - { to: TextMaterial, cardinality: "N:0..1", direction: "PresetItem → TextMaterial" }
      - { to: PdfMaterial, cardinality: "N:0..1", direction: "PresetItem → PdfMaterial" }

  - name: PublishedItem
    description: 발행본 사본의 항목 하나(지금 있는 엔티티, 칸 둘을 더함)
    attributes:
      - { name: position, type: integer, required: true, min: 1, constraints: "발행본 전체에 1부터 이어 매김. 순서는 고른 프리셋 순서, 그 안에서 프리셋 안 자료 순서(FR6.1)" }
      - { name: presetOrdinal, type: integer, required: true, min: 1, max: 5, constraints: "새 칸. 고른 프리셋 순서" }
      - { name: presetName, type: text, required: true, constraints: "새 칸. 발행 당시 프리셋 이름의 복사. 같은 발행본에서 같은 presetOrdinal이면 같은 값" }
      - { name: itemKind, type: enum, required: true, allowed: [CATCH, TEXT_MATERIAL, PDF_MATERIAL] }
      - { name: sourceId, type: uuid, required: true, constraints: "지금처럼 외래 키 없음. 응답에 싣지 않음" }
    constraints:
      - "position은 발행본 안에서 유일(지금 그대로)"
      - "같은 (itemKind, sourceId)가 여러 항목에 있을 수 있다(프리셋마다 사본, FR2.7)"

  - name: PresetSummary
    description: 프리셋 목록 응답의 한 줄(저장하지 않음, 읽을 때 셈)
    attributes:
      - { name: presetId, type: uuid, required: true }
      - { name: name, type: text, required: true }
      - { name: itemCount, type: integer, required: true, min: 0, max: 20 }
      - { name: textLength, type: integer, required: true, min: 0, constraints: "발행과 같은 셈의 합(BR2.1)" }
      - { name: overLimit, type: boolean, required: true, constraints: "textLength > 60,000" }
      - { name: unpublishableCount, type: integer, required: true, min: 0 }
      - { name: unpublishableItems, type: "list of { kind, sourceId, title, reason }", required: true, constraints: "발행 화면이 「발행할 수 없는 자료가 있습니다: (자료 이름)」을 보이려고 싣는다. reason은 ItemMeasure와 같은 값" }

  - name: PresetDetail
    description: 프리셋 하나(편집 화면)
    attributes:
      - { name: presetId, type: uuid, required: true }
      - { name: name, type: text, required: true }
      - { name: items, type: "list of ItemMeasure + title", required: true, constraints: "position 순서" }

  - name: ItemMeasure
    description: 자료 하나를 센 값(세기 경로와 프리셋 상세가 함께 씀, Q1)
    attributes:
      - { name: kind, type: enum, required: true, allowed: [CATCH, TEXT_MATERIAL, PDF_MATERIAL] }
      - { name: sourceId, type: uuid, required: true }
      - { name: title, type: text, required: true }
      - { name: textLength, type: integer, required: true, min: 0, constraints: "추출이 끝나지 않은 PDF는 0" }
      - { name: unpublishableReason, type: enum, required: false, allowed: [CONFIRMATION_REQUIRED, SOURCE_RESTRICTED, PRIVATE, EXTRACTION_INCOMPLETE], default: null }
```

## 요약

- **Preset**은 회원에 묶이고(탈퇴 때 연쇄 삭제), 이름과 시각만 가진다. 항목 수·글자 수·발행할 수 없는 자료는 저장하지 않는다(ADR-005).
- **PresetItem**은 종류별 외래 키 칸 셋 가운데 하나로 원본을 가리키고, 원본(Catch·텍스트 자료·PDF)을 지우면 함께 지워진다(ADR-004, P-6).
- **PublishedItem**에 presetOrdinal·presetName이 더해지고, position은 발행본 전체에 이어 매긴다(ADR-003, P-3).
- **PresetSummary·PresetDetail·ItemMeasure**는 응답 모양이다. 글자 수와 이유는 발행과 같은 규칙(PublishableSource)으로 읽을 때 센다.
