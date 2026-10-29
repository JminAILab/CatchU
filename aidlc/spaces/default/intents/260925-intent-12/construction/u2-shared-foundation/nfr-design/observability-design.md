# U2 공용 기반 — 관측 설계

## Sources

작성일: 2026-10-27. 입력: [관측 요구사항](../nfr-requirements/observability-requirements.md)(observability-requirements) NFR3.1·NFR6.6~6.10, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec) W11, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「에러 대응 최소선」.

## 원칙

지표 수집기·대시보드·경보·분산 추적은 두지 않는다(NFR6). SLI/SLO는 정의하지 않는다(NFR4). 관측은 기존 api 로거의 로그 줄과 통합 확인 표뿐이다.

## 로그 줄

| 요구사항 | 이벤트 | 남기는 칸 | 남기지 않는 것 |
|---|---|---|---|
| NFR3.1 | `ai_gate_result` | feature, itemCount, droppedCount, 이유별 수(truncated·location·fact·role·outside_heading) | 항목 글, 근거 글, 질문, JD 줄 |
| NFR6.6 | `ai_run_enqueue_failed`, `ai_run_handler_failed`, `ai_run_unknown_kind` | kind, runKey, 오류 이름 | payload, 오류 메시지 원문 |
| NFR6.7 | `withdrawal_failed` | 단계 번호(1~4), 오류 이름 | memberId 외 회원 정보, 파일 경로 |

- NFR6.9: 위 표 밖의 값을 로그에 넣지 않는다. 오류 객체를 통째로 남기지 않고 이름만 남긴다.
- NFR6.10: 기존 api 로거를 그대로 쓴다. 새 형식·수집 장치를 만들지 않는다.

## 통합 확인 표 (NFR6.8)

`docs/CatchU_통합확인.md` 하나에 다음을 둔다.

1. 시나리오 목록: 보호 흐름 3개, 실제 Claude 연결, 실제 분석과 거부 사례, 새 저장소 등록 경로 실제 실행 여부, Google 외부 계정 로그인, 팀원 아닌 1명 사용
2. 확인 표: 날짜 | 차수 | 시나리오 | 대상 버전 | 환경 | 결과(통과·실패·미실행) | 메모
3. 제출 준비 절: 실패·미완료 필수 기능의 영향과 조정안, 상수 조정 기록(80,000자 등)

헬스체크·로컬 성공·승인 문서로 칸을 채우지 않는다.

## 상관 ID

분산 추적이 없으므로 상관 ID를 새로 전파하지 않는다. AiRun 로그는 runKey로, 탈퇴 로그는 요청 로그와 같은 줄 묶음으로 찾는다.
