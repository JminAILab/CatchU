# NC3 다시 볼 곳 사실과 작업 시각 — 논리 구성 요소

입력:
- NFR 요구 `construction/nc3-revisit-facts/nfr-requirements/` 여섯 문서, 기술 스택 결정 `tech-stack-decisions.md`
- 기능 명세 `construction/nc3-revisit-facts/functional-design/functional-spec.md`
- 구성 요소 `inception/domain-design/components.md`, 계약 `inception/contract-design/contract-summary.md` C2·C4·C5

새 배포 단위·인프라 자원은 없다. 새 코드 구성 요소는 worker의 RevisitFacts 하나다. 나머지는 기존 구성 요소 안의 바뀌는 자리다.

| 구성 요소 | 서비스·자리 | 바뀌는 것 | 실패 범위 | 지키는 NFR |
|---|---|---|---|---|
| Collection | worker `app/collection/records.py`·`normalize.py` | `ChangedFile.blob_sha` 하나 | 바뀌지 않음(값이 없으면 null) | NFR1.1 |
| CandidateGrouping | worker `app/candidates/build.py` | 합친 뒤 작업 시각 두 칸 | 기록 없음은 지금 결함 갈래(분석 실패) | NFR8.3 순서, BR4.1 |
| RevisitFacts(새것) | worker `app/candidates/revisit.py`(새 파일, 순수 함수와 상수) | 규칙 다섯, 좁은 산출물 목록, 상한·순서, 켜진 규칙 상수 | 후보 하나(예외면 그 후보 사실만 빔) | NFR1.3, NFR1.5, NFR8.3, NFR8.4 |
| AnalysisProcessing | worker `app/processing/live.py`·`result.py`·`fake_generator.py`, `worker/fixtures/m1-synthetic/` | RevisitFacts 부르기와 실패 로그, Result "4", 합성 템플릿 새 칸 | 결과 메시지 하나 | NFR4.3, NFR7.3 |
| 결과 계약 | `api/contracts/repository-analysis/worker-messages.yaml` | Result "4", Candidate 필수 칸 셋, RevisitFact 상한 | 계약 위반 결과는 거부 | NFR1.4, NFR7.3 |
| ResultReception·Catches 등록 | api `analysis-receiver/`, `catches/registration-batch.ts`·`registration-service.ts`·`new-catch-content.ts` | 종류별 개수·소속·시각 순서 검사, 새 Catch INSERT에 칸 셋 | 결과 하나(등록 입력 오류면 그 결과 전체) | 보안 설계 2절 |
| Catches 저장 | api 마이그레이션 하나, `catches/entities/catch-asset.entity.ts` | 칸 셋과 검사 둘 | 등록 트랜잭션 | NFR8.2, NFR7.1 |
| Catches 읽기 | api `catches/catch-reader.ts`·`owner-catch-response.ts`·`owner-catch-input.ts`·`owner-catch-store.ts`, `public-catch-store.ts`(커서 함수만 나눔) | 응답 `revisitFacts`, 정렬, 커서 판본 3, 공개 커서 그대로 | 요청 하나 | NFR2.1, NFR7.2 |
| AssetsScreen | web `features/assets/catch-api.ts`·`types.ts`·`assets-view.tsx`(새 칸 부품은 같은 폴더) | 응답 검사, 「다시 볼 곳」 칸, 링크 함수 | 상세 화면 하나 | NFR5.1, NFR5.2, NFR6.1 |
| AnalysisNotice | api `analysis-intake/analysis-notice.ts` | 4절 한 줄(PR에서 팀장 승인) | 고지 글 | FR15.2 |

## 경계와 격리

- **본인만 보기의 경계:**
  - 새 칸은 `READ_COLUMNS`를 쓰는 본인·공개 읽기만 닿는다. 공개 응답은 허용 칸 골라 담기로 막는다.
  - 발행·Claude 연결은 자기 질의라 닿지 않는다(보안 설계 1절).
- **실패 격리:** RevisitFacts 예외는 그 후보 사실까지만 번진다. 다른 후보와 결과는 영향이 없다. 작업 시각·수집·생성 결함은 지금 갈래 그대로다.
- **함께 배포:** 결과 계약을 api·worker가 함께 쓰므로 두 서비스는 같은 PR·같은 배포다.
- **공유 자원:** PostgreSQL `catch_asset` 표(칸 셋 더함), BullMQ 결과 큐(메시지 판본만 바뀜). 새 공유 자원은 없다.

## Sources

- `construction/nc3-revisit-facts/nfr-requirements/` 여섯 문서
- `construction/nc3-revisit-facts/functional-design/functional-spec.md`
- `inception/domain-design/components.md`
- `inception/contract-design/contract-summary.md` C2·C4·C5
- `construction/nc3-revisit-facts/nfr-design/security-design.md`, `reliability-design.md`
