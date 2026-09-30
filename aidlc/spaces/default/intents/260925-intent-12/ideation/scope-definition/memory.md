<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
- 2026-09-25T08:18:57Z — 입력의 확정 포함·보류·제외와 요구사항 분석으로 넘긴 미결을 분리한다. 이미 정한 대표 구성 1순위·운영 기능 후순위 외의 순서를 임의로 매기지 않고, 범위 정의에서는 지위 요약과 12월 중순 일정의 의미만 먼저 확인한다.
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions

- 2026-09-25T10:15:04Z — Q19에서 필수 기능의 시작 경로·준비사항과 제품 MCP 연결·이용 시작의 최소 안내를 마감 필수로 지정했다. 대상별 내용·완료 기준은 요구사항 분석에서 확인한다. Q20의 10월 담당표 4명은 12월 가용 인력의 근거가 아니며, 실제 인원·시간·개발량 미확정으로 일정 내 구현 가능성은 미검증이다. 근거 확보 후 충돌이 있으면 사용자에게 조정안을 제시한다.

- 2026-09-25T10:04:59Z — Q17·Q18에서 프로필 상세 확장과 본인 카드 키워드 검색은 포함·마감 필수 아님으로 정했다. 기업 검색의 필수 조건이 상세 확장에 의존하면 필요한 항목·이유를 제시하고 해당 부분의 필수 여부를 사용자에게 다시 확인한다. 대표 구성의 카드 확인·선택과 기업 구직자 검색은 기존 필수 목표를 유지한다.

- 2026-09-25T09:57:41Z — Q15·Q16으로 기업 제안·응답·수신 통제·차단과 수락 후 연락처 공유가 마감 필수로 확정됐다. 연락처 공유 대상·항목·동의 방식과 수락 취소·차단 시 처리는 요구사항 분석에서 확인하며 수락만으로 모든 연락처 자동 공개를 가정하지 않는다. 마일리지와 기업↔구직자 텍스트 DM은 포함·마감 필수 아님으로 분리한다.

- 2026-09-25T09:48:33Z — Q13·Q14로 채용공고 관리·마일리지 지급의 마감 필수 여부는 본 기능과 함께 포함 유지·마감 필수 아님으로 확인됐다. 마일리지 미적용 시 필수 기능의 자격·허용 범위·한도 등은 요구사항 분석에서 제안하고 사용자 확인을 받을 미결이며 무료·무제한으로 추정하지 않는다. 기업 제안·구직자 응답 본 기능은 마일리지와 분리해 Q15에서 확인한다.

- 2026-09-25T09:39:10Z — Q12에서 채용공고 관리와 마일리지 지급의 마감 필수 여부를 본 기능과 함께 판단하도록 남겼다. Q13·Q14로 연결하며, 마일리지의 제안 발송·응답 페이백을 필수로 정할 경우 아직 요구사항 분석 대상인 제안·응답 기능의 선행 관계와 필수 범위를 함께 확인한다. 본 기능 판단 전 두 관리 기능을 제외나 마감 비필수로 해석하지 않는다.
- 2026-09-25T08:52:02Z — 대표 구성 전체와 외부 접속 가능한 NCP 통합 서비스가 마감 필수로 정해졌다. 11월 30일 완료에는 NCP 배포·핵심 흐름의 외부 접속 및 동작 확인을 포함하고, 자동 배포 필수 여부는 별도 미결로 유지한다. 나머지 마감 필수 기능과 정확한 제출 자료 형식은 후속 확인한다.
- 2026-09-25T08:41:45Z — 공식 마감 2026-12-10, 개발 완료 기준일 2026-11-30, 통합 검증·결함 수정·제출 준비 2026-12-01~09가 사용자 답변으로 정해졌다. 마감 필수 기능과 제출 결과 형태는 후속 질문으로 확정하며, 일정 충돌 시 임의 제외 없이 우선순위·범위 조정안을 제시한다.
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
