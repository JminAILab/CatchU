# CR3 AI 쪽 — 엔티티

CR3은 저장 모양과 결과 메시지 계약을 바꾸지 않는다(계약 C5). 설명 초안 상태는 지금 값(`GENERATED`·`FAILED`·`NOT_GENERATED`)을 쓰고, 실패 코드는 계약에서 자유 문자열이라 새 코드를 더해도 계약은 그대로다. 아래는 worker 안에서 판정을 묻고 답을 적용할 때 쓰는 값의 모양이다. CR1의 RecordText·Candidate·MaterialFile·ChangeGroup은 CR1 `entities.md`를 따르고, 여기서는 CR3이 더하는 것만 적는다.

```yaml
entities:
  - name: AiSide
    description: AI 쪽이 켜졌는지. 분석 시도마다 LIVE 조립이 설정에서 한 번 정한다(BR1.1~BR1.3). 결과 메시지에 싣지 않는다.
    attributes:
      - {name: provider, type: enum, required: true, allowed: [OPENAI, CLAUDE], default: OPENAI, description: "CATCHU_JUDGEMENT_PROVIDER"}
      - {name: enabled, type: boolean, required: true, description: "OPENAI면 CATCHU_JUDGEMENT_API_KEY가 있을 때, CLAUDE면 CATCHU_GENERATION_API_KEY가 있을 때 참"}
    constraints:
      - 따로 끄는 스위치는 없다(Q4 A).
      - 키 값은 화면·로그·결과 메시지·Git에 남지 않는다(NFR5).

  - name: TitleCandidate
    description: AI 쪽이 켜졌을 때 Claude가 생성 응답에 쓰는 제목 후보(BR3.1).
    attributes:
      - {name: id, type: string, required: true, description: "응답 안 순서로 t1~t3"}
      - {name: text, type: string, required: true, constraints: "1~40자, 앞뒤 공백 뺌"}
      - {name: lines, type: list<LineRef>, required: true, min: 1, description: "근거로 삼은 줄"}
      - {name: passed, type: boolean, required: true, description: "기계 대조(BR3.3) 통과 여부"}
    constraints:
      - 응답 하나에 0~3개. 40자를 넘는 후보는 버린다(Q3 A).

  - name: DraftSentence
    description: AI 쪽이 켜졌을 때 Claude가 쓰는 설명 문장(BR5.1).
    attributes:
      - {name: id, type: string, required: true, description: "응답 안 순서로 s1~s3"}
      - {name: text, type: string, required: true, constraints: "한 문장, 비어 있지 않음"}
      - {name: lines, type: list<LineRef>, required: true, min: 1}
      - {name: passed, type: boolean, required: true, description: "기계 대조 통과 여부"}
    constraints:
      - 응답 하나에 1~3개.

  - name: LineRef
    description: 생성 요청 재료의 줄 id. 지금 생성 요청의 줄 id 꼴(`c1f1:L3`)을 그대로 쓴다. 가린 줄(`selectable: false`)은 가리킬 수 없다.
    attributes:
      - {name: id, type: string, required: true}

  - name: CatchJudgementRequest
    description: 생성 뒤 Catch마다 한 번 보내는 판정 요청(BR2.1).
    attributes:
      - {name: material, type: list<string>, required: true, description: "그 Catch의 생성 요청에 담긴 고를 수 있는 줄과 경로. 생성 요청과 같은 재료"}
      - {name: recordText, type: string, required: false, description: "CR1 RecordText의 글. 규칙으로 부실하지 않을 때만"}
      - {name: questions, type: list<JudgementQuestion>, required: true, min: 1, max: 400}
    constraints:
      - 판정 입력 밖의 자료(SHA·작성자·날짜·이슈 글·다른 Catch)는 넣지 않는다(BR2.3).

  - name: JudgementQuestion
    description: 판정 공급자가 참일 확률·고르기·점수로만 답하는 질문 하나.
    attributes:
      - {name: id, type: string, required: true}
      - {name: kind, type: enum, required: true, allowed: [RECORD_WHAT, RECORD_WHOLE, TITLE_CHOICE, SENTENCE_TRUE, MATERIAL_KIND, MATERIAL_GROUP, MATERIAL_SCORE]}
      - {name: target, type: string, required: true, description: "질문이 가리키는 대상. RECORD_*는 record, TITLE_CHOICE는 title, SENTENCE_TRUE는 문장 id(s1~s3), MATERIAL_*는 파일 경로"}
      - {name: options, type: list<string>, required: false, description: "TITLE_CHOICE는 통과한 후보 id와 NONE, MATERIAL_KIND는 WORK·RECORD·GENERATED, MATERIAL_GROUP은 씨앗 묶음 이름과 COMMON"}

  - name: JudgementAnswer
    description: 질문 하나의 답. 확률은 0~1, 점수는 1~5.
    attributes:
      - {name: questionId, type: string, required: true}
      - {name: probability, type: number, required: false, min: 0, max: 1, description: "RECORD_WHAT·RECORD_WHOLE·SENTENCE_TRUE"}
      - {name: choiceProbabilities, type: map<string,number>, required: false, description: "TITLE_CHOICE·MATERIAL_KIND·MATERIAL_GROUP. 선택지 확률의 합은 1"}
      - {name: score, type: integer, required: false, min: 1, max: 5, description: "MATERIAL_SCORE"}
    constraints:
      - 응답에 없는 질문, 모양이 틀린 답은 그 질문에 답이 없는 것으로 본다(BR2.5).

  - name: MaterialJudgementRequest
    description: 큰 후보에만 생성 전에 한 번 보내는 재료 판정 요청(BR6.1).
    attributes:
      - {name: files, type: list<string>, required: true, description: "CR1 W3와 같은 출처(근거 커밋 안 본인 커밋의 바뀐 파일)에서, 파일마다 경로·상태·바뀐 줄 수와 가리기 검사를 거친 바뀐 줄 앞 5줄(BR6.1)"}
      - {name: seedGroups, type: list<string>, required: true, description: "CR1 BR5.3~BR5.5가 만든 묶음 이름"}
      - {name: questions, type: list<JudgementQuestion>, required: true, min: 1, max: 400}

  - name: MaterialVerdict
    description: 재료 판정 답을 파일마다 정리한 것. 재료 담기(CR1 W3)가 읽는다.
    attributes:
      - {name: path, type: string, required: true}
      - {name: branch, type: enum, required: false, allowed: [WORK, RECORD, GENERATED], description: "규칙이 OTHER로 본 파일만"}
      - {name: group, type: string, required: false, description: "씨앗 묶음 이름 또는 COMMON"}
      - {name: score, type: integer, required: false, min: 1, max: 5}
      - {name: judged, type: boolean, required: true, description: "질문 400개 안에 들어 물어본 파일인지(Q2 A)"}

  - name: ConfirmationSheet
    description: FR10 확인용 로컬 확인표. 개발용 확인 명령이 쓴다. Git에 넣지 않는다(Q7 A).
    attributes:
      - {name: catches, type: list<object>, required: true, description: "Catch마다 기록의 글, AI 후보·통과 여부, 문장, 판정 값, 고른 제목·남긴 문장, 빈 맞음/틀림 칸"}
    constraints:
      - 커밋되는 AI-DLC 확인 기록에는 건수, 맞음/틀림 결과, AI 쪽을 켤지 결정만 옮긴다(Q7 덧붙임).
```

## 요약

- **AiSide**는 판정 공급자와 켜짐 여부다. 켜짐은 공급자와 키 둘로만 정한다.
- **TitleCandidate·DraftSentence**는 AI 쪽이 켜졌을 때 Claude가 쓰는 글이다. 둘 다 근거 줄(**LineRef**)을 가리키고, 기계 대조를 통과해야 판정에 오른다.
- **CatchJudgementRequest**는 Catch마다 한 번, **MaterialJudgementRequest**는 큰 후보에만 한 번 보낸다. 둘 다 질문 400개 안이다.
- **JudgementAnswer**는 확률·고르기·점수만 담는다. 판정은 글을 쓰지 않는다.
- **MaterialVerdict**는 재료 판정 답을 파일마다 정리해 CR1의 재료 담기에 넘긴다.
- **ConfirmationSheet**는 FR10 확인용 로컬 파일이고 Git에 넣지 않는다.
