# CR1 규칙 쪽 Catch — 논리 구성 요소

입력:
- 구성 요소 `inception/domain-design/components.md`
- 기능 설계 `construction/cr1-readable-catch/functional-design/functional-spec.md`
- 비기능 요구사항 `construction/cr1-readable-catch/nfr-requirements/`
- 계약 `inception/contract-design/contract-summary.md`

CR1은 새 배포 단위나 인프라 구성 요소를 만들지 않는다. 아래는 CR1이 고치는 논리 구성 요소와, 비기능 설계가 적용되는 곳이다.

| 논리 구성 요소 | 배포 단위 | 고치는 것 | 적용되는 비기능 설계 | 실패가 미치는 범위 |
|---|---|---|---|---|
| CandidateGrouping(`worker/app/candidates`) | worker | 나누기 삭제, 기록의 글 칸, 작업 사실 | 결정성(NFR4.1·4.2), 가리기 검사 사용 | 분석 하나의 후보 글. 예외가 나면 그 분석이 실패한다(지금과 같음) |
| 가리기 검사(`worker/app/redact.py`, 옮김) | worker | 위치만 옮김 | 검사 한 곳(보안 확인 사항) | 후보 판정과 생성 둘 다. 순수 함수라 외부 장애가 없다 |
| DraftGeneration(`worker/app/generation`) | worker | 제목 우선순위, 고쳐 쓰기 건너뜀, 재료 종류·묶음 | NFR1.1, NFR2.1, NFR4.1 | 후보 하나의 제목·설명 초안. 생성 실패는 지금처럼 그 후보만 실패로 표시한다 |
| SeekerCatchScreens(`web/src/features/assets`) | web | 목록 카드 2줄, 안내 낱말 | 화면 글자 그리기(보안 확인 사항) | 화면 표시만 |
| RecipientScreens(`web/src/features/recipient`) | web | 목록 카드 2줄, 안내 문장 | 화면 글자 그리기 | 화면 표시만 |
| worker 문서 | — | 새 문서·절 정리 | NFR7.1 | 없음 |

## 공유 자원

- 생성 요청의 크기 예산(24,000 B / 32,000 B)과 요청 마감은 지금 생성 단계의 것을 그대로 함께 쓴다. CR1은 새 공유 자원을 만들지 않는다.
- 결과 메시지 계약(판본 "2")은 바꾸지 않는다. api 쪽 구성 요소(CatchRegistry·ResultReceiving)는 고치지 않는다.

## 격리

- worker와 web 변경은 서로 기대지 않는다. 계약이 그대로이므로 따로 배포할 수 있다.
- 가리기 검사 모듈은 다른 worker 모듈을 불러오지 않는다. 그래서 후보 판정과 생성 사이에 불러오기 순환이 생기지 않는다.
