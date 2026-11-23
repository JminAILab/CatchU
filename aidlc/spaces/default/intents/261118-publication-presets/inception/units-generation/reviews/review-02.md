## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-19T13:33:15Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/inception/units-generation/unit-of-work-story-map.md > 「이야기별 단위」 표의 US3.1 행 | US3.1은 FR5.1과 AC3.1.4(변경 전 발행본 링크가 접근 불가 화면으로 열림)를 담는데, 이 동작을 만드는 일(변경 전 발행본 DB 행과 PDF 사본 파일 지우기)은 unit-of-work.md에서 U1이 맡는다. 그런데 이 행은 U3만 적어서, U1의 기능 설계가 AC3.1.4를 추적하지 않고 지우기 시험이 어느 단위에도 확실히 걸리지 않는다. 접근 불가 화면은 지금 이미 있어 U3이 새로 만들 것이 없다. | US3.1 행에 U1을 더해 `U1; U3`로 하고 비고에 「변경 전 발행본 버리기(U1)와 접근 불가 화면 확인(U3)」처럼 나눠 적는다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/units-generation/unit-of-work-dependency.md > 「의존 그래프」 아래 문단 「U2와 U3은 서로 기대지 않는다…파일이 다르다」 | 두 단위가 파일이 다르다는 설명은 맞지 않다. `web/src/features/publications/publications-api.ts` 한 파일에 발행 요청 모양(`PublishRequest`는 지금 `items`, 막힘 응답 details 읽기, 라인 22·181·214~241)과 사본 항목 검사(`isPublishedItem`, 라인 107)가 함께 있다. U2는 앞쪽을, U3은 뒤쪽을 고쳐야 한다. 서로 기대는 관계는 아니라 그래프는 그대로 맞지만, 각자 따로 복사한 작업 폴더에서 동시에 만들면 같은 파일에서 병합 충돌이 난다. | 문단에서 「파일이 다르다」를 빼고 「publications-api.ts는 둘 다 고친다(요청·막힘 응답은 U2, 사본 항목 검사는 U3)」로 바꾸어, Delivery Planning이 동시 진행 여부를 판단할 수 있게 한다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/units-generation/unit-of-work-story-map.md > 「확인」 첫 줄과 traceability.json > coverage | 「traceability.json과 같다」고 적었으나, 이야기 표에서 여러 단위(`U1; U2` 등)를 적은 행이 JSON에서는 단위 하나만 갖는다(US1.1은 U2만, US2.3은 U1만, US1.2·US1.4·US1.6은 U1만 등). 읽는 쪽이 JSON만 보면 두 번째 단위가 빠진 것으로 읽는다. | 「같다」 대신 「JSON은 행마다 첫 대상 하나만 싣는다」고 풀어 적거나, 이야기 표를 기준으로 삼는다고 밝힌다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/units-generation/unit-of-work-story-map.md > 「여러 단위에 걸친 것」 | 이야기 표는 US2.3·US3.1·US3.3·US4.1을 서버(U1)와 화면(U3)으로 나눈다. 이 문단은 그 넷을 "서버 동작이 U1, 화면에 보이는 부분이 U3"이라는 한 줄로 묶는다. US3.1과 US3.3의 U1 몫(발행본 버리기, 근거 처리)은 이 한 줄에 드러나지 않는다. | 필수 아님. 원하면 US3.1·US3.3의 U1 몫을 한 구절씩 덧붙인다. | New |

> R-01 Reviewer note: unit-of-work-story-map.md의 US3.1 행이 `U1; U3`이 되었고, 비고가 변경 전 발행본 버리기(U1)와 접근 불가 화면 확인(U3)으로 나뉘어 있다. 같은 이유로 고친 US3.3 행(`U1; U3`)도 US3.3의 AC3.3.2·AC3.3.3 근거 처리(U1)와 탭을 바꿔도 질문 대화가 남는 부분(U3)을 나눠 적었다.

> R-02 Reviewer note: unit-of-work-dependency.md의 「의존 그래프」 아래 문단이 `publications-api.ts`를 둘 다 고친다고 적었다. 요청·막힘 응답은 U2, 사본 항목 검사는 U3이 맡는다.

> R-03 Reviewer note: 「확인」이 「JSON은 행마다 첫 단위 하나만 싣고, 이야기 표가 기준이다」라고 밝힌다. traceability.json은 여러 단위 행(US1.x, US2.1~2.4, US3.1, US3.3, US4.1)마다 첫 단위(U1)를 쓰고 있어 말과 실제가 맞는다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 수동 대조(이야기 표 ↔ 줄 수 ↔ traceability.json) | 일치 | 줄 수는 U1 16, U2 9, U3 8, U4 1로 표와 같고, 합은 이야기 21개와 맞는다. JSON의 upstream_ids 21개와 coverage 21행도 같다. 의존 그래프(U2→U1, U3→U1, U4 독립)에 순환은 없다. |

### Summary

앞 회차 지적 셋이 모두 고쳐졌고, 이야기 표·줄 수·JSON·의존 문단이 서로 맞는다. 남은 것은 필수가 아닌 Minor 한 건뿐이라 READY다.
