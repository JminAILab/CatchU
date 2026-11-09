# U3 발행본 색인·검색 — 비기능 요구사항 질문

입력: [U3 기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md), [요구사항](../../../inception/requirements-analysis/requirements.md)의 NFR1~NFR7·C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-02·C-08·C-09와 「에러 대응 최소선」, [보안 점검](../../../../../../../docs/CatchU_security_checks.md)의 「설정·개발용 기능」·「외부 호출」·「로그·오류 응답」·「LLM·검색 기능」.

이미 정해진 것(다시 묻지 않음): 키 이름은 `CATCHU_EMBEDDING_API_KEY`(#389, `api/.env.example`)이고 SDK가 스스로 읽는 이름은 쓰지 않는다. 개발·시험이 아닌 환경에서 키가 없으면 기동을 멈춘다(기능 설계 BR6.1). 모델 `voyage-4-lite`·1024차원·코사인 거리, 처리 시한 10분, 자동 재시도 없음(기능 설계 Q2·Q3, BR2.5·BR5.3). 모델 이름·차원·한 번 호출 상한·자료 보존과 학습 사용 조건은 코드 착수 때 공식 문서로 확인한다(기능 설계 R-05는 감수). 처리 시간·가동률·복구 수치는 새로 만들지 않는다(NFR4). 키·조각 글·질문 글은 로그에 남기지 않는다(BR6.2).

## Q1. [보안] Voyage 호출에서 지킬 외부 호출 상한

보안 점검 「외부 호출」은 호스트를 코드에 고정하고 redirect를 따라가지 않으며 응답 크기·시간에 상한을 두라고 한다. U1(Claude 호출)은 주소 고정·redirect 금지·응답 본문 상한·시간 제한 네 가지를 지키기로 했다. 임베딩 응답은 숫자 배열이라 Claude 응답보다 크다(조각 128개면 JSON으로 약 2~3 MB).

A. U1과 같은 네 가지를 지킨다: Voyage 임베딩 주소를 코드에 고정하고(환경변수로 바뀌지 않음) redirect를 따라가지 않으며, 응답 본문을 압축을 푼 뒤 기준 8 MiB까지만 받고 넘으면 그 자리에서 끊어 제공자 오류로 낸다. 시간 제한은 Q2 값. SDK 없이 HTTPS 요청 하나로 부른다(의존성 추가 없음).
B. A와 같되 Voyage 공식 TypeScript SDK를 쓴다 — 요청 모양을 직접 맞출 일이 줄지만, SDK의 주소·redirect·크기 설정이 네 가지를 지키는지 따로 확인해야 하고 의존성이 하나 는다.
C. 시간 제한만 두고 나머지는 기본 동작에 맡긴다 — 가장 적게 만들지만 보안 점검 「외부 호출」 행을 지키지 못해 PR에 쟁점으로 남는다.
X. Other (please specify)

[Answer]: X. A로 하되 redirect 금지·응답 본문 상한은 새로 만들지 않고 U1의 api/src/ai-generation/guarded-fetch.ts의 createGuardedFetch를 상한 8 MiB로 불러 재사용한다(U1 파일은 고치지 않음). SDK 없이 HTTPS 요청 하나, 주소 코드 고정, 시간 제한은 Q2 값.

## Q2. [성능] 호출 시간 제한과 한 번에 보내는 조각 수

기능 설계 검토 R-01은 제공자 호출 시간 제한 값이 없다고 지적했다(기능 설계에서는 정하지 않고 둠). 질문 임베딩은 받은 사람이 기다리는 질의응답·JD 요약 경로에 있고, 문서 임베딩은 백그라운드다. 묶음이 크면 호출 수가 줄지만 한 번 실패에 다시 할 양이 커진다(재시도는 없음).

A. 문서 임베딩은 한 번에 조각 128개·호출당 30초, 질문 임베딩은 호출당 10초. 묶음 128개는 코드 착수 때 Voyage 한 번 호출 상한(글 개수·토큰)보다 작은지 확인한다.
B. 문서 임베딩 호출당 60초·질문 임베딩 20초(묶음 128개) — 느린 응답에 더 너그럽지만 받은 사람이 실패를 알기까지 오래 기다린다.
C. 문서 임베딩을 묶지 않고 발행본 전체를 한 번에 보낸다(호출당 60초) — 호출이 하나라 단순하지만 큰 발행본은 Voyage 한 번 호출 상한에 걸릴 수 있다.
X. Other (please specify)

[Answer]: A

## Q3. [운영] 임베딩·검색 호출 기록에 남길 항목

기능 설계 BR6.2는 발행본 ID·조각 개수·상태·오류 종류·HTTP 상태만 남기고 키·조각 글·질문 글은 남기지 않는다고 정했다. U1은 여기에 토큰 수·걸린 시간·제공자 요청 ID를 더했다.

A. BR6.2에 Voyage 응답의 토큰 수(`usage`), 걸린 시간, 묶음 수를 더한다 — 비용·지연을 로그로 볼 수 있다. 모두 응답·계산에서 온 값이며 글 원문은 없다.
B. BR6.2 그대로 둔다 — 가장 단순하지만 비용·지연을 로그로 볼 수 없다.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- 외부 호출(Q1): SDK 없이 HTTPS 요청 하나로 Voyage를 부르고 주소는 코드에 고정한다(환경변수로 바뀌지 않음). redirect 금지·응답 본문 상한은 새로 만들지 않고 U1의 `api/src/ai-generation/guarded-fetch.ts` `createGuardedFetch`를 상한 8 MiB로 불러 재사용한다(U1 파일은 고치지 않음). 시간 제한은 Q2 값.
- 값(Q2): 문서 임베딩은 한 번에 조각 128개·호출당 30초, 질문 임베딩은 호출당 10초. 128개가 Voyage 한 번 호출 상한 안인지는 코드 착수 때 확인한다.
- 기록(Q3): 기능 설계 BR6.2 항목(발행본 ID·조각 개수·상태·오류 종류·HTTP 상태)에 Voyage 응답의 토큰 수, 걸린 시간, 묶음 수를 더한다. 키·조각 글·질문 글은 남기지 않는다.
- 이미 정해진 것: 키 `CATCHU_EMBEDDING_API_KEY`(개발·시험 밖에서 없으면 기동 중지), `voyage-4-lite`·1024차원·코사인, 처리 시한 10분, 자동 재시도 없음, 새 처리 시간·가동률 수치 없음(NFR4).

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
