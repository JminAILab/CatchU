# CR2 소속 저장 — 성능 설계

입력: `nfr-requirements/performance-requirements.md`(NFR4.4·NFR4.8), `nfr-requirements/tech-stack-decisions.md`(NFR6.5), 기능 명세 `functional-design/functional-spec.md` W1, 지금 코드(`api/src/catches/registration-service.ts`의 `orIgnore` 삽입).

| ID | 설계 |
|---|---|
| NFR4.4 | 등록 함수는 열쇠마다 Catch를 찾은 뒤, 그 열쇠 후보들의 `ownCommitShas` 합집합을 1,000행씩 잘라 충돌 무시 삽입을 부른다(한 묶음 = 쿼리 하나, 값 5개×1,000 = 5,000개로 PostgreSQL 매개변수 한도 65,535 안). 3,000행이면 쿼리 세 번이다. 코드 생성 때 3,000개 SHA 후보 등록에 더해진 시간을 한 번 재서 `code-summary.md`에 적는다. 이 값은 참고 기록이고 통과 조건이 아니다. |
| NFR4.8 | 맥락 조회는 `SELECT commit_sha FROM commit_assignment WHERE member_id = $1 AND github_repository_id = $2` 한 번이다. 유일 조건 (member_id, github_repository_id, commit_sha)이 만드는 색인의 앞 두 열로 찾는다. 새 색인은 없다. 응답 배열의 순서는 정하지 않는다(계약 C1). |

## 쓰지 않는 것

- 캐시·비동기 쓰기·별도 작업 큐를 두지 않는다. 소속은 등록과 같은 트랜잭션에서 바로 쓴다(ADR-001).
- worker 쪽 빼기는 메모리 안 집합 대조(SHA 수에 비례)라 따로 최적화하지 않는다.
