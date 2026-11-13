# CR1 규칙 쪽 Catch — 엔티티

CR1은 저장 모양을 바꾸지 않는다. Catch 저장(`catch_asset`)과 결과 메시지 계약은 그대로다(계약 C5). 아래는 worker 안에서 후보 글과 재료를 만들 때 쓰는 값의 모양이다. 계약 C6·C7은 이 모양을 CR1 기능 설계가 정한다고 했다.

```yaml
entities:
  - name: RecordText
    description: 기록의 글. 작성자가 GitHub에 남긴 원문 한 줄(BR2.1~BR2.6). 후보 판정이 한 번 계산해 후보 자료의 한 칸으로 싣는다(BR2.7). 저장하지 않고 결과 메시지에도 싣지 않는다.
    attributes:
      - {name: source, type: enum, required: true, allowed: [PR_TITLE, COMMIT_FIRST_LINE]}
      - {name: text, type: string, required: true, constraints: "첫 줄바꿈 앞, 앞뒤 공백 뺌, 자르지 않음, 비어 있지 않음"}
      - {name: weak, type: boolean, required: true, description: "BR2.5의 부실 판단 결과"}
    constraints:
      - 가리기 검사에 걸린 글은 RecordText가 되지 않는다(없음).
      - 후보 하나에 RecordText는 없거나 하나다.
      - 값이 같은 후보를 합치면 첫 후보의 RecordText가 남는다(BR4.5).
    relationships:
      - {to: Candidate, cardinality: "0..1 per Candidate", direction: Candidate → RecordText}

  - name: Candidate
    description: 후보 판정이 만들고 생성 단계가 제목·초안을 채우는 Catch 후보. worker 안의 후보 자료와 결과 메시지의 Candidate가 이것이다. CR1이 바꾸는 칸만 적는다.
    attributes:
      - {name: title, type: string, required: false, description: "BR3.1~BR3.3. 기록의 글이면 길이 상한 없음, 조각 제목이면 40자 이하, 없으면 null"}
      - {name: workFacts, type: list<string>, required: true, constraints: "1줄 또는 2줄. 첫 항목은 종류 줄(BR4.1). 두 번째 항목은 recordText가 있고 weak가 거짓일 때만 있는 기록의 글 줄(BR4.2)"}
      - {name: recordText, type: RecordText, required: false, description: "worker 안의 후보 자료에만 있는 칸. 결과 메시지에 싣지 않는다"}
      - {name: groupingBasis, type: string, required: true, description: "나누기 문장이 빠진다(BR1.2)"}
      - {name: groupingLimitations, type: list<string>, required: true, description: "나누지 않은 이유 글이 빠진다(BR1.2)"}
    constraints:
      - 이슈 번호로 나눈 조각 후보는 없다(BR1.1).
      - workFacts의 어떤 항목도 생성 출력에서 오지 않는다(BR4.3).
      - CR3은 workFacts의 두 번째 항목을 위치로 지운다. 줄 구분 표식은 두지 않는다.

  - name: MaterialFile
    description: 생성 호출에 보낼 수 있는 본인 커밋의 바뀐 파일 하나.
    attributes:
      - {name: path, type: string, required: true}
      - {name: kind, type: enum, required: true, allowed: [CODE, TEST, CONFIG, DOC, OTHER], description: "BR5.1"}
      - {name: group, type: string, required: false, description: "큰 후보에서만. BR5.3~BR5.5의 묶음 이름"}
      - {name: bytes, type: integer, required: true, min: 0, description: "이 파일이 재료에서 차지한 양. 직렬화한 UTF-8 바이트로 줄 조각과 파일 머리글을 포함한다. 큰 후보에서만 6,000 이하(BR5.6)"}
    relationships:
      - {to: ChangeGroup, cardinality: "N..1 (큰 후보에서만)", direction: MaterialFile → ChangeGroup}

  - name: ChangeGroup
    description: 큰 후보의 변경 묶음.
    attributes:
      - {name: name, type: string, required: true, description: "폴더 경로, 또는 계층 구조면 파일 이름 앞부분"}
      - {name: changedLines, type: integer, required: true, min: 0, description: "묶음 순서를 정하는 바뀐 줄 수"}
      - {name: share, type: integer, required: true, min: 0, description: "재료 상한 ÷ 묶음 수. 머리글 한 벌보다 작을 수 있다(BR5.6)"}
    constraints:
      - 묶음 수 상한은 없다(Q5).
      - 작은 후보에는 묶음이 없다.

  - name: GeneratedNotice
    description: 화면의 자동 생성 안내 문장(BR6.2·BR6.3). 저장하지 않고 화면이 그 자리에서 만든다.
    attributes:
      - {name: audience, type: enum, required: true, allowed: [SEEKER, RECIPIENT]}
      - {name: hasTitle, type: boolean, required: true}
      - {name: hasDraft, type: boolean, required: true}
      - {name: text, type: string, required: false, description: "둘 다 없으면 없음"}
```

## 요약

- 저장되는 칸은 늘거나 줄지 않는다. 바뀌는 것은 `title`, `workFacts`, `groupingBasis`, `groupingLimitations`에 담기는 글이다.
- 기록의 글(RecordText)은 worker 안의 후보 자료에만 있는 칸이다. 결과 메시지에는 제목과 작업 사실 두 번째 항목으로만 나간다.
- 작업 사실은 글 목록 그대로다. 줄의 뜻은 위치로 정한다(첫 항목은 종류, 두 번째 항목은 기록의 글).
- 재료 쪽 값(MaterialFile·ChangeGroup)은 생성 요청을 만드는 동안만 있다.
- 다른 Unit이 하는 일
  - CR3: 두 번째 항목을 위치로 지우는 일만 더한다.
  - CR2: 후보 판정의 입력에 소속 목록을 더한다.
