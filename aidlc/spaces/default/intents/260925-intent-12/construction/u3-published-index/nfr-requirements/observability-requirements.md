# U3 발행본 색인·검색 — 관측 요구사항

## Sources

작성일: 2026-10-27. 입력: [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U3 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR6·FR19.2, [보안 점검](../../../../../../../docs/CatchU_security_checks.md) 「로그·오류 응답」, team.md Walking Skeleton·Code Style, [비기능 질문·답변](nfr-requirements-questions.md) Q3.

## 범위

NFR6은 별도 관제 화면을 만들지 않는다고 정했다. U3의 관측은 api 로그 몇 줄과, 실제 Voyage 연결 확인을 합성 결과와 구분해 보고하는 것이다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR6.1 | 실제 Voyage 연결 확인(기능 설계 S12)은 `CATCHU_EMBEDDING_API_KEY`가 셸 환경변수로 있을 때만 돌고, 없으면 통과가 아니라 미실행으로 보고한다. 합성 제공자로 통과한 시험을 실제 임베딩 성공으로 보고하지 않는다. S12 결과는 '최소 연결 첫 결과' 승인 자료로 쓴다 | S12 실행 기록, PR 검사 보고 | NFR6, FR19.2, team.md Walking Skeleton, 납품 계획 B3 |
| NFR6.2 | 기록 항목: 임베딩 작업은 발행본 ID, 조각 개수, 묶음 수, 결과 상태(`DONE`·`FAILED`·버림)와 버린 이유, Voyage 응답의 토큰 수 합, 걸린 시간을 남긴다. 실패면 오류 종류와 HTTP 상태를 더한다. 검색은 실패할 때만 발행본 ID, 오류 종류, HTTP 상태, 걸린 시간을 남긴다. [검색 다시 준비]는 발행본 ID와 결과(`REQUEUED`·`NOT_FAILED`, 등록 실패 여부)를 남긴다 | 로그 내용 확인 시험 | Q3, 기능 설계 BR6.2, 에러 대응 최소선 1 |
| NFR6.3 | 로그와 오류 메시지에 키·조각 글·질문 글·사본 내용을 넣지 않는다. NFR6.2의 정해진 칸만 남긴다. Voyage 오류 응답 본문은 보낸 글을 되돌려 줄 수 있으므로 로그·오류 메시지에 옮기지 않고 HTTP 상태와 오류 종류만 남긴다 | 로그 내용 확인 시험(질문 임베딩 실패 S10 포함). 보낸 글을 담은 합성 오류 응답으로 그 글이 로그·오류 메시지에 없는지 확인 | 보안 점검 「로그·오류 응답」, team.md Code Style, 기능 설계 BR6.2 |

## 채택하지 않은 것

- 지표 수집·경보·대시보드: NFR6이 별도 관제 화면을 만들지 않는다고 정했다.
- 정상 검색마다 남기는 기록: 질문이 많아도 비용·지연은 실패 기록과 임베딩 작업 기록으로 충분하다.
