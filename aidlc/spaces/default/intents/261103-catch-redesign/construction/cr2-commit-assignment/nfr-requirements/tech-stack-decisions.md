# CR2 소속 저장 — 기술 선택

입력: CR2 기능 설계(`entities.md`), 요구사항 NFR6·NFR7, 코드 지식 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`, 지금 코드(api TypeORM 엔티티·마이그레이션, worker 설정).

새로 들이는 의존성은 없다. 모두 지금 쓰는 것으로 한다.

| ID | 결정 | 이유 |
|---|---|---|
| NFR6.4 | 소속 표와 `catch_asset`의 (catch_id, owner_id) 유일 조건은 api의 TypeORM 엔티티와 새 마이그레이션 하나로 만든다. 지금 엔티티·마이그레이션 규약(이름이 정해진 제약, 연쇄 삭제 외래 키)을 따른다. | 지금 api DB 변경 방식이다. 엔티티와 실제 DDL이 같은지 보는 기존 시험이 새 표도 잡는다. |
| NFR6.5 | 소속 쓰기는 PostgreSQL의 「충돌하면 아무것도 하지 않기」 삽입으로 한다(지금 Catch 등록이 쓰는 방식, `orIgnore`). | 충돌이 트랜잭션을 오류 상태로 만들지 않아, 이미 있는 소속을 건너뛰면서 한 트랜잭션을 이어 갈 수 있다(NFR4.2·NFR4.3). |
| NFR6.6 | worker의 새 칸 해석과 빼기는 표준 라이브러리만 쓴다. 맥락 조회 응답 상한은 설정 기본값을 바꾼다(NFR6.3). | 새 패키지가 필요 없다. |
| NFR7.1 | 빼기 규칙 설명은 새 worker 문서(`worker/docs/commit-assignment.md`)에 쓰고, 후보 판정 문서(31,112 B)·생성 문서(34,879 B)에는 링크와 한두 줄만 더한다. | 두 문서가 크기 상한(36,000 B)에 가깝다. 문서 크기 검사를 통과해야 한다. |
