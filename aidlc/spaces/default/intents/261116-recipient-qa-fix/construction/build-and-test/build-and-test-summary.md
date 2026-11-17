# 빌드와 시험 요약 — #559

> `api/test/rag-answer/qna-controller.test.cjs`는 테스트 DB가 필요하다(코드 생성 리뷰 R-04). 돌리는 방법은 `build-instructions.md` 첫 줄에 있다.

## 상태

- **빌드**: 성공(api·web). lint·typecheck 오류 0.
- **시험**
  - 범위 시험: api 76/76, web 100/100 통과
  - web 전체: 1,063/1,063 통과
  - api 전체: 실패 4건으로 명령이 실패했다(종료 코드 1). 4건 모두 이번 변경 밖이고, 다시 돌려 통과했다.
    - 3건(u7 체인 시험)은 이 폴더에 worker 파이썬이 없어서였다.
    - 1건(신뢰 프록시 시험)은 부하 때 요청 시간 초과였다.
- **질문 10개 다시 재기**: 한 번 잼, 팀장 판정을 마쳤다. 이슈 #559 완료 기준 가운데 (a)·(b)·(e) 셋은 못 채워 한계로 기록했다.
- **실패 처리**: 팀장이 실패를 받아들였다(Accept failure). 지시와 상한을 더 고치지 않는다.

## 만든 시험 안내

- Minimal 시험 전략이라 통합·성능·보안 시험 안내는 따로 만들지 않았다. 단위 범위 시험은 코드 생성 단계의 `unit-test-instructions.md`에 있다.
- `build-instructions.md`: 준비·빌드·확인·시험·다시 재기 방법, 막힐 때

## 커버리지

- 프로젝트·이 일에 정한 커버리지 목표는 없다. bugfix 범위는 목표 회귀 시험과 기존 시험 통과가 의무다.

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-REG | Testing Contract `scope_floor` | 목표 회귀 시험 | S1~S17 범위 시험 통과 | `test-results.md` 「시험」 | 빌드와 시험 | Met |
| TC-GREEN | Testing Contract `scope_floor` | 기존 시험 모두 통과 | api 전체 명령 실패 4(환경·부하), 다시 돌려 통과. web 전체 통과 | `test-results.md` 「api 전체 시험 실패 4건」 | 빌드와 시험 | Not Met(받아들임) |
| TC-STRATEGY | Testing Contract `strategy_volume` | 요구마다 시험, 부품마다 정상 경로 | 새 시험 2파일 + 기존 5파일에 사례 추가 | `construction/code-generation/code-summary.md` | 코드 생성 | Met |
| NFR1-RUN | 요구사항 NFR1 | 한 번 다시 재고 사람이 판정 | 잼·판정·기록 | `api/docs/rag-evaluation/2026-11-16-remeasure.md` | 빌드와 시험 | Met |
| NFR1-a | NFR1(a) | 3번 규모 인용 | 못 채움 | 같은 기록 「#559 완료 기준 판정」 | 빌드와 시험 | Not Met(한계) |
| NFR1-b | NFR1(b) | 7번 어느 커밋인지 | 못 채움(나아짐) | 같음 | 빌드와 시험 | Not Met(한계) |
| NFR1-c | NFR1(c) | 9·10번 Catch 섞임 없음 | 채움 | 같음 | 빌드와 시험 | Met |
| NFR1-d | NFR1(d) | 단정한 답 1개 이하 | 1개 | 같음 | 빌드와 시험 | Met |
| NFR1-e | NFR1(e) | 첫 항목이 답이 아닌 답 1개 이하 | 3개 | 같음 | 빌드와 시험 | Not Met(한계) |
| NFR1-f | NFR1(f) | 답 실패 0개 | 0개 | 같음 | 빌드와 시험 | Met |
| NFR1-g | NFR1(g) | 오귀속 0, 비뒷받침 1 이하 | 0 / 1 | 같음 | 빌드와 시험 | Met |
| NFR2 | 요구사항 NFR2 | 출처 강조 동작 유지 | 관련 시험 통과(Node) | `test-results.md` | 빌드와 시험 | Met(Node 시험 근거) |
| NFR3 | 요구사항 NFR3 | 로그는 수와 이름만 | 시험 통과, 평가 기록 표 확인 | `test-results.md` | 빌드와 시험 | Met |
| NFR4 | 요구사항 NFR4 | 보내는 줄 40줄 이하 | 시험 통과, 다시 재기에서 상한 동작 | `test-results.md` | 빌드와 시험 | Met |
| CI | Testing Contract | - | - | 계획에 CI Pipeline 단계 없음 | - | N/A(the plan runs no CI Pipeline) |

## 준비 상태

- **빌드**: 준비됨
- **시험**: 준비됨. 다만 이슈 완료 기준 (a)·(b)·(e)는 한계다.
- **배포**: `dev` PR 병합 뒤 기존 개발 서버 자동 배포로 한다. PR은 아직 열지 않았다.

## 알려진 한계와 남은 일

- 못 채운 완료 기준 셋을 한계로 남긴다. 지시와 상한을 더 고치지 않는다.
  - 3번 규모 인용
  - 7번 커밋 식별값
  - 첫 항목이 답이 아닌 답 1개 이하
- **대조 버림이 늘었다**(1 → 5). 대조(fact)가 핵심 답 항목을 지우는 문제는 후속 이슈 #581로 넘긴다(팀장 결정).
- **작성자 주장을 사실처럼 쓴 문장 2개**(1번 첫째 항목의 뒷문장, 7번 셋째 항목의 앞문장)는 기록만 한다.
- **실제 브라우저 확인 없음**: 출처 강조와 항목 제목 표시는 Node 시험으로만 확인했다.
- **api 전체 시험 실패 4건**: 이 폴더에 worker 파이썬이 없어 u7 체인 시험 3건이 실패했고, 신뢰 프록시 시험 1건은 부하 때 시간 초과가 났다. 둘 다 이번 변경 밖이다.
- **PR 리뷰**: C-11 `itemTitleOf`를 받은 사람 화면 담당(팀원 3)과 맞춘다.
- **켜 둔 컨테이너**: `catchu-db-test`(5433), `catchu-nc3-measure-db`(55470)
