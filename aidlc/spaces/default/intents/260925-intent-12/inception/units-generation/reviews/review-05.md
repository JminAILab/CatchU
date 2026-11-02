## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-26T01:31:07Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-dependency.md > Dependency DAG, Parallel development opportunities, 계약 의존 (DAG 밖) | 화살표의 뜻("기다린다")이 정의돼 있지 않다. 공용 기반과 텍스트 자료는 "계약 + 합성 제공자로 먼저 개발하고 통합 때 만난다"고 하면서, u4→u3, u5→u4·u3, u7→u4·u3은 "u3이 끝나면 u4, u4가 끝나면 {u5, u7, u8}"처럼 끝난 뒤에 시작하는 뜻으로 읽힌다. 같은 api 안 동기 호출인 u4→u3도 발행본 최소 DB 계약과 전달 계약으로 고정하면 합성 구현으로 병행 개발할 수 있는데, 그렇게 처리한 계약 의존과 기준이 다르다. 게다가 u3은 u4가 제공하는 계약(발행본·항목 최소 DB)을 쓰므로 계약 쪽은 u3이 u4를 쓰고 DAG 쪽은 u4가 u3을 기다리는 양방향이다. 엣지 블록으로 착수 가능 여부를 계산하면 u3→u4→{u5, u7}의 깊이 3 직렬 사슬이 되어, 입력 §3의 "계약을 기다리지 않는 저장소 등록부터 시작"과 11/2 병행 착수와 어긋난다. 특히 u7의 저장소 등록·수집 상한(US1.2, US1.3)은 u3·u4와 무관한데 Unit 전체가 u4·u3에 묶인다. | 이 문서에 엣지의 의미를 한 줄로 정한다. 즉 "착수 전제"인지 "완료·통합 전제(합성으로 먼저 개발 가능)"인지 밝히고, u4↔u3처럼 계약과 DAG가 양방향인 쌍은 어느 쪽이 합성 구현으로 시작하는지 적는다. u7에서 u3·u4 없이 시작할 수 있는 부분(US1.2, US1.3)도 명시한다. 팀장이 정한 U7→U4 의존 자체는 바꾸지 않는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-dependency.md > 계약 의존 (DAG 밖), Integration points (u6 행) | u6의 본인 조회 도구는 Catch의 작성자 설명을 읽는다(components.md ClaudeMcp: "Catch 조회(설명 포함)", Catches→ClaudeMcp). 그런데 설명(authorDescription)을 Catch에 넣는 것은 U4(US2.1)이고, DAG에서 u6은 아무것도 기다리지 않는다. 계약 의존 표에는 "텍스트 자료 표 모양"만 있고 Catch 설명 속성은 없으며, Integration points에도 u6→Catches 경계가 없다. 이 계약이 고정되지 않으면 u6이 u4보다 먼저 끝나도 설명 조회 도구를 맞춰 볼 대상이 없고, U6의 US13.2 수용 기준을 끝까지 확인할 수 없다. | 계약 의존 표와 Integration points에 "Catch 설명 속성(U4 제공, U6 사용)"을 더한다. 10월 Catch 표에 이미 설명 칸이 있다면 그렇게 적고, 없다면 텍스트 자료 표와 같이 계약 설계에서 먼저 고정할 대상으로 올린다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work.md > U2 책임·경계, U8 컴포넌트 | U2의 책임에 "파일 저장 인터페이스(로컬/S3)"와 탈퇴의 FileStorage 접두어 삭제가 들어 있는데, S3 구현은 U8 컴포넌트이고 S3 버킷도 U8이 시작될 때 준비한다고 적었다. U8을 빼면 S3에 파일이 없어 문제가 없지만, U8을 하면 U2의 탈퇴(US14.1)가 S3에서 실제로 지워지는지는 U8이 들어온 뒤에야 확인된다. 필수 Unit(U2)이 후순위 Unit(U8)의 산출물을 확인 조건으로 삼는 모양이 되는데 어디에도 적혀 있지 않다. | S3 구현이 U8에 있어 U2의 탈퇴 확인은 로컬 저장소 기준이고, S3에서의 접두어 삭제 확인은 U8이 맡는다고 한 줄 적는다. 또는 인터페이스와 S3 구현을 U2에 둔다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work.md > U1 경계, 공통 전제 | 다른 Unit이 U1이 끝나기를 기다리지 않는다고 했는데, U1 관문이 실패하면 "다른 생성 방식은 다시 산정해 범위를 정한다"(요구사항 A04)고 했다. 그러면 합성 제공자로 병행해 만든 U5·U7(과 U4의 기본 요약 등록)이 다시 산정될 수 있다. 병행 착수가 U1 실패 위험을 안고 있다는 점이 Unit 문서에 적혀 있지 않다. | 병행 착수는 U1 관문 결과에 따라 U5·U7의 AI 부분이 바뀔 수 있다는 위험을 한 줄로 적는다. 의존으로 막자는 뜻이 아니라 위험을 보이게 하자는 것이다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-story-map.md > 스토리별 구현 Unit 표 (39행의 빈 줄 이하) | 제외된 9월 스토리 12행이 빈 줄 뒤에 헤더와 구분선 없이 놓여 있어 별도 표로 렌더링되지 않는다. traceability 센서가 보고한 12건이 정확히 이 행들이므로, 센서가 이 행들을 읽지 못한 원인일 가능성이 크다. traceability.json은 같은 12개를 N/A로 정상 기록하고 있어 의미상 누락은 아니다. | 빈 줄을 없애 위 표에 이어 붙이거나 이 행들에 별도 헤더와 구분선을 주어 표로 읽히게 한다. 이 스토리들에 구현 Unit을 붙일 필요는 없다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-dependency.md > Dependency DAG 아래 Text fallback 주석 및 "Unit 의존" 표의 "기다리는 Unit" 열, Walking skeleton 마지막 문장 | 화살표 의미를 "통합·완료 전제"로 바꿨는데 일부 문구는 옛 뜻 그대로다. Text fallback은 "기다린다", 표 열 이름은 "기다리는 Unit", 도입 문장은 "무엇이 무엇을 기다리는지만 적는다"이다. 가장 읽기 쉬운 곳이 이 문구라서, 착수를 기다리는 것으로 다시 읽힐 수 있다. Walking skeleton 마지막 문장은 "첫 Unit을 먼저 끝내고 승인받게 되어 있으므로"라고 쓰면서 바로 앞에서는 "다른 Unit은 U1이 끝나기를 기다리지 않고 병행 착수한다"고 쓴다. 두 문장이 부딪힌다. | 해당 문구를 "통합·완료 전제로 하는 Unit" 같은 표현으로 맞춘다. Walking skeleton 마지막 문장은 병행 착수와 U1의 '최소 연결 첫 결과' 승인이 서로 다른 일이라고 분명히 적거나 삭제한다. 승인 전에 막히는 것은 없다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work.md > Unit 목록 (U7·U10 복잡도) | U7과 U10의 복잡도가 둘 다 M이다. 원래 U7은 L이었고, 작업 기록에만 "둘 다 M"이라는 메모가 있다. 분리로 크기가 줄었다는 점이 Unit 문서에는 드러나지 않는다. 복잡도는 Unit 사이 상대 크기일 뿐이라 막는 사안은 아니다. | 승인 전에 M, M이 맞는지만 확인한다. 바꿀 필요가 있으면 Unit 표의 해당 칸만 고친다. | Accepted risk |
| R-08 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-dependency.md > Parallel development opportunities | "u5·u10(JD 요약)은 u3·u4 구현 뒤에 실제 연결을 확인하고 완료한다"는 문장이 있다. 그런데 U10 전체의 완료 조건으로도 읽힐 수 있다. U10 절은 JD 저장(US6.5)이 U3·U4 없이 시작되고 의존이 JD 요약에만 걸린다고 적어 두었고, 이 문장은 그 범위를 한정하고 있어 모순은 아니다. | 선택 사항이다. 의존이 JD 요약 부분에만 걸린다는 점이 이미 적혀 있으므로 그대로 두어도 된다. | Accepted risk |
| R-09 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-dependency.md > `## Dependency DAG` heading | 이 제목 아래 YAML에는 이제 간선이 하나도 없다. 실제 의존(간선)은 바로 아래 mermaid 그림과 표에만 있다. 제목만 보면 YAML이 그래프의 정본으로 읽힌다. 7번째 줄 설명과 45번째 줄 문구가 이 혼동을 줄이고 있어 막을 정도는 아니다. | 제목을 "Unit 목록(YAML, 착수 가능 표시용)"처럼 YAML의 역할이 드러나게 바꾸거나, 제목 바로 아래에 "간선은 아래 그림·표" 한 줄을 더한다. | New |
| R-10 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work.md > 머리말 둘째 항목(Unit 사이 의존은 "착수 전제"가 아니라 "통합·완료 전제"다) | 의존 문서 쪽에는 YAML `depends_on`이 비어 있는 이유가 적혀 있다. Unit 정의 문서에는 그 이유와 "YAML은 도구용, 의미는 그림·표"라는 안내가 없다. 이 문서만 읽고 YAML을 열어 본 사람은 의존이 없다고 오해할 수 있다. | 해당 항목에 "도구의 Unit 맡기 규칙 때문에 YAML의 depends_on은 비워 두며, 통합·완료 전제는 의존 문서의 그림·표가 정본이다"를 한 문장 덧붙인다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (none listed for this stage) | n/a | `depends_on` 전수 확인은 직접 읽고 했다. YAML의 10개 Unit(u1~u10)이 모두 `depends_on: []`이고 u1이 맨 앞이다. 그림·표의 간선(u4→u3, u5→u4·u3, u10→u4·u3, u8→u4, u9→u6·u4)은 그대로다. `unit-of-work.md`, `unit-of-work-story-map.md`, `traceability.json`에는 `depends_on` 값이 없어 어긋난 곳이 없다. |

### Summary

변경은 모든 Unit에 일관되게 적용됐고, Unit 정의·스토리 배정·계약 내용은 건드리지 않았다. 7번째 줄, 45번째 줄, 62번째 줄의 대체 문구가 "YAML은 착수 가능 여부, 그림·표는 통합·완료 전제"라는 구분을 분명히 적고 있다. 남은 건 제목과 Unit 정의 문서의 안내가 덜 친절하다는 Minor 두 건뿐이다. 도구가 더는 통합·완료 순서를 강제하지 않는다는 점은 팀장이 이미 받아들인 사항이다.
