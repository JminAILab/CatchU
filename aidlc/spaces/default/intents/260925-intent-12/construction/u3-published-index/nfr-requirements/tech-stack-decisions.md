# U3 발행본 색인·검색 — 기술 선택

## Sources

작성일: 2026-10-27. 입력: [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U3 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 C02·C07·NFR2, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-08·C-09(`api/src/published-index`), [보안 점검](../../../../../../../docs/CatchU_security_checks.md) 「외부 호출」·「의존성 추가·갱신」, `api/README.md`(pgvector가 든 PostgreSQL 16), [비기능 질문·답변](nfr-requirements-questions.md).

## 선택

| 영역 | 선택 | 이유 |
|---|---|---|
| 위치 | api(NestJS, TypeScript)의 `api/src/published-index` 모듈 | C-08·C-09가 정한 자리, ADR-005. 새 배포 단위를 만들지 않는다 |
| 저장 | PostgreSQL 16 + pgvector. `published_chunk.embedding`은 1024차원 벡터 칸, 거리는 코사인. 근사 색인 없음. 마이그레이션은 기존 TypeORM 마이그레이션 방식으로 U3 PR에 넣는다 | C02, C07(로컬·CI 이미지는 pgvector 판, RDS 확장은 팀장), scalability-requirements NFR4.4 |
| 임베딩 제공자 | Voyage AI `voyage-4-lite`, 1024차원. 문서는 문서용 입력, 질문은 질문용 입력 | 기능 설계 Q2, NFR2 |
| 전송 | SDK 없이 HTTPS 요청 하나. 주소는 코드 상수. U1의 `createGuardedFetch`(redirect 금지·응답 본문 상한)를 상한 8 MiB로 불러 쓰고 U1 파일은 고치지 않는다. 시간 제한 문서 30초·질문 10초, 재시도 0, 묶음 128개 | security-requirements NFR2.2, performance-requirements NFR4.1, Q1·Q2 |
| 백그라운드 | C-02 `AiRun`에 `EMBED_PUBLICATION` 처리기 등록. U2 구현 전에는 C-02 모양의 합성 AiRun으로 개발·시험 | C-02, 기능 설계 「다른 Unit에 넘기는 것」 |
| 키·합성 제공자 | `CATCHU_EMBEDDING_API_KEY`. `development`·`test`에서 키가 없을 때만 결정적 합성 제공자 | security-requirements NFR1.3, C07 |
| 시험 | api의 기존 시험 묶음과 테스트 DB. S1~S11은 합성 제공자로 늘 돌고, S12(실제 Voyage)는 키가 있을 때만 돈다. 커버리지 측정은 팀장이 넣은 서비스별 명령을 쓴다 | 기능 설계 「주요 시나리오와 확인」, team.md Testing Posture |
| 의존성 | 새 런타임 의존성 없음(Voyage SDK·HTTP 클라이언트를 더하지 않음). pgvector 벡터 값의 DB 입출력에 라이브러리가 필요해지면 정확한 버전과 잠금 파일을 함께 바꾸고 PR에 이유를 적는다 | 보안 점검 「의존성 추가·갱신」, Q1 |

## 채택하지 않은 것

- Voyage 공식 TypeScript SDK: 네 가지 외부 호출 상한을 지키는지 따로 확인해야 하고 의존성이 는다(Q1).
- 별도 벡터 저장소: C02·C07이 pgvector로 정했다.
- 근사 색인: scalability-requirements의 이유.

## Assumptions & Open Questions

- 미결(코드 착수 첫 단계, 마이그레이션 PR 전): `voyage-4-lite`의 정확한 모델 이름·1024차원 지원·입력 종류 이름, 한 번 호출의 글 개수·토큰 상한(묶음 128개가 안에 드는지), 자료 보존·학습 사용 조건(계정 설정의 학습 사용 거부 여부)을 Voyage 공식 문서로 확인해 이 절에 적는다. 다르면 기능 설계 Q2·비기능 Q2를 다시 묻는다(security-requirements NFR2.1).
- [assumption] `createGuardedFetch`가 상한 인자를 받는 지금 모양(`createGuardedFetch(baseFetch, maxBodyBytes)`)을 유지한다고 본다. U1 쪽에서 바뀌면 그 모양을 따른다.
