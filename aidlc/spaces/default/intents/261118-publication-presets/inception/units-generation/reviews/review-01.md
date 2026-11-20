## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-19T13:21:13Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/inception/units-generation/unit-of-work-story-map.md > 「이야기별 단위」 표의 US3.1 행 | US3.1은 FR5.1과 AC3.1.4(변경 전 발행본 링크가 접근 불가 화면으로 열림)를 담는데, 이 동작을 만드는 일(변경 전 발행본 DB 행과 PDF 사본 파일 지우기)은 unit-of-work.md에서 U1이 맡는다. 그런데 이 행은 U3만 적어서, U1의 기능 설계가 AC3.1.4를 추적하지 않고 지우기 시험이 어느 단위에도 확실히 걸리지 않는다. 접근 불가 화면은 지금 이미 있어 U3이 새로 만들 것이 없다. | US3.1 행에 U1을 더해 `U1; U3`로 하고 비고에 「변경 전 발행본 버리기(U1)와 접근 불가 화면 확인(U3)」처럼 나눠 적는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/units-generation/unit-of-work-dependency.md > 「의존 그래프」 아래 문단 「U2와 U3은 서로 기대지 않는다…파일이 다르다」 | 두 단위가 파일이 다르다는 설명은 맞지 않다. `web/src/features/publications/publications-api.ts` 한 파일에 발행 요청 모양(`PublishRequest`는 지금 `items`, 막힘 응답 details 읽기, 라인 22·181·214~241)과 사본 항목 검사(`isPublishedItem`, 라인 107)가 함께 있다. U2는 앞쪽을, U3은 뒤쪽을 고쳐야 한다. 서로 기대는 관계는 아니라 그래프는 그대로 맞지만, 각자 따로 복사한 작업 폴더에서 동시에 만들면 같은 파일에서 병합 충돌이 난다. | 문단에서 「파일이 다르다」를 빼고 「publications-api.ts는 둘 다 고친다(요청·막힘 응답은 U2, 사본 항목 검사는 U3)」로 바꾸어, Delivery Planning이 동시 진행 여부를 판단할 수 있게 한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/units-generation/unit-of-work-story-map.md > 「확인」 첫 줄과 traceability.json > coverage | 「traceability.json과 같다」고 적었으나, 이야기 표에서 여러 단위(`U1; U2` 등)를 적은 행이 JSON에서는 단위 하나만 갖는다(US1.1은 U2만, US2.3은 U1만, US1.2·US1.4·US1.6은 U1만 등). 읽는 쪽이 JSON만 보면 두 번째 단위가 빠진 것으로 읽는다. | 「같다」 대신 「JSON은 행마다 첫 대상 하나만 싣는다」고 풀어 적거나, 이야기 표를 기준으로 삼는다고 밝힌다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 의존 그래프 yaml 검사(수동 대조) | 단위 4개 모두 한 번씩 선언, `depends_on`이 모두 선언된 단위, 자기 의존·순환 없음, kind가 허용 값 | 형식이 맞는다. U1 루트, U2·U3 → U1, U4 의존 없음. |
| 구성 요소 배정 대조(components.md의 18개) | U1 7개(PublishableSource, PresetLibrary, SnapshotContract, Publications, PublishedIndex, RagAnswer, SharedLinkReader)와 외래 키로 기대는 MemberAccount·MaterialLibrary, U2 3개, U3 5개, U4 1개 | 18개 모두 배정됐고 빠진 것이 없다. |
| 이야기 배정 대조(stories.md의 US1.1~US4.4, 21개) | 21개 모두 이야기 표와 traceability.json에 있고 모든 단위에 줄이 있다 | 배정 누락 없음. 위 Major는 배정 대상이 아니라 행이 가리키는 단위가 부족한 문제다. |
| 코드 확인 | `publications-api.ts`의 `isPublishedItem`은 모르는 칸을 통과시킨다 | 「사본에 칸이 더해져도 받은 사람·작성자 화면이 열린다」는 주장은 맞다. |
| 순서 추천 금지 규칙 | 의존 문서의 「가능한 순서 예」는 위상 순서의 여러 가능성을 나열하고 선택을 Delivery Planning에 넘긴다. 단위 안 순서는 이 단계가 허용한다. | 위반 아님. |

### Summary

U2·U3이 U1에 기대고 U4가 홀로 서는 비순환 그래프는 맞게 적혀 있고, 구성 요소 18개와 이야기 21개가 모두 배정됐다. 고칠 것은 US3.1(변경 전 발행본 버리기)에 U1이 빠진 것 하나이고, U2·U3이 같은 web 파일을 고친다는 점은 Delivery Planning이 동시 진행을 정할 때 알아야 해서 알려 둔다.
