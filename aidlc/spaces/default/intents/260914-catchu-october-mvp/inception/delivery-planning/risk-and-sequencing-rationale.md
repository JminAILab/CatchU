# CatchU — 첫 연결 순서의 이유

## 순서와 의존

| 선택 | 근거·한계 |
|---|---|
| 공통 기반을 기능 앞에 둠 | #83 이후 #86~#88로 저장·본인 식별·오류 형식을 맞춘다. #88 정본은 승인된 API 계약이다 |
| 얇은 첫 연결을 먼저 확인 | 모든 기능을 끝낸 뒤 연결하지 않고 합성 F→E→B와 사용자 확인/공개·수신자 흐름으로 경계 위험을 드러내는 walking skeleton 방식(최소 연결 흐름). 한 번의 M1 승인 |
| 대역을 사용한 병행 | U1→U2→U3는 계약 의존이며 제공 계약/대역으로 화면·서비스 작업을 병행한다. 실제 A/F 인증·E/F 전송 의존은 남음 |
| 점수·기간 추정 생략 | 우선 순서는 사용자가 결정했다. 새 경제성 순위·가용량/기간을 임의로 만들지 않음 |
| 실제 연결은 조건별 판단 | #77·인증·모델/보존/보호의 미결은 해당 실제 연결만 제한. 합성 개발을 미선정 자체로 일괄 보류하지 않음 |

## 남은 위험과 적용 범위

| 항목 | 현재 판단·후속 |
|---|---|
| Contract R-01 Major | 식별자 없는/잘못된 worker 메시지의 거부·격리 경계는 Accepted risk. 해결로 표시하지 않음. E/F 담당이 실제 불량 메시지 처리 연결 전에 이슈로 다룸 |
| Contract R-02 Minor | 본문의 목록 공통 설명과 수신자 profile/catches/page 차이는 Accepted risk. 기존 수신자 YAML 형식을 임의 변경하지 않고 C/A 리뷰에서 확인 |
| B 검토 | 이연된 B 영역 확인은 PR #89 병합 전 필수. 등록·E 반영 원자성/정본·공개 경계 검토 |
| 최소 연결의 한계 | MOCK 결과는 실제 수집/생성 품질·인증/외부 전송·배포를 검증하지 않음. 원본 보호·링크 전체 조건 등 MVP 완료 기준은 그대로 |
| 추적성 검사 한계 | User Stories SKIP의 FR 매핑을 US 전용 검사로 놓치는 기존 framework advisory 결함 유지. 검사 수정/재호출·가짜 US ID 삽입 없음 |

계약 수정은 응답 필드·상태 의미·권한·DB 관계와 유일성 변경이다. 이슈 → AI-DLC 계약 기록 → PR → 담당 리뷰로 처리하고 내부 구현만 바뀌면 일반 PR로 진행한다. Accepted risk가 임의 계약 변경이나 보호 조건 생략을 허용하지 않는다.

## 담당자 확인 요청

- 1·2: F/E 불량 메시지·실제 인증/전송의 남은 경계 확인.
- 3: 목록 형식·수신자 접근/오류 의미 확인.
- 4: 등록/반영과 공개 보호 경계 확인. PR #89 병합 전 필수.

## 추적 정보

[첫 연결 순서](bolt-plan.md) · [계약 및 Open questions](../contract-design/contract-summary.md) · [Contract 독립 검토](../contract-design/review.md) · [Units 검증](../units-generation/verification.md) · [phase-check](../../verification/phase-check-inception.md). 자료 조건은 [#37](https://github.com/JminAILab/CatchU/issues/37).
