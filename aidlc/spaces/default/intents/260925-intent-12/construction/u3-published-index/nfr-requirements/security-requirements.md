# U3 발행본 색인·검색 — 보안 요구사항

## Sources

작성일: 2026-10-27. 입력: [U3 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U3 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR1·NFR2·FR6.4·FR20.3·C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-07·C-08·C-09·C-10, [보안 점검](../../../../../../../docs/CatchU_security_checks.md)의 「설정·개발용 기능」·「외부 호출」·「로그·오류 응답」·「LLM·검색 기능」, [비기능 질문·답변](nfr-requirements-questions.md) Q1~Q3.

## 범위

U3은 HTTP 경로가 없고 회원 요청을 직접 받지 않는다. 받은 사람·작성자 확인과 링크 조건 판정은 호출 Unit(U4·U5·U10)이 C-10으로 먼저 한다. U3의 보안 요구사항은 검색 범위, 색인에 들어가는 자료, 비밀값, Voyage 외부 호출, 기록에 관한 것이다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR1.1 | `search`는 넘겨받은 `publicationId`의 조각만 비교하고 다른 발행본 조각을 섞지 않는다. 자료를 빼거나 넓히는 인자를 두지 않는다. U3은 링크 조건을 판정하지 않으며, 호출자가 C-10 판정을 통과한 뒤에만 부른다는 것을 공개 함수 설명에 적는다 | 발행본 두 개로 섞이지 않음을 확인하는 시험(기능 설계 S8) | NFR1, FR4.4, C-09, C-10 rule, 기능 설계 BR5.2 |
| NFR1.2 | 색인은 화면과 같은 범위를 따른다. 조각은 발행 사본의 C-07 필드만 쓰고 AI 설명 초안·제목은 넣지 않으며, 발행본 삭제·작성자 탈퇴 때 함께 지워진다(reliability-requirements NFR5.1). 색인용 사본을 따로 두지 않는다 | 기능 설계 S1·S11 | 보안 점검 「LLM·검색 기능」(검색 색인도 화면과 같은 권한·숨김·삭제), FR6.4, 기능 설계 BR1.1 |
| NFR1.3 | Voyage 키는 환경변수 `CATCHU_EMBEDDING_API_KEY`에서만 읽는다. SDK가 스스로 읽는 `VOYAGE_API_KEY`는 쓰지 않는다. `NODE_ENV`가 `development`·`test`가 아니고 키가 없으면 기동을 멈추고, `development`·`test`에서 키가 없을 때만 합성 제공자를 쓴다. 키는 코드·시험 자료·로그·오류 메시지에 넣지 않는다 | 키 없음 + production에서 기동 거부, 키 없음 + test에서 합성 제공자 선택 시험. 로그·오류에 키가 없는지 확인 | NFR1, 보안 점검 「설정·개발용 기능」, `api/.env.example`(#389), 기능 설계 BR6.1 |
| NFR2.1 | 임베딩은 Voyage AI로만 한다. 모델 `voyage-4-lite`, 1024차원. 코드 착수 때 공식 문서로 모델 이름·차원·한 번 호출 상한·자료 보존과 학습 사용 조건을 확인해 기술 선택 문서에 적고, 그 뒤에 마이그레이션을 쓴다 | 착수 첫 확인 결과 기록 | NFR2, C02, 요구사항 「개발 담당 결정」, 기능 설계 Q2 |
| NFR2.2 | Voyage 외부 호출 네 가지 상한을 지킨다. ① 임베딩 주소를 코드에 고정하고 환경변수로 바꾸지 못하게 한다. ② redirect를 따라가지 않는다. ③ 응답 본문은 압축을 푼 뒤 기준 8 MiB까지만 받고 넘으면 그 자리에서 끊어 제공자 오류로 낸다. ②③은 U1의 `api/src/ai-generation/guarded-fetch.ts` `createGuardedFetch`를 재사용하며 U1 파일은 고치지 않는다. 이 함수의 기본 상한은 256 KiB이므로 부를 때 상한 8 MiB를 반드시 인자로 넘긴다. ④ 시간 제한은 문서 임베딩 30초·질문 임베딩 10초, 재시도 0(performance-requirements NFR4.1). `createGuardedFetch`는 시간 제한을 하지 않으므로 U3 호출부가 `AbortSignal.timeout`을 요청에 넘겨 걸고, 이 제한은 응답 본문 읽기까지 덮는다. SDK 없이 HTTPS 요청 하나로 부른다 | 주소 고정·redirect 응답·본문 상한 초과·시간 초과를 합성 응답으로 시험. 상한 8 MiB를 넘겨 부르는지(256 KiB를 넘고 8 MiB 이하인 응답을 받는지), 본문 읽기 도중 시간 초과도 제공자 오류가 되는지 시험 | 보안 점검 「외부 호출」, Q1·Q2 |
| NFR2.3 | Voyage에는 조각 글(문서용)과 질문 글(질문용)만 보낸다. 다른 회원 자료·비밀값·발행 사본 밖 글을 보내지 않는다. 구직자 자료는 첫 이용 동의 아래 그대로 보내고 서비스가 개인정보를 가리지 않는다. Catch의 GitHub 기록 부분은 10월 분석의 가리기를 거친 사본이다 | 요청 본문 구성 시험 | FR20.3, FR1.7, 보안 점검 「LLM·검색 기능」, C-04(동의는 발행 때 U4가 확인) |
| NFR2.4 | 외부 호출 횟수에 상한이 있다. 문서 임베딩은 발행본마다 `ceil(조각 수 / 128)`번이고 발행 크기 상한은 U4가 발행 때 다시 확인한다. [검색 다시 준비]는 `FAILED`일 때만 받는다. 질문 임베딩은 질문마다 한 번이다. 질문 횟수의 상한은 호출 Unit이 지킨다. 링크 질문은 U5의 링크당 하루 제한, JD 요약 경로는 FR6.6의 계정당 하루 제한이 상한이다. U3은 호출 횟수를 따로 세지 않는다. 색인이 `DONE`이 아니거나 질문이 비었으면 부르지 않는다 | 기능 설계 S7·S9·S10 | 보안 점검 「LLM·검색 기능」(호출 횟수·비용 상한), FR6.6, ADR-007 |

## 위협과 대응

| 위협 | 대응 |
|---|---|
| 다른 발행본·넣지 않은 자료가 검색 결과로 나감 | NFR1.1·NFR1.2, 호출자의 C-10 판정 |
| 지운 발행본의 조각이 남아 검색됨 | NFR1.2, reliability-requirements NFR5.1 |
| 키 노출, 배포 환경에서 합성 결과를 실제처럼 씀 | NFR1.3, observability-requirements NFR6.3 |
| 설정으로 호출 주소를 바꿔 자료를 다른 곳으로 보냄 | NFR2.2 ① |
| redirect·큰 응답·느린 응답으로 메모리·시간 소모 | NFR2.2 ②③④ |
| 반복 다시 준비·빈 질문으로 비용 소모 | NFR2.4 |
| 조각·질문 글이 로그에 남음 | observability-requirements NFR6.3 |
