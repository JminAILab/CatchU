# U4 발행·링크 — 확장성 요구사항

## Sources

작성일: 2026-10-29. 입력: [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U4 업무 규칙](../functional-design/rules.md)(rules)의 BR4.1·BR4.8·BR4.9·BR6.3·BR8.6, 10월 api 문서 `api/docs/share-links.md`, 배포 문서 `deploy/README.md`·`deploy/compose.single.yaml`·`deploy/aws/scripts/deploy.sh`, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·NFR5·C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「공통 전제」의 배포 단위·에러 대응 최소선 6, [성능 요구사항](performance-requirements.md).

## 범위

NFR4는 시연 규모를 기준으로 한다. U4는 확장 장치(캐시·샤딩·자동 확장)를 새로 두지 않는다. 아래는 규모가 커질 때 무엇이 늘고 무엇을 막는지에 관한 기준이다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.8 | U4는 기존 api(NestJS)·web(Next.js) 배포 단위 안에 둔다. 새 서비스·worker 변경·새 저장소를 만들지 않는다. 배포 환경(EC2 개발 서버, 12월 EKS)의 복제 수·자원은 팀장 공용 기반 몫이다 | 코드 검토 | 기능 명세 「범위」, C02, C07, team.md Deployment |
| NFR4.9 | 발행본·링크 상태는 DB에만 둔다. 링크 판정·grant 확인은 서버 메모리 상태 없이 동작해 api가 여럿이어도 같은 결과를 낸다(grant는 서명 검증, 판정은 DB) | 코드 검토 | BR6.1, BR6.2 |
| NFR4.10 | 데이터 증가는 작성자 행동에만 비례한다. 발행본 하나는 항목 최대 20개·전체 글 60,000자(임시)이고, 유효 링크 개수 한도·같은 제목 금지는 두지 않는다. 발행본은 자동 파기하지 않으므로 작성자 삭제·탈퇴 전까지 남는다 | 해당 없음(정책) | BR4.1, BR4.5, BR4.9, BR8.6, NFR5 |
| NFR4.11 | 목록은 10월 cursor 방식(발행 시각 최신순)으로 나눠 읽는다. 한 번에 모든 발행본·자료를 읽지 않는다 | 목록 다음 페이지 시험 | BR8.1, 기능 명세 「작성자 API」 |
| NFR4.12 | 동시 요청·재전송은 따로 막지 않는다. 재전송으로 발행본이 둘 생기고 하루 횟수를 2회 쓸 수 있는 것은 한계로 기록한다(에러 대응 최소선 6). web은 발행 중 버튼을 막는다 | 해당 없음(한계 기록) | BR4.9, NFR6 |
| NFR4.13 | 발행 빈도 제한기(`RequestRateLimiter`)와 unlock 시도 제한기(`UnlockLimiter`·`LinkLimiter`)는 10월 구현 그대로 **api 프로세스 메모리**에 기록한다(기록 상한 각 1만 개). 이 방식은 api가 하나라는 배포 전제에서만 정한 한도대로 동작한다. 실제 배포 전제와 대조한 결과는 표 아래와 같고, 둘 다 api 하나다. 한계: api가 다시 뜨면 기록이 초기화되고, api가 N개면 한도가 최대 N배로 느슨해진다. `Recreate`는 장애 때 대체 실행과의 겹침을 막지 않는다 | 배포 설정에서 api 하나 전제가 유지되는지 확인. 한도 자체는 10월 시험(`test/unlock-limiter.test.cjs`, `test/db/public-links-unlock.test.cjs`)과 성능 NFR4.4 시험 | `api/docs/share-links.md` 파일 표(`request-rate-limiter.ts`·`unlock-limiter.ts` 「프로세스 메모리」)와 「기록 상한」, BR4.8, BR6.3 |

**배포 전제 대조 (NFR4.13)**

| 환경 | api 개수 전제 | 근거 |
|---|---|---|
| 개발 서버(EC2, 11/13 1차 통합 확인) | 1개. 컨테이너 이름을 고정해 같은 호스트에서 api를 둘 띄우거나 `--scale`로 늘릴 수 없다 | `deploy/compose.single.yaml` |
| EKS(12월 최종) | `replicas: 1`, 업데이트 `Recreate`, 자동 확장(HPA) 없음. 배포 스크립트가 복제 수를 1로 채운다 | `deploy/README.md` 「EKS 실행 파일을 쓸 때 지킬 조건」, `deploy/aws/scripts/deploy.sh`(`__REPLICAS__` → 1) |

api 복제 수를 늘리는 것은 공유 인프라 변경이라 팀장 몫이다(team.md Deployment). 늘리기로 하면 그 결정 때 두 제한기의 저장 방식(공유 저장소로 옮길지)을 함께 정해야 한다. U4는 이번 범위에서 저장 방식을 바꾸지 않는다.

## 하지 않는 것

- 부하 시험·용량 계획·자동 확장 기준은 두지 않는다(NFR4, NFR6).
- 조각·임베딩 저장량(U3), 요약 저장량(U5)은 각 Unit 몫이다.

## Assumptions & Open Questions

- 전체 글 상한 60,000자는 임시값이다(OQ-U4-4). 값이 바뀌면 NFR4.10의 발행본 하나당 크기도 같이 바뀐다.
