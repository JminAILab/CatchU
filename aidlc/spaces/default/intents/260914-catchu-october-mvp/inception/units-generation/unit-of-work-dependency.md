# CatchU — Unit 의존과 연결

## 계약 의존 DAG

화살표는 소비자가 필요로 하는 제공 계약 방향이다. 승인된 작성안의 web → api → worker를 아래 식별자로 표현한다. 실행 중 모든 호출·결과 전달을 나타내는 그래프나 구현/배포 순서는 아니다.

```yaml
units:
  - name: u1-web
    kind: ui
    depends_on: [u2-api]
  - name: u2-api
    kind: service
    depends_on: [u3-worker]
  - name: u3-worker
    kind: service
    depends_on: []
```

텍스트 도식: U1(web) → U2(api) → U3(worker). 선언 3개, 간선 2개, 자기 의존·순환 없음. [Unit ID·Directory](unit-of-work.md)와 일치한다.

## 실제 연결과 미결

| 경계 | 계약 소비·자료 흐름 | 정본·후속 결정 |
|---|---|---|
| web → api | 회원 입력/조회/공개 관리 및 비로그인 수신자 조회 | api 업무 판단·현재 권한, web 화면 표시. 회원/수신자 OpenAPI 분리 |
| api → worker | E 요청·동의/허용 범위·작업 식별을 F에 전달 | E 요청 정본, F 처리 의미. 제공자 비종속 요청 스키마 |
| worker → api | F 결과/실패 범위·후보/근거·초안/최소 질문을 E에 전달, B가 등록·보존 | 결과 스키마·E 반영 상태는 Contract. 역방향 결과 전달을 두 번째 DAG 간선으로 세지 않음 |
| worker ↔ api의 A 경계 | F가 허용된 GitHub 접근에 A의 연동/인증정보 경계를 사용 | **실제 양방향 의존이 존재한다.** 전달/조회 방식·수명은 A/F가 Contract에서 결정. worker의 무조건 독립 실행을 주장하지 않음 |

api가 worker 결과를 쓰고 F가 A의 인증 경계를 쓰므로 도메인 호출 그래프를 Unit별로 단순 축약하면 양방향이 된다. 위 DAG는 확정할 계약과 모의 경계로 분리한 설계 의존을 표현한다. A/F 계약 미확정은 해당 실제 연결을 막지만 api 실행체 전체 완성을 worker 설계의 선행 조건으로 추가하지 않는다. 서버 간 자격정보 전달·조회 API나 DB 직접 접근을 이번에 채택하지 않는다.

E/F 전송 방식은 #77 이후 결정한다. 요청·결과 스키마, 재전달/반영 의미는 계약에서 먼저 다루며 큐·HTTP callback 등 전송 선택을 임의 고정하지 않는다.

## 병행 가능 범위

DAG 자체에는 서로 무관한 Unit 쌍이 없다. 계약을 고정하고 제공자/소비자 대역을 사용하는 범위의 화면·서비스·분석 개발은 병행할 수 있으며, 이는 실제 연결 성공이나 의존 제거가 아니다. 실제 통합에는 양쪽 계약 수용과 A/F 인증·E/F 전송의 해당 미결 해소가 필요하다. 첫 연결 순서·담당 배치는 Delivery가 정한다.

## Sources

[components](../domain-design/components.md) · [decisions](../domain-design/decisions.md) · [requirements](../requirements-analysis/requirements.md) · [확인한 작성안](units-generation-questions.md) · [9/23 진행 결정](../domain-design/2026-09-23-followup.md).

자료 사용·잔여 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).

