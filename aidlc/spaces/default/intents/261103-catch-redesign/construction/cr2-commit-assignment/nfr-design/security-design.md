# CR2 소속 저장 — 보안 설계

입력: `nfr-requirements/security-requirements.md`(NFR4.6·NFR4.7·NFR4.9·NFR4.10·NFR4.11), 기능 설계 `functional-design/functional-spec.md`·`rules.md`(BR3.1·BR3.6·BR3.7), 결정 기록 ADR-002, 지금 코드(`api/src/worker-context/`, `api/src/catches/registration-service.ts`, `worker/app/candidates/build.py`의 `_log`).

| ID | 설계 |
|---|---|
| NFR4.6 | 소속 표에 쓰는 코드는 등록 함수(`registerCandidates`) 안 한 곳이다. 이 함수는 결과 반영 트랜잭션 안에서만 돈다(지금 `TRANSACTION_REQUIRED` 검사). 새 컨트롤러·경로·관리 명령을 만들지 않는다. |
| NFR4.7 | 마이그레이션: `catch_asset`에 `UNIQUE (catch_id, owner_id)`를 먼저 더하고, `commit_assignment`의 `FOREIGN KEY (catch_id, member_id) REFERENCES catch_asset (catch_id, owner_id) ON DELETE CASCADE`를 건다. 소속 행의 `member_id`는 등록 입력의 `ownerId`(수신 기록과 대조한 회원)다. 회원·분석 요청을 직접 가리키는 외래 키는 두지 않는다. 시험은 다른 회원의 Catch ID로 쓴 행이 외래 키 위반으로 거부되는지 본다. |
| NFR4.9 | 맥락 조회 서비스는 시도에서 읽은 `memberId`·`repositoryId`(분석 요청의 저장소 ID)로만 소속을 읽는다. 요청 값으로 회원·저장소를 받지 않는다. worker 키 인증과 401·404·500 응답은 그대로다. 소속 조회가 실패하면 지금 오류 처리대로 500이고, 응답에 SQL·내부 메시지가 없다. |
| NFR4.10 | worker 후보 판정 종료 로그는 형식 문자열에 정수 칸 `assignedShas=%d assignedUnits=%d` 두 개만 더한다(SHA 값을 넣을 자리가 없다). api는 소속 관련 새 로그를 두지 않는다. 시험은 로그 줄에 40자 16진수가 없는지 본다. |
| NFR4.11 | 소속 기록은 `catch_asset`을 따라 연쇄 삭제된다. `catch_asset`은 지금처럼 회원 삭제·분석 요청 삭제로 연쇄 삭제된다. 탈퇴 서비스 코드는 바꾸지 않는다. `api/docs/member-withdrawal-deletion.md` 삭제 목록 표에 `commit_assignment` 행(지워지는 길: Catch)을 더하고, 탈퇴 연쇄 삭제 시험에 소속 기록 0건 단언을 더한다. |

## 신뢰할 수 없는 입력

- worker가 받는 `assignedCommitShas`는 api 응답이지만 형식을 검사한다: 배열, 원소는 소문자 16진수 40자, 중복 없음. 어긋나면 `CONTEXT_RESPONSE_INVALID`이고 응답 원문을 예외·로그에 옮기지 않는다(지금 해석 규칙).
- api가 받는 `ownCommitShas`는 계약 YAML 검사(1~3,000개, 형식, 중복 없음)를 지나야 등록에 쓰인다.

## 범위 밖

- 소속 기록 암호화·접근 감사 로그는 두지 않는다(요구사항에 근거 없음).
