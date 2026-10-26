# CatchU 12월 범위 — 스토리와 Unit 대응

작성일: 2026-10-24. 고침: 2026-10-26 U7을 U7(저장소·분석)과 U10(JD)으로 나눔(Q4). 입력: [사용자 스토리](../user-stories/stories.md)(stories), [재승인 요구사항](../requirements-analysis/requirements.md)(requirements), [컴포넌트 목록](../domain-design/components.md)(components), [결정 기록](../domain-design/decisions.md)(decisions), [Unit 정의](unit-of-work.md). 한 행에 Unit이 여럿이면 그 Unit 모두가 그 스토리의 일부를 구현하며, 각자 자기 기능 설계에서 그 스토리의 수용 기준을 추적한다.

## 스토리별 구현 Unit

| Story | Unit ID | Directory | 비고 |
|---|---|---|---|
| US1.1 | U2 | u2-shared-foundation | 외부 사용자 Google 로그인 대상 설정 |
| US1.2 | U7 | u7-repository-analysis | 관계 사전 검사 없는 등록, 수집 상한, 이유별 거부 |
| US1.3 | U7 | u7-repository-analysis | 분석 화면 상태, 제한된 재요청 |
| US1.4 | U4 | u4-publication-link | Catch 구분 표시, 공개/비공개 |
| US2.1 | U4 | u4-publication-link | Catch 설명 |
| US2.2 | U4 | u4-publication-link | 설명·텍스트 자료 저장 실패 |
| US2.3 | U4 | u4-publication-link | 재분석 때 설명 유지 |
| US3.1 | U4; U8 | u4-publication-link; u8-pdf-materials | 텍스트(U4), PDF 부분(U8, 후순위) |
| US3.2 | U8 | u8-pdf-materials | 후순위 |
| US4.1 | U4; U3; U8 | u4-publication-link; u3-published-index; u8-pdf-materials | 발행과 공개 전환(U4), 발행 때 조각 나누기(U3), PDF 부분(U8) |
| US4.2 | U5 | u5-rag-answer | AI 기본 요약 |
| US4.3 | U4 | u4-publication-link | 고정 발행본 안내 |
| US4.4 | U4 | u4-publication-link | 받은 링크 열람 |
| US5.1 | U4 | u4-publication-link | 중지·만료 |
| US5.2 | U4; U8 | u4-publication-link; u8-pdf-materials | 발행본 삭제, PDF 사본 삭제(U8) |
| US6.1 | U10 | u10-jd | JD 요구사항별 요약 |
| US6.2 | U5; U3 | u5-rag-answer; u3-published-index | 질의응답(U5), 색인 상태·검색(U3) |
| US6.3 | U1; U2 | u1-ai-generation-gate; u2-shared-foundation | 인용 연결(U1), 근거 검사·출처 표시(U2) |
| US6.4 | U2 | u2-shared-foundation | 계정당 하루 실행 제한 |
| US6.5 | U10 | u10-jd | JD 관리 |
| US13.1 | U6 | u6-claude-mcp | 연결·만료·해제·빈도 제한 |
| US13.2 | U6 | u6-claude-mcp | 본인 조회 도구 |
| US13.3 | U9 | u9-recipient-claude | 후순위 |
| US14.1 | U2 | u2-shared-foundation | 탈퇴 순서 |
| US14.3 | U2 | u2-shared-foundation | 재가입 |
| US16.2 | U2 | u2-shared-foundation | 시작 안내·기본 오류 |
| US19.1 | U2 | u2-shared-foundation | 통합 확인 진행(입력 §3 공용 기반) |
| US19.2 | U2 | u2-shared-foundation | 통합 확인 진행에 딸린 확인 표·제출 자료 정리(리허설 자체는 팀 활동) |
| US19.3 | U5 | u5-rag-answer | RAG 품질 평가(입력 §3 RAG 덩어리) |
| US20.1 | U2 | u2-shared-foundation | 첫 이용 동의·고지 |

프로젝트 목표에서 제외된 9월 스토리(구현 Unit 없음):

