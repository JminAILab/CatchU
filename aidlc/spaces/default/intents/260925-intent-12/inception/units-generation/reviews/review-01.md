## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-24T12:37:31Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-dependency.md > Dependency DAG, Parallel development opportunities, 계약 의존 (DAG 밖) | 화살표의 뜻("기다린다")이 정의돼 있지 않다. 공용 기반과 텍스트 자료는 "계약 + 합성 제공자로 먼저 개발하고 통합 때 만난다"고 하면서, u4→u3, u5→u4·u3, u7→u4·u3은 "u3이 끝나면 u4, u4가 끝나면 {u5, u7, u8}"처럼 끝난 뒤에 시작하는 뜻으로 읽힌다. 같은 api 안 동기 호출인 u4→u3도 발행본 최소 DB 계약과 전달 계약으로 고정하면 합성 구현으로 병행 개발할 수 있는데, 그렇게 처리한 계약 의존과 기준이 다르다. 게다가 u3은 u4가 제공하는 계약(발행본·항목 최소 DB)을 쓰므로 계약 쪽은 u3이 u4를 쓰고 DAG 쪽은 u4가 u3을 기다리는 양방향이다. 엣지 블록으로 착수 가능 여부를 계산하면 u3→u4→{u5, u7}의 깊이 3 직렬 사슬이 되어, 입력 §3의 "계약을 기다리지 않는 저장소 등록부터 시작"과 11/2 병행 착수와 어긋난다. 특히 u7의 저장소 등록·수집 상한(US1.2, US1.3)은 u3·u4와 무관한데 Unit 전체가 u4·u3에 묶인다. | 이 문서에 엣지의 의미를 한 줄로 정한다. 즉 "착수 전제"인지 "완료·통합 전제(합성으로 먼저 개발 가능)"인지 밝히고, u4↔u3처럼 계약과 DAG가 양방향인 쌍은 어느 쪽이 합성 구현으로 시작하는지 적는다. u7에서 u3·u4 없이 시작할 수 있는 부분(US1.2, US1.3)도 명시한다. 팀장이 정한 U7→U4 의존 자체는 바꾸지 않는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-dependency.md > 계약 의존 (DAG 밖), Integration points (u6 행) | u6의 본인 조회 도구는 Catch의 작성자 설명을 읽는다(components.md ClaudeMcp: "Catch 조회(설명 포함)", Catches→ClaudeMcp). 그런데 설명(authorDescription)을 Catch에 넣는 것은 U4(US2.1)이고, DAG에서 u6은 아무것도 기다리지 않는다. 계약 의존 표에는 "텍스트 자료 표 모양"만 있고 Catch 설명 속성은 없으며, Integration points에도 u6→Catches 경계가 없다. 이 계약이 고정되지 않으면 u6이 u4보다 먼저 끝나도 설명 조회 도구를 맞춰 볼 대상이 없고, U6의 US13.2 수용 기준을 끝까지 확인할 수 없다. | 계약 의존 표와 Integration points에 "Catch 설명 속성(U4 제공, U6 사용)"을 더한다. 10월 Catch 표에 이미 설명 칸이 있다면 그렇게 적고, 없다면 텍스트 자료 표와 같이 계약 설계에서 먼저 고정할 대상으로 올린다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work.md > U2 책임·경계, U8 컴포넌트 | U2의 책임에 "파일 저장 인터페이스(로컬/S3)"와 탈퇴의 FileStorage 접두어 삭제가 들어 있는데, S3 구현은 U8 컴포넌트이고 S3 버킷도 U8이 시작될 때 준비한다고 적었다. U8을 빼면 S3에 파일이 없어 문제가 없지만, U8을 하면 U2의 탈퇴(US14.1)가 S3에서 실제로 지워지는지는 U8이 들어온 뒤에야 확인된다. 필수 Unit(U2)이 후순위 Unit(U8)의 산출물을 확인 조건으로 삼는 모양이 되는데 어디에도 적혀 있지 않다. | S3 구현이 U8에 있어 U2의 탈퇴 확인은 로컬 저장소 기준이고, S3에서의 접두어 삭제 확인은 U8이 맡는다고 한 줄 적는다. 또는 인터페이스와 S3 구현을 U2에 둔다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work.md > U1 경계, 공통 전제 | 다른 Unit이 U1이 끝나기를 기다리지 않는다고 했는데, U1 관문이 실패하면 "다른 생성 방식은 다시 산정해 범위를 정한다"(요구사항 A04)고 했다. 그러면 합성 제공자로 병행해 만든 U5·U7(과 U4의 기본 요약 등록)이 다시 산정될 수 있다. 병행 착수가 U1 실패 위험을 안고 있다는 점이 Unit 문서에 적혀 있지 않다. | 병행 착수는 U1 관문 결과에 따라 U5·U7의 AI 부분이 바뀔 수 있다는 위험을 한 줄로 적는다. 의존으로 막자는 뜻이 아니라 위험을 보이게 하자는 것이다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-story-map.md > 스토리별 구현 Unit 표 (39행의 빈 줄 이하) | 제외된 9월 스토리 12행이 빈 줄 뒤에 헤더와 구분선 없이 놓여 있어 별도 표로 렌더링되지 않는다. traceability 센서가 보고한 12건이 정확히 이 행들이므로, 센서가 이 행들을 읽지 못한 원인일 가능성이 크다. traceability.json은 같은 12개를 N/A로 정상 기록하고 있어 의미상 누락은 아니다. | 빈 줄을 없애 위 표에 이어 붙이거나 이 행들에 별도 헤더와 구분선을 주어 표로 읽히게 한다. 이 스토리들에 구현 Unit을 붙일 필요는 없다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (선언된 검증 도구 없음) | 해당 없음 | 엣지 블록을 직접 대조했다. u1~u9 아홉 개가 한 번씩 선언되고, depends_on 이름이 모두 선언돼 있으며, 자기 의존이 없고 비순환이다. kind는 모두 `service`로 유효하다. 산문·mermaid·표가 엣지 블록과 일치한다. |
| traceability 센서 (보고 12건) | 제외된 9월 스토리 12개 | 의도된 비연결이라 Unit 배정은 필요 없다. traceability.json에는 N/A로 올라 있다. 센서가 읽지 못한 원인은 위 마지막 Minor(표 끊김)로 보인다. |

### Summary

엣지 블록은 형식이 맞고 비순환이며, U8·U9를 기다리는 필수 Unit은 없고(u8, u9는 어떤 depends_on에도 나오지 않는다), 모든 컴포넌트가 하나의 Unit 또는 명시된 분할(Materials 텍스트/PDF, AiGeneration U1/U2, Publication PDF 부분 U8)에 속하며, 스토리 30개가 모두 배정돼 구현 순서를 권고한 곳은 없다. 다만 엣지가 "착수 전제"인지 "통합 전제"인지 정의되지 않아 계약 의존과 DAG 의존의 기준이 갈리고(U7의 독립 부분이 묶임), U6이 읽는 Catch 설명 속성이 계약 목록에서 빠져 있다. 이 둘이 Major이지만 개수가 2개 이하라 READY이며, 승인 때 반영 여부를 판단해 주길 권한다.