| Story | Unit ID | Directory | 비고 |
|---|---|---|---|
| US5.3 | N/A | N/A | 제외로 연결 없음 — 프로젝트 목표에서 제외 |
| US7.1 | N/A | N/A | 제외로 연결 없음 — 9월 US7.1~US12.2 기업 기능 |
| US12.2 | N/A | N/A | 제외로 연결 없음 — 9월 US7.1~US12.2 기업 기능 |
| US13.4 | N/A | N/A | 제외로 연결 없음 — 구직자 탐색 MCP |
| US14.2 | N/A | N/A | 제외로 연결 없음 — 기업 종료 |
| US15.1 | N/A | N/A | 제외로 연결 없음 — 9월 US15.1~US15.3 문의·운영 조치 |
| US15.3 | N/A | N/A | 제외로 연결 없음 — 9월 US15.1~US15.3 문의·운영 조치 |
| US16.1 | N/A | N/A | 제외로 연결 없음 — 분석 알림 |
| US17.1 | N/A | N/A | 제외로 연결 없음 — 9월 US17.1~US17.16 마감 비필수 |
| US17.16 | N/A | N/A | 제외로 연결 없음 — 9월 US17.1~US17.16 마감 비필수 |
| US18.1 | N/A | N/A | 제외로 연결 없음 — 후순위 운영 |
| US18.2 | N/A | N/A | 제외로 연결 없음 — 후순위 운영 |

프로젝트 목표에서 제외된 9월 스토리 ID(위 N/A 행과 그 사이 번호)는 구현 Unit이 없다.

## 여러 Unit에 걸친 행

| Story | 걸친 Unit | 나누는 기준 |
|---|---|---|
| US3.1 | U4, U8 | 텍스트 자료는 U4, PDF는 U8 |
| US4.1 | U4, U3, U8 | 발행 트랜잭션은 U4, 그 안의 조각 나누기는 U3, PDF 선택·사본은 U8 |
| US5.2 | U4, U8 | 발행본·사본 삭제는 U4, S3 발행본 접두어 삭제는 U8(PDF가 있을 때) |
| US6.2 | U5, U3 | 답 생성·SSE는 U5, 색인 상태·검색은 U3 |
| US6.3 | U1, U2 | 인용 연결은 U1, 기계 대조·버림·출처 표시는 U2 |

모든 Unit이 쓰는 공통 조건(링크 조건 판정, 연쇄 삭제, 하루 실행 제한, 동의)은 해당 계약을 제공하는 Unit의 행에 두고, 쓰는 Unit은 계약 의존으로 따른다([unit-of-work-dependency.md](unit-of-work-dependency.md)).

## Unit 안의 구현 순서

| Unit | 순서 |
|---|---|
| U1 | 인용 단위 넘기기 → 인용 보존 → 원문 위치 연결 → 거부 사례 처리 |
| U2 | 공용 계약 → AI 근거 검사 → AiRun·처리 시한 → 하루 제한·동의 → FileStorage(로컬) → 탈퇴 → 시작 안내·로그인 대상 → 통합 확인 진행 |
| U3 | 조각 나누기·위치 → 임베딩 작업·색인 상태 → 의미 검색 → [검색 다시 준비] |
| U4 | Catch 설명·텍스트 자료 → 발행(선택·공개 전환·조각 나누기 호출) → 링크 조건·열람 → 중지·만료·삭제 → 발행 후 확인 |
| U5 | 질의응답(SSE·질문 횟수) → 기본 요약 → RAG 평가 |
| U6 | OAuth 연결·해제 → 본인 조회 도구 → 빈도 제한 → 실제 Claude 연결 확인 |
| U7 | 저장소 등록 변경·수집 상한 → 실제 분석 확인 |
| U8 | PDF 업로드·S3 → 글 추출·수신 → 발행 사본·복사 → 열람·읽을 수 없는 쪽 |
| U9 | 받은 링크 읽기 도구 → "Claude에서 분석하기" 버튼·작성자 안내 |
| U10 | JD 관리 → JD 요약 |

## Coverage verification

- 현행 스토리 30개가 모두 하나 이상의 Unit에 배정됐다.
- 모든 Unit(U1~U10)에 행이 하나 이상 있다.
- 제외된 9월 스토리 ID는 구현 Unit이 없다.
