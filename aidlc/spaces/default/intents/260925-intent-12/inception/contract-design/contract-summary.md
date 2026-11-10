# CatchU 12월 범위 — 계약 요약

작성일: 2026-10-24. 고침: 2026-10-26 U7을 U7(저장소·분석)과 U10(JD)으로 나눈 데 맞춰 소비 Unit 이름만 고침(Q4, 계약 내용은 그대로). 입력: [Unit 정의](../units-generation/unit-of-work.md)(`unit-of-work.md`), [Unit 의존](../units-generation/unit-of-work-dependency.md)(`unit-of-work-dependency.md`, 계약 의존 표), [컴포넌트 목록](../domain-design/components.md)(components), [결정 기록](../domain-design/decisions.md), [재승인 요구사항](../requirements-analysis/requirements.md)(requirements), [계약 설계 질문·답변](contract-design-questions.md)(Q1~Q3, 팀장 답). 10월 기준: `api/src` 현재 코드, `api/docs/member-withdrawal-deletion.md`, 10월 계약(`aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/`).

이 문서는 **경계 계약만** 고정한다(Q1 A). api 안 경계는 TypeScript 인터페이스 모양(함수 이름·인자·반환·오류·트랜잭션 의미), 공유 표는 열·자료형·외래 키·삭제 규칙으로 적어 제공 Unit이 가짜 구현을, 소비 Unit이 합성 제공자를 그대로 만들 수 있게 한다. 한 Unit 안에서만 쓰는 API 세부(필드·검증 값·응답 코드)는 그 Unit의 기능 설계에서 정한다.

## 공통 전제

- **10월 계약과의 관계(Q2 A):** 10월 계약 파일(`260914-catchu-october-mvp/inception/contract-design/`)은 과거 승인 원본이라 고치지 않는다. 10월 데이터는 12월 전에 모두 초기화하므로(C04) 대체한 계약이 함께 돌지 않는다.

  | 영역 | 12월 처리 | 세부가 있는 곳 |
  |---|---|---|
  | 공통(오류 본문 `{code, message}`·회원 API는 Bearer Access 토큰과 Refresh 쿠키(10월 그대로)·CSRF·`/v1` 접두어) | 이어 씀 | 10월 `common.yaml`, 현재 api 코드 |
  | 공유 링크 열람(공개 프로필·공개 Catch 목록·Catch 상세) | 대체. U4가 이 경로들을 발행본 경로로 바꾸면서 없앤다. 받은 사람 경로 `/v1/public/links/{token}`와 비밀번호 통과(`POST .../unlock`, `X-Link-Grant`, grant 2시간·링크 만료를 넘지 않음)는 이어 쓰되 grant는 publicationId에 묶는다 | 이 문서 C-10·C-11·C-12 |
  | 저장소 등록(등록 때 관계 검사 없음) | 바뀜(U7 안 변경, 경계 계약 아님) | U7 기능 설계. 현재 동작 설명은 U7 코드 PR에서 해당 서비스 문서(`api/docs`·`worker/docs`)를 함께 고치고 근거로 U7 기능 설계를 링크 |
  | 수집 상한 | 바뀜(U7 안 변경, 경계 계약 아님) | 위와 같음 |
- **기본 링크 기간(Q3, 요구사항 OQ4):** 90일. 발행 시각 + 2160시간. 연장·만료일 선택은 없고, 노출 기간은 작성자의 링크 중지·발행본 삭제로 줄인다.
- **배포 단위:** 경계 대부분은 같은 api 프로세스 안의 모듈 호출이다. worker와는 10월 큐(Redis/BullMQ)와 결과 수신 방식만 쓴다.
- **하루 경계:** 하루 실행 제한과 링크당 질문 횟수의 날짜는 한국 시간 자정 기준이다(도메인 설계 승인 때 팀장 결정).
- **제한 값:** 처리 시한·입력 상한·하루 횟수·질문 횟수·MCP 빈도와 응답 크기의 값은 개발 담당 결정이다(요구사항 「개발 담당 결정」). 계약은 값이 아니라 판정 자리와 거부 모양만 정한다.
- **에러 대응 최소선:** 새 기준이 아니다. 입력 §3 「운영 최소선」(동시 요청·재전송·늦은 결과의 세부 처리와 시험은 뺀다), FR6.8, FR14.10, NFR6, team.md Code Style을 한곳에 모은 것이다. 모든 계약이 이것을 따른다.
  1. 실패는 숨기지 않는다. 화면에 실패를 보이고 로그를 남기며, 접수와 완료를 구분한다.
  2. 다시 시도는 사람이 한다([다시 만들기]·[검색 다시 준비]·새 실행·다시 저장). 작업을 자동으로 다시 돌리지 않는다.
  3. 끝나지 않은 작업은 마감 시각 하나로 실패가 된다.
  4. 지운 자료는 외래 키로 지킨다. 부모가 없어 거부된 결과는 버린다.
  5. 함께 바뀌어야 하는 것만 한 트랜잭션에 넣는다.
  6. 드물게 겹치는 경우(동시 요청·재전송·늦은 결과)는 따로 막지 않는다. 피해가 하루 횟수 1회나 생성 1회 중복이면 한계로 적는다. 남의 자료 노출이나 삭제 실패로 이어질 때만 막는다.

## Contracts

| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---|---|---|---|
| C-01 | u1-ai-generation-gate, u2-shared-foundation | u5-rag-answer, u10-jd | api 안 TS 인터페이스(`AiGenerationGate`) | U2 담당(팀장). 인용 연결 핵심은 U1 |
| C-02 | u2-shared-foundation | u3-published-index, u4-publication-link, u5-rag-answer, u10-jd | api 안 TS 인터페이스(`AiRun`) + api 내부 큐 | U2 담당(팀장) |
| C-03 | u2-shared-foundation | u4-publication-link, u5-rag-answer, u7-repository-analysis, u10-jd | api 안 TS 인터페이스(`DailyRunLimit`) + 공유 표 | U2 담당(팀장) |
| C-04 | u2-shared-foundation | u4-publication-link, u10-jd, u8-pdf-materials | api 안 TS 인터페이스(`AiConsentGate`) + 공유 표 + web 동의 창 | U2 담당(팀장) |
| C-05 | u2-shared-foundation(인터페이스·로컬), u8-pdf-materials(S3 구현) | u4-publication-link, u8-pdf-materials | api 안 TS 인터페이스(`FileStorage`) | 인터페이스 U2 담당, S3 구현 U8 담당 |
| C-06 | u2-shared-foundation | 모든 Unit(새 표) | 공유 DB 규칙(외래 키 삭제 규칙) + 탈퇴 순서 | U2 담당(팀장) |
| C-07 | u4-publication-link | u3-published-index, u5-rag-answer, u10-jd, u8-pdf-materials, u9-recipient-claude | 공유 DB 표(발행본·항목·PDF 쪽 사본) | U4 담당 |
| C-08 | u3-published-index | u4-publication-link | api 안 TS 인터페이스(`PublishedIndexWriter`), 발행 트랜잭션 참여 | U3 담당 |
| C-09 | u3-published-index | u4-publication-link, u5-rag-answer, u10-jd | api 안 TS 인터페이스(`PublishedSearch`) | U3 담당 |
| C-10 | u4-publication-link | u5-rag-answer, u10-jd, u9-recipient-claude | api 안 TS 인터페이스(`PublicationAccess`) | U4 담당 |
| C-11 | u4-publication-link | u2-shared-foundation, u5-rag-answer, u10-jd, u9-recipient-claude | web 받은 사람 화면(`/s/[token]`)의 붙는 자리 + 받은 사람 API 경로 규칙 | U4 담당 |
| C-12 | u4-publication-link, u5-rag-answer, u10-jd | External: 받은 사람 브라우저 | HTTP REST·SSE(`/v1/public/links/{token}/...`) | 경로별 제공 Unit 담당 |
| C-13 | u4-publication-link | u6-claude-mcp | 공유 DB 표(`text_material`) | U4 담당 |
| C-14 | u4-publication-link | u6-claude-mcp | 공유 DB 칸(`catch_asset`의 작성자 설명) | U4 담당 |
| C-15 | u6-claude-mcp, u9-recipient-claude | External: Claude 웹·Desktop | MCP(원격 연결, OAuth) 도구 | U6 담당, 받은 링크 도구는 U9 담당 |
| C-16 | u8-pdf-materials(worker) | u8-pdf-materials(api) | 큐 메시지(10월 결과 수신 방식) | U8 담당 |
| C-17 | u8-pdf-materials | u4-publication-link | 발행 순서(PDF 복사 → 트랜잭션 → 정리) | U8 담당 |

C-16·C-17은 U8 안의 경계지만 worker·발행 트랜잭션에 걸치고 도메인 설계 승인 때 세부를 계약 설계로 넘겼으므로 여기에 둔다. 지금은 순서와 수신 판정만 고정한다. 세부(메시지 식별·수신 확인 모양, U4↔U8 호출 모양, 받은 사람 PDF 열람 경로)는 U8 착수 때 10월 결과 수신 규칙(messageId·receipt)에 맞춰 더하는 변경으로 이 문서에 더한다. U8·U9는 후순위라 다른 Unit이 C-15의 받은 링크 도구·C-16·C-17을 기다리지 않는다.

## 계약 명세

### C-01 AI 생성 공통

세 AI 기능(기본 요약·질의응답·JD 요약)이 같은 인용 연결·근거 검사·출처 표시를 쓴다(ADR-002, FR6.4·6.5). 합성 제공자는 입력 출처를 그대로 인용한 고정 항목을 돌려준다.

```yaml
# shared-schema: api/src/ai-generation (TypeScript 인터페이스 모양)
AiSource:
  sourceId: string            # 검색 조각 chunkId 또는 호출자가 정한 ID
  sourceKind: GITHUB_RECORD | AUTHOR_MATERIAL
  text: string                # 인용 단위(줄)로 나눌 원문
  location: { publishedItemId: uuid, fieldPath: string, charStart: int, charEnd: int, pdfPage: int|null }
    # charStart·charEnd는 snapshot 필드 문자열의 UTF-16 코드 단위 [start,end). C-01·C-07·C-09·web이 같게 쓴다
  catchEvidenceUrls: string[] # 그 근거 글의 항목이 Catch면 snapshot evidence[].sourceUrl 목록, 아니면 빈 배열(C-09 ChunkHit 그대로)
AiGenerationRequest:
  feature: BASE_SUMMARY | QNA | JD_SUMMARY
  instruction: string         # 기능별 지시문. 숨긴 지시 방어·역량 평가 표현 금지 공통 문구는 게이트가 붙인다
  sources: AiSource[]         # 비면 호출하지 않고 빈 결과
  userText: string|null       # 질문·JD 요구사항 줄. 신뢰하지 않는 입력. JD_SUMMARY는 한 호출에 요구사항 한 줄
  publicationText: string|null  # 그 발행본 조각 글 전부(C-09 search가 준 값). 검사에만 쓰고 모델 입력에 넣지 않는다
                                # 넘기지 않으면(기본 요약처럼) 게이트는 넘긴 근거 글 전체를 발행본 글로 본다
  model: HAIKU | SONNET       # 기본 HAIKU. SONNET은 NFR3 조정 때 QNA에만
GatedItem:
  kind: CITED | AI_INTERPRETATION | SERVER_NOTICE
    # SERVER_NOTICE는 AI가 아니라 게이트가 만든 "찾지 못함" 안내(JD_SUMMARY만). 대조·droppedCount 대상이 아니고 'AI 해석' 표시를 붙이지 않는다
  jdRole: EVIDENCE | UNCONFIRMED | INTERVIEW_QUESTION | null
    # JD_SUMMARY만 채운다(근거 / 자료로 확인되지 않는 점 / 면접 질문). BASE_SUMMARY·QNA는 null
  text: string
  citations: [{ sourceId: string, quote: string, location: AiSource.location, sourceLabel: "GitHub 기록 원문" | "작성자 자료 원문" }]   # CITED만(FR6.5, AC6.3.5)
    # location은 quote 자체의 범위로 좁혀서 준다(같은 칸, 새 칸 없음). quote는 그 범위의 원문이다
citation-location (U2 게이트, api에서만 계산):
  - 근거 글을 원문 글자 그대로의 줄로만 나눈다(앞말·공백 정리 없음). 출처 종류 설명은 인용 문서의 context에 둔다
    줄 구분 문자와 줄 번호를 매기는 방식은 U2 게이트 안 세부라 U2 기능 설계에서 정한다
  - 줄마다 시작 위치를 기록하고, 인용 기능이 돌려준 줄 번호 범위로 location.charStart·charEnd를 snapshot 필드 기준 UTF-16 범위로 계산한다. pdfPage는 그대로 둔다
  - quote는 인용 기능이 이어 붙인 글 대신 그 범위의 원문으로 채운다
  - web은 받은 범위를 그대로 강조하며 글자 검색을 하지 않는다
check-scope:                  # 기계 대조(FR6.4). 추출은 U2 게이트 안에서만, 검사와 같은 낱말 나누기로 한다
  추출: 게이트가 영어 표기(대소문자 무시, 흔한 낱말 예외 목록 제외)와 PR 번호(catchEvidenceUrls의 /pull/{n})를 직접 뽑는다
  CITED 근거 대조: 숫자·PR 번호·파일 이름·영어 표기를 근거 원문과 대조해 맞지 않는 항목을 버린다. 그 근거 글의 Catch PR 번호(catchEvidenceUrls의 /pull/{n})는 맞는 것으로 본다(AC6.3.2·AC6.3.3)
  AI_INTERPRETATION: 숫자·PR 번호가 있으면 허용 없이 버린다. 발행본 글(publicationText)에 없는 영어 표기가 있으면 버린다
  JD 면접 질문: 영어 표기는 근거 원문과 userText(그 JD 요구사항 줄)에서, 숫자·PR 번호는 같은 요구사항 근거 칸이 인용한 원문과 그 근거의 Catch PR 번호(catchEvidenceUrls)에서 찾는다(AC6.3.2·6.3.3·6.3.6)
  JD 확인되지 않는 점: 인용이 있으면 CITED 근거 대조, 없으면 AI_INTERPRETATION 대조를 쓴다. JD 요구사항 줄의 표기는 허용 근거가 아니다
  JD 서버 안내: userText의 기술·제품 이름 후보가 이번 sources 글에 없으면 게이트가 SERVER_NOTICE 항목(jdRole UNCONFIRMED)을 결과 끝에 더한다. 후보 규칙은 U2 기능 설계 BR4.7
caller-rule: 호출 Unit은 원문을 따로 모으지 않는다. U5가 사본에서 근거를 만들 때(기본 요약)는 catchEvidenceUrls를 같은 규칙으로 붙인다
jd-rule: U10은 JD 요구사항마다 generate를 한 번씩 부르고(FR6.1), jdRole로 항목을 세 칸에 나눠 보인다. 합성 제공자는 JD_SUMMARY에서 역할마다 항목을 하나씩 돌려준다
GatedOutput:
  items: GatedItem[]          # 기계 대조를 통과한 항목만. 버린 항목은 경고 없이 빠진다
  droppedCount: int           # 로그용, 화면에 보이지 않음
interface AiGenerationGate:
  generate(req: AiGenerationRequest) -> Promise<GatedOutput>
  generateStream(req: AiGenerationRequest) -> AsyncIterable<GatedItem>   # QNA용, 항목 단위로 검사 통과한 것만
errors:
  AiProviderError             # Claude 호출 실패. 자동 재시도 없음, 호출자가 실패로 기록
  AiInputTooLarge             # 입력 상한 초과. 호출 전에 거부
```

### C-02 백그라운드 실행(AiRun)과 처리 시한

임베딩·기본 요약·JD 요약을 api 안 큐로 돌린다. 작업 종류의 주인이 처리기를 등록한다. 처리 시한은 상태를 읽을 때 판정하므로 등록 실패·작업 유실이 "대기"로 남지 않는다(도메인 설계 승인 때 팀장 결정).

```yaml
# shared-schema: api/src/ai-run
AiRunKind: EMBED_PUBLICATION | BASE_SUMMARY | JD_SUMMARY
interface AiRun:
  registerHandler(kind: AiRunKind, handler: (job: { runKey: string, payload: object }) -> Promise<void>) -> void
  enqueueAfterCommit(kind: AiRunKind, runKey: string, payload: object) -> Promise<ENQUEUED | ENQUEUE_FAILED>
    # 반드시 DB 커밋 뒤에 부른다. 실패해도 예외를 던지지 않는다(상태는 시한으로 실패 확정)
    # 작업 ID = runKey, 시도 1회, 재시도·backoff 없음(10월 큐 규칙)
runKey:                      # 실행마다 고유
  자동 작업(발행 뒤 임베딩·기본 요약): "{종류}-{publicationId}"
  [다시 만들기]·[검색 다시 준비]·JD 요약: 접수 때 새 키
  콜론(:)을 쓰지 않는다(BullMQ 작업 ID 제약). 접수 때 새로 만드는 키도 같다
payload:
  EMBED_PUBLICATION, BASE_SUMMARY: { publicationId }
  JD_SUMMARY: { runId }
RunStatus: PENDING | DONE | FAILED
function readStatus(row: { status: RunStatus, deadlineAt: timestamptz }, now) -> RunStatus
  # 판정만 하는 순수 함수. PENDING이고 now >= deadlineAt이면 FAILED를 돌려준다
  # 행이 있으면 호출 Unit이 상태를 읽는 자리에서 시한이 지난 PENDING을 조건부 UPDATE(status = 'PENDING'일 때만)로 FAILED 저장한다
table-convention:            # 실행 상태를 가진 표(publication_index, base_summary, jd_summary_run)
  status: varchar NOT NULL CHECK IN ('PENDING','DONE','FAILED')
  deadline_at: timestamptz NOT NULL   # 등록 시각 + 그 종류의 처리 시한(값은 개발 담당)
status-names: 표·인터페이스 반환·HTTP 응답 모두 PENDING | DONE | FAILED 하나로 쓴다
row-creation:
  publication_index: 발행 트랜잭션 안에서 chunkInTransaction이 만든다(C-08)
  base_summary:
    하루 횟수는 언제나 접수할 때 센다: 자동 첫 요약은 발행 트랜잭션 안에서(C-08), [다시 만들기]는 접수 때(C-03)
    발행 때 행을 만들지 않는다. 행이 없으면 publication.published_at + 기본 요약 처리 시한으로 판정해,
      시한 전이면 PENDING, 지났으면 FAILED로 본다.
    U5의 BASE_SUMMARY 처리기는 하루 횟수를 세지 않고, 작업이 어디서 왔는지 보지 않고 base_summary 행만 본다:
      행 없음: published_at + 기본 요약 처리 시한 전이면 행을 PENDING(deadline_at = 그 시각)으로 만들고 생성한다.
        지났으면 아무것도 하지 않는다(늦은 결과 버림, FR14.10)
      행이 PENDING이고 마감 전: 생성만 한다
      그 밖(DONE·FAILED·마감 지남): 끝낸다
      구분값이나 [다시 만들기] 거부 규칙은 두지 않는다
    [다시 만들기]: 접수 때 consume하고 행을 PENDING으로 쓰며 deadline_at은 접수 시각 + 기본 요약 처리 시한이다
    한계(에러 대응 최소선 6): 자동 작업과 [다시 만들기]가 겹치면 두 번 생성되고 마지막 저장이 남는다(고정 사본이라 같은 내용의 요약이다).
      작업 등록이 실패하면 발행 때 센 그 1회는 돌려주지 않는다
  jd_summary_run: JD 요약 접수 때 202를 돌려주기 전에 PENDING 행을 만들고 커밋한 뒤 작업을 등록한다
late-result:
  처리기는 결과를 쓰기 전에 부모 행(발행본·실행)을 확인하고, 없거나 FAILED이거나 그 행의 deadline_at이 지났으면 버린다.
  다시 시도하지 않는다(FR14.10)
```

### C-03 계정당 하루 실행 제한

분석·기본 요약 생성/다시 만들기·JD 요약을 계정당 하루 횟수 하나로 센다(FR6.6). [검색 다시 준비]와 질의응답은 세지 않는다. 실행을 접수할 때 1을 쓰고, 실행이 실패해도 돌려주지 않는다. 발행 때 자동으로 만드는 첫 기본 요약도 센다. 하루 횟수는 언제나 접수할 때 센다: 자동 첫 요약 1회는 발행이 발행 트랜잭션 안에서 `consume(작성자, BASE_SUMMARY)`에 그 트랜잭션의 manager를 넘겨 센다. 한도면 트랜잭션을 되돌리고 `429 DAILY_LIMIT_REACHED`로 발행하지 않는다(C-08). [다시 만들기]는 접수 때 센다. BASE_SUMMARY 처리기는 세지 않는다(C-02 row-creation). 소비 Unit은 U4·U5·U7·U10이다.

```yaml
# shared-schema
interface DailyRunLimit:
  consume(memberId: uuid, kind: ANALYSIS | BASE_SUMMARY | JD_SUMMARY, now) -> Promise<ALLOWED | LIMIT_REACHED>
    # 원자적이다. 동시에 부른 둘이 남은 1회를 함께 쓰지 않는다
    # 접수 트랜잭션 안에서 부를 수 있게 manager를 선택 인자로 받는다
http-error: { status: 429, code: DAILY_LIMIT_REACHED, message: "오늘 한도에 도달했습니다" }   # 남은 횟수는 보내지 않는다
table daily_execution_count:
  member_id: uuid NOT NULL  FK member_account(member_id) ON DELETE CASCADE
  usage_date: date NOT NULL           # 한국 시간 날짜
  count: integer NOT NULL CHECK (count >= 0)
  primary key: (member_id, usage_date)
```

### C-04 첫 이용 동의·고지

요약·질의응답·JD 요약·PDF 처리의 외부 AI 전송을 첫 이용 때 한 번 동의받는다(FR20). 분석은 10월 요청별 동의(`analysis_consent`)를 그대로 쓰며 이 동의와 함께 있다(ADR-008). 비로그인 질의응답은 입력란 옆 고지 한 줄이 고지다.

```yaml
# shared-schema
interface AiConsentGate:
  hasConsented(memberId: uuid) -> Promise<boolean>        # 현재 고지 판본 기준
  require(memberId: uuid) -> Promise<void>                # 없으면 AiConsentRequired
  record(memberId: uuid, noticeVersion: string, now) -> Promise<void>
http-error: { status: 403, code: AI_CONSENT_REQUIRED }     # web은 동의 창을 띄우고 동의 뒤 같은 요청을 다시 보낸다
http:
  GET  /v1/ai-consent  -> { consented: boolean, noticeVersion: string }
  POST /v1/ai-consent  { noticeVersion } -> 204
web: 공용 동의 창 컴포넌트 하나(U2 제공). 각 Unit은 403 AI_CONSENT_REQUIRED를 받으면 이 창을 연다
consumers: 발행(U4, 발행으로 시작되는 AI 처리), JD 요약 실행(U10), PDF 업로드(U8)
table ai_consent:
  consent_id: uuid PK
  member_id: uuid NOT NULL  FK member_account(member_id) ON DELETE CASCADE
  notice_version: text NOT NULL
  consented_at: timestamptz NOT NULL
  unique: (member_id, notice_version)
```

### C-05 파일 저장 인터페이스

로컬·시험은 로컬 파일, 배포는 S3다(ADR-003). presigned URL은 없고 호출자가 권한을 확인한 뒤 읽어 내려 준다. 도메인 설계의 키 배치(회원/자료, 회원/발행본)를 영문 키로 옮겼다.

```yaml
# shared-schema: api/src/file-storage
interface FileStorage:
  put(key: string, body: Buffer, contentType: string) -> Promise<void>
  get(key: string) -> Promise<Readable>          # 없으면 FileNotFound
  copy(fromKey: string, toKey: string) -> Promise<void>
  deletePrefix(prefix: string) -> Promise<void>  # 없는 접두어는 성공
  delete(key: string) -> Promise<void>           # 없는 키는 성공
errors: FileNotFound, StorageUnavailable         # StorageUnavailable은 재시도 없이 호출자가 실패 처리
keys:
  memberPrefix(memberId)                    = "members/{memberId}/"
  materialKey(memberId, pdfMaterialId)      = "members/{memberId}/materials/{pdfMaterialId}.pdf"
  publicationPrefix(memberId, publicationId)= "members/{memberId}/publications/{publicationId}/"
  publishedPdfKey(memberId, publicationId, publishedItemId) = publicationPrefix + "{publishedItemId}.pdf"
deletion: 탈퇴는 memberPrefix, 발행본 삭제는 publicationPrefix, 자료 삭제는 materialKey만
```

### C-06 탈퇴 순서·연쇄 삭제 규칙

10월 #387 규칙(`api/docs/member-withdrawal-deletion.md`)을 모든 새 표에 적용한다.

```yaml
# shared-schema: DB 규칙
rule:
  - 회원이나 회원 자료를 참조하는 외래 키는 ON DELETE CASCADE(엔티티는 deleteWithParent)
  - 한 행이 두 부모를 따라 지워지고 두 부모의 주인이 같아야 하면 복합 외래 키로 묶는다(FR14.8). 부모 쪽에 그 짝의 UNIQUE를 둔다
      published_chunk (publication_id, published_item_id) → published_item (publication_id, published_item_id)
      jd_summary_run (member_id, jd_id) → jd (member_id, jd_id)   # 실행 회원의 JD. 실행 회원과 발행본 작성자는 다를 수 있다
  - NO ACTION·SET NULL 금지. 예외는 10월 넷(분석 요청 순환 3개, repository_selection)뿐
  - 새 표를 만드는 PR은 같은 PR에서 member-withdrawal-deletion.md 표에 "표 | 따라 지워지는 부모" 행을 더한다
  - 회원 자료를 가리키지만 외래 키를 걸지 않는 칸은 "사본"일 때만 허용(published_item.source_id). 원본이 지워져도 사본은 그 발행본 수명을 따른다
  - Redis 키(질문 횟수·MCP 빈도)는 지우지 않고 만료에 맡긴다
withdrawal-order:            # U2 탈퇴 API, 어느 단계든 실패하면 성공으로 응답하지 않고 오류
  1: 한 트랜잭션으로 커밋 — 세션 무효화, 그 회원의 모든 발행 링크 중지(stopped_at), MCP 접근 토큰·승인 코드·연결 삭제
  2: FileStorage.deletePrefix(memberPrefix)
  3: GitHub 자격정보 파일 삭제
  4: member_account 행 삭제(연쇄 삭제)
  note: 2~4가 실패해도 링크·MCP는 1에서 이미 막혀 있고, 중지된 링크는 되살리지 않는다(FR14.1)
check: test/db/member-cascade-delete.test.cjs가 회원 참조 외래 키의 연쇄 삭제를 확인한다
```

새 표와 따라 지워지는 부모(이번 계약에서 정한 것):

| 표 | 주인 Unit | 따라 지워지는 부모 |
|---|---|---|
| `daily_execution_count`, `ai_consent` | U2 | 회원 |
| `publication`, `text_material`, `jd`, `pdf_material`, `mcp_*`(클라이언트 등록 제외) | U4·U10·U8·U6 | 회원 |
| `published_item` | U4 | 발행본 |
| `published_pdf_page` | U8 | 발행 항목 |
| `publication_index`, `published_chunk`, `base_summary` | U3·U5 | 발행본 |
| `jd_summary_run` | U10 | 실행 회원, 발행본, JD |
| `jd_summary_result` | U10 | JD 요약 실행 |
| `pdf_page_text` | U8 | PDF 자료 |

### C-07 발행본·항목 최소 DB

U3은 이 모양으로 발행본 시험 자료를 만들어 먼저 시작하고, U5·U10·U9는 C-10으로만 읽는다(직접 쿼리하지 않는다). U3만 발행 트랜잭션 안에서 이 표를 읽는다(C-08).

```yaml
# shared-schema
table publication:
  publication_id: uuid PK
  member_id: uuid NOT NULL  FK member_account(member_id) ON DELETE CASCADE
  title: text NOT NULL CHECK (char_length(title) >= 1)      # 10월 링크 제목 그대로
  link_token_reference: text NOT NULL UNIQUE                 # 토큰 원문(10월 share_link처럼). 목록에서 링크 주소를 다시 보여 주기 위해(#162 합의). 링크 주소 밖의 응답·로그·오류에는 싣지 않는다
  password_protection_reference: text NULL                   # 10월 방식, 발행 뒤 변경 없음
  published_at: timestamptz NOT NULL
  expires_at: timestamptz NOT NULL CHECK (expires_at = published_at + interval '2160 hours')   # 90일
  stopped_at: timestamptz NULL CHECK (stopped_at IS NULL OR stopped_at >= published_at)
table published_item:
  published_item_id: uuid PK
  publication_id: uuid NOT NULL  FK publication ON DELETE CASCADE
  position: integer NOT NULL CHECK (position >= 1)           # 작성자가 고른 순서
  item_kind: varchar NOT NULL CHECK IN ('CATCH','TEXT_MATERIAL','PDF_MATERIAL')
  source_id: uuid NOT NULL                                   # 원본 ID, 외래 키 없음(사본)
  title: text NOT NULL
  snapshot: jsonb NOT NULL                                   # 아래 모양
  pdf_copy_key: text NULL CHECK ((item_kind = 'PDF_MATERIAL') = (pdf_copy_key IS NOT NULL))
  unique: (publication_id, position)
  unique: (publication_id, published_item_id)                # published_chunk 복합 외래 키의 부모 짝(C-06)
snapshot-shape:
  CATCH:
    workFacts: string[]
    subjectContribution: string
    evidence: [{ sourceUrl: string, sourceRevision: string, representedFacts: string[] }]
    authorDescription: string|null
    aiDraft: string|null          # 화면 구분 표시용. 조각 나누기·검색 대상 아님(FR6.4)
    mismatch: boolean
  TEXT_MATERIAL: { body: string }
  PDF_MATERIAL:  { pageCount: integer }     # 쪽별 글은 published_pdf_page
fieldPath:                        # 조각 위치(C-08·C-09)가 가리키는 snapshot 안 경로
  CATCH: "workFacts[i]" | "subjectContribution" | "evidence[i].representedFacts[j]" | "authorDescription"
  TEXT_MATERIAL: "body"
  PDF_MATERIAL: "pages[n]"        # n = page_number, pdfPage 칸과 같은 값
char-offset: 위치의 charStart·charEnd는 fieldPath가 가리키는 문자열의 UTF-16 코드 단위 [start,end)(C-01과 같음). PDF 쪽(pages[n])은 published_pdf_page.text 기준이다(후순위)
chunk-text: 조각 text는 그 필드 문자열의 [charStart, charEnd) 부분 그대로다(공백·줄바꿈 가공 없음)
sourceKind-rule: CATCH의 workFacts·subjectContribution·evidence = GITHUB_RECORD, authorDescription·TEXT·PDF = AUTHOR_MATERIAL
table published_pdf_page:         # U8이 만든다(후순위). U3은 이 모양으로 시험 자료를 쓴다
  published_pdf_page_id: uuid PK
  published_item_id: uuid NOT NULL  FK published_item ON DELETE CASCADE
  page_number: integer NOT NULL CHECK (page_number >= 1)
  text: text NOT NULL             # 읽을 수 없는 쪽은 빈 문자열. 읽을 수 있는 쪽은 빈 문자열이 아니다
  readable: boolean NOT NULL
  unique: (published_item_id, page_number)
```

### C-08 발행 트랜잭션 안의 조각 나누기

발행본·항목과 조각은 한 트랜잭션으로 저장된다(FR4.7, ADR-005). U4가 트랜잭션을 열고 U3을 부른다. U4의 합성 구현은 아무것도 쓰지 않는 `chunkInTransaction`이다.

```yaml
# shared-schema: api/src/published-index (U3 제공)
interface PublishedIndexWriter:
  chunkInTransaction(manager: EntityManager, publicationId: uuid, now) -> Promise<void>
    # manager는 U4가 연 발행 트랜잭션. 같은 manager로 published_item·published_pdf_page를 읽고
    # published_chunk(임베딩 없음)와 publication_index(status PENDING, deadline_at)를 쓴다.
    # 예외를 던지면 U4가 트랜잭션 전체를 되돌린다 = 발행 실패. 외부 호출(Voyage) 없음
  requestReindex(publicationId: uuid, now) -> Promise<REQUEUED | NOT_FAILED>
    # 작성자 확인은 U4가 먼저 한다. status = 'FAILED'일 때만 조건부 UPDATE로 PENDING으로 돌리고
    # deadline_at을 접수 시각 + 임베딩 처리 시한으로 새로 쓴다. 임베딩만 새 runKey로 다시 등록(C-02). 하루 제한에 세지 않음
publish-sequence (U4):
  1: 권한·선택·크기·동의(C-04) 확인
  2: [PDF가 있으면 C-17의 복사]
  3: 트랜잭션 시작 → DailyRunLimit.consume(작성자, BASE_SUMMARY, manager)로 자동 첫 기본 요약 1회를 센다
     (LIMIT_REACHED면 트랜잭션을 되돌리고 429 DAILY_LIMIT_REACHED로 발행하지 않는다, C-03)
     → publication·published_item(·published_pdf_page) 쓰기 → 비공개 Catch 공개 전환(10월 로직) → chunkInTransaction → 커밋
  4: 커밋 뒤 AiRun.enqueueAfterCommit(EMBED_PUBLICATION, "EMBED_PUBLICATION-{publicationId}", { publicationId })
     그리고 (BASE_SUMMARY, "BASE_SUMMARY-{publicationId}", { publicationId })를 항상 등록한다
  5: 4의 등록이 실패해도 3이 커밋됐으면 발행은 성공(작업은 시한으로 실패 확정, C-02 row-creation)
```

### C-09 색인 상태·의미 검색

```yaml
# shared-schema: api/src/published-index (U3 제공)
interface PublishedSearch:
  getIndexState(publicationId: uuid, now) -> Promise<PENDING | DONE | FAILED>    # C-02 readStatus로 시한 판정
  search(publicationId: uuid, query: string, limit: int) -> Promise<{ hits: ChunkHit[], publicationText: string }>   # DONE이 아니면 IndexNotReady
    # publicationText는 그 발행본 조각 글 전부(조각 나누기 대상과 같은 범위라 aiDraft·제목은 없음). C-01 검사에만 쓴다
ChunkHit:
  chunkId: uuid
  publishedItemId: uuid
  fieldPath: string            # C-07 fieldPath
  charStart: int               # UTF-16 코드 단위 [start,end)(C-01·C-07과 같음)
  charEnd: int
  pdfPage: int|null
  sourceKind: GITHUB_RECORD | AUTHOR_MATERIAL
  text: string
  score: number
  catchEvidenceUrls: string[]  # 그 항목이 Catch면 snapshot evidence[].sourceUrl 목록, 아니면 빈 배열
errors: IndexNotReady          # 호출자는 409 INDEX_NOT_READY("아직 쓸 수 없음")로 바꾼다
note: ChunkHit는 그대로 C-01 AiSource로 옮긴다(sourceId = chunkId). 호출 Unit은 검사용 원문을 따로 모으지 않는다
```

### C-10 링크 조건 판정과 사본 읽기

웹·질의응답·JD 요약·MCP가 같은 판정을 쓴다(NFR1, FR4.2, FR5.1). 받은 사람 경로는 10월 오류 코드를 그대로 쓴다: 없음·삭제·중지·만료는 구분 없이 `404 LINK_UNAVAILABLE`, 비밀번호 필요 또는 grant 거부는 `401 LINK_PASSWORD_REQUIRED`. grant는 publicationId에 묶고, 링크 중지·만료·삭제 판정을 grant 확인보다 먼저 한다. 작성자(소유 회원) 계정이 비활성이면 `404 LINK_UNAVAILABLE`, 작성자 회원 행이 없으면 `500 INTERNAL_ERROR`이며, 이 판정은 중지·만료 다음, 비밀번호(grant) 앞에 한다(#416 OQ-U4-NFR-6 결정, 2026-11-05).

```yaml
# shared-schema: api/src/publications (U4 제공)
interface PublicationAccess:
  resolveForRecipient(token: string, grant: string|null, now) -> Promise<RecipientAccess>
    # 호출마다 다시 판정한다(캐시 없음). 순서: 토큰으로 발행본 찾기 → 중지·만료·삭제 → 작성자 비활성(404 LINK_UNAVAILABLE)·작성자 회원 행 없음(500 INTERNAL_ERROR)
    #   → 비밀번호면 grant(publicationId에 묶임) 확인. 작성자 판정은 중지·만료 다음, 비밀번호 앞이다(#416 OQ-U4-NFR-6 결정, 2026-11-05)
    # 실패는 LinkUnavailable | LinkPasswordRequired. 작성자 회원 행 없음은 이름 있는 실패가 아니라 내부 오류(500)다
    # 판정 통과 뒤 같은 요청 중에 중지·만료·작성자 비활성이 커밋되거나 만료 시각이 지나도 그 요청을 그것만을 이유로 취소하지 않는다.
    #   그 요청의 접수·횟수 차감은 유효하고, 차단은 다음 요청의 재판정으로 한다(#416 OQ-U4-NFR-5 결정 A, 2026-11-04; 작성자 비활성은 OQ-U4-NFR-6 결정, 2026-11-05)
  resolveForOwner(memberId: uuid, publicationId: uuid) -> Promise<OwnerAccess>
    # 작성자는 중지·만료 뒤에도 본다. 남의 발행본·없음은 NotFound
  readSnapshot(publicationId: uuid) -> Promise<PublishedSnapshot>
    # 상태(중지·만료)는 판정하지 않는다. 발행본 없음(삭제)은 NotFound.
    #   받은 사람 경로는 판정 뒤의 NotFound, 또는 그 요청의 쓰기가 발행본(publication_id)을 참조하는 외래 키 제약에서 거부된 경우
    #   (SQLSTATE 23503이고 거부한 제약이 publication을 참조하는 것일 때만)를 삭제로 보고 저장·차감을 되돌린 뒤 404 LINK_UNAVAILABLE로
    #   응답한다. 다른 제약의 23503을 포함해 그 밖의 DB 오류는 500 그대로(#416 OQ-U4-NFR-5 결정 A, 2026-11-04)
RecipientAccess: { publicationId: uuid, ownerMemberId: uuid, passwordProtected: boolean, expiresAt: timestamptz }
OwnerAccess:     { publicationId: uuid, state: ACTIVE | STOPPED | EXPIRED }
PublishedSnapshot:
  title: string
  publishedAt: timestamptz
  expiresAt: timestamptz
  items: [{ publishedItemId, position, itemKind, title, snapshot, pdfPages: [{ pageNumber, text, readable }] | null }]
rule: 받은 사람 쪽 API는 판정에 통과한 뒤에만 사본·색인·요약을 읽는다. MCP 받은 링크 도구는 grant 없이(null) 부르므로 비밀번호 링크는 LinkPasswordRequired다
post-judgment-rule: 판정을 통과한 요청은 그 뒤의 중지·만료·작성자 비활성만을 이유로 취소하지 않는다. 그 요청의 접수(POST 저장)와 횟수 차감은 유효하고, 차단은 다음 요청의 재판정으로 한다. 판정과 읽기를 한 트랜잭션에 묶는 것은 제공 Unit(U4) 자기 경로의 선택이며 소비 Unit에 요구하지 않는다 (#416 OQ-U4-NFR-5 결정, 2026-11-04; 작성자 비활성은 OQ-U4-NFR-6 결정, 2026-11-05)
deletion-rule: 판정 직후 발행본이 삭제된 것이 확인되면(readSnapshot의 NotFound, 또는 발행본(publication_id)을 참조하는 외래 키 제약의 거부 — SQLSTATE 23503이고 거부한 제약이 publication을 참조하는 것일 때만) 저장·차감을 되돌리고 404 LINK_UNAVAILABLE로 응답한다. 다른 제약의 23503을 포함해 삭제 때문으로 확인되지 않은 DB 오류는 500을 유지한다. readSnapshot의 오류 이름은 NotFound 그대로다. 매핑과 시험은 각 소비 Unit이 자기 경로에서 한다 (#416 OQ-U4-NFR-5 결정, 2026-11-04)
```

### C-11 받은 사람 화면의 붙는 자리

U4가 받은 사람 화면(`web/src/app/s/[token]`)과 비밀번호 통과를 소유하고, U2·U5·U10·U9는 정해진 자리에 자기 컴포넌트를 붙인다. grant 보관은 10월 그대로(`sessionStorage`의 링크별 키, `X-Link-Grant` 헤더, 401·404를 받으면 그 링크 grant만 지움)이며 U4의 `recipient-grants` 도구를 쓴다.

```yaml
# shared-schema: web 붙는 자리(React props)
RecipientSlotProps:
  token: string                        # 경로의 링크 토큰. 쿼리·로그에 싣지 않는다
  getGrant: () -> string|null          # U4 제공. 요청 헤더 X-Link-Grant에 싣는다
  onAccessLost: (code: LINK_UNAVAILABLE | LINK_PASSWORD_REQUIRED) -> void   # U4 제공. 화면 전환·grant 삭제
  isLoggedIn: boolean
slots (화면 순서):
  0: RecipientGuide(U2)                # 화면 위쪽 시작 안내. 링크 판정을 통과한 자료 화면에만 둔다(비밀번호 입력·접근 불가 화면 안내는 U4). props는 showClaudeConnect: boolean 하나이고 RecipientSlotProps는 받지 않는다. 정적 안내라 API를 부르지 않는다
  0.5: 받은 사람 Claude 패널(U9)        # 선택 사항임을 밝힌 작은 보조 영역과 "Claude에서 분석하기" 버튼(FR13.3: 요청 문장 복사와 연결 안내). 기존 번호는 그대로 두고 0번 바로 다음, U4 고정 안내(발행 시각)와 1번 앞에 둔다
                                       # claude-connect-rule이 참일 때만 그린다. 요청 문장 복사·연결 안내만 하고 API를 부르지 않으므로 props는 RecipientSlotProps 중 token 하나이고 getGrant·onAccessLost는 받지 않는다
                                       # 제목(h1)과 첫 초점을 갖지 않는다. 컴포넌트 이름·문구·눌렀을 때의 동작은 U9 기능 설계에서 정한다
  1: 발행본 자료(U4)
  2: BaseSummaryPanel(U5)
  3: QnaPanel(U5)                      # 입력란 옆 외부 AI 고지 한 줄 포함
  4: JdSummaryPanel(U10)               # 로그인 회원에게만, 비로그인은 로그인 안내
rule: 붙는 컴포넌트는 401 LINK_PASSWORD_REQUIRED·404 LINK_UNAVAILABLE을 받으면 스스로 처리하지 않고 onAccessLost를 부른다
guide-rule: RecipientGuide는 제목(h1)과 첫 초점을 갖지 않고, 다른 자리의 안내(질의응답 외부 AI 고지 U5, JD 로그인 안내 U10)를 되풀이하지 않는다. showClaudeConnect는 claude-connect-rule의 값을 그대로 받는다(U9를 켜기 전까지 false). Claude 줄과 0.5번 패널의 문구는 #495에서 U9·U4·U2가 정했고(2026-11-10) U9 코드 PR에서 반영한다
claude-connect-rule:                   # 0.5번 자리와 0번 showClaudeConnect를 켜는 조건(#495 U9·U4·U2 확인, 2026-11-10). Claude는 비밀번호 없는 링크만 읽는다(FR13.3)
  U4가 판정 통과 상태에 값 하나를 둔다(web recipient-store의 readWithoutGrant, 읽는 함수 claudeConnectable). 참이면 0.5번 자리를 그리고 같은 값을 showClaudeConnect로 넘긴다. 두 자리가 따로 판단하지 않는다
  참: 판정 통과 화면이고, 그 화면을 그린 발행본 열람(GET /v1/public/links/{token}) 200 응답의 요청이 X-Link-Grant 없이 나갔을 때
    # 비밀번호 링크는 grant 없이 200을 받지 못하고(C-10), 비밀번호 유무는 발행 뒤 바뀌지 않는다(C-07 password_protection_reference)
  그 요청에 X-Link-Grant를 실었는지를 화면 상태에 보관해 쓰고, 화면을 그릴 때 getGrant()를 다시 읽어 판단하지 않는다(sessionStorage 읽기가 나중에 실패하거나 비워져도 비밀번호 링크에서 참이 되지 않게)
  거짓: 불러오는 중·비밀번호 입력·접근 불가·최초 조회 실패 화면, 그리고 grant를 실어 200을 받은 화면. 남은 grant 때문에 틀리면 보이지 않는 쪽으로 틀린다
  다시 조회에 실패해 이전 화면을 유지하는 동안은 그 화면을 그린 응답의 값을 유지한다. 판정 뒤의 중지·만료·작성자 비활성은 다음 조회에서 반영한다(C-10 post-judgment-rule)
  이 값은 웹 화면 표시만 정한다. Claude 쪽 접근은 C-15 read_shared_publication이 호출마다 C-10 판정(grant null)으로 정하며, grant·비밀번호·이 값을 Claude나 0.5번 컴포넌트에 넘기지 않는다
auth-rule: 401 AUTH_REQUIRED·AUTH_INVALID(로그인 없음·만료)는 링크 접근 문제가 아니므로 받은 컴포넌트가 처리한다. JdSummaryPanel(U10)은 로그인 안내로 바꾼다
evidence-highlight:                    # 근거 원문 강조(입력 §3 RAG 덩어리). AC6.3.5의 화면 부분을 U4·U5·U10이 나눠 맡는다
  provider: U4 — RecipientSlotProps에 showEvidence: (location: AiSource.location) -> void를 준다.
    자료 화면을 받은 위치(publishedItemId·fieldPath·pdfPage)로 옮기고 [charStart, charEnd) 범위를 강조한다(C-01 citation-location)
  consumers: BaseSummaryPanel·QnaPanel(U5), JdSummaryPanel(U10)은 근거를 누르면 showEvidence(citation.location)를 부른다
owner-summary:                         # 작성자 쪽 기본 요약
  U4의 작성자 발행본 화면에 BaseSummaryPanel(U5)을 작성자 모드로 붙인다. 중지·만료 뒤에도 보이고 [다시 만들기]가 있다(AC4.2.3·AC4.2.5)
  작성자 모드에서는 U4가 publicationId와 showEvidence를 넘긴다(token·grant 없음). U5의 작성자 경로는 C-10 resolveForOwner를 먼저 불러,
    남의 발행본이거나 없으면 NotFound로 끝낸다
  작성자 경로 세부는 U5 기능 설계에서 정한다
api-path-rule: 받은 사람 쪽 API는 /v1/public/links/{token}/... 아래에 두고 X-Link-Grant를 받아 C-10 resolveForRecipient로 확인한다
```

### C-12 받은 사람 브라우저용 HTTP 경로

경로·메서드·핵심 필드·오류만 고정한다. 요청 필드의 검증 값과 그 밖의 응답 칸은 각 Unit의 기능 설계에서 정한다.

```yaml
openapi: 3.0.3
info: { title: CatchU 12월 받은 사람 경계, version: "2026-10-24" }
servers: [{ url: /v1 }]
paths:
  /public/links/{token}:
    get:
      summary: 발행본 열람 (U4, 10월 경로 유지·응답은 PublishedSnapshot으로 대체)
      parameters: [{ name: X-Link-Grant, in: header, required: false }]
      responses: { "200": PublishedSnapshot, "401": LINK_PASSWORD_REQUIRED, "404": LINK_UNAVAILABLE }
  /public/links/{token}/unlock:
    post:
      summary: 비밀번호 통과 (U4, 10월 방식, grant는 publicationId에 묶음)
      responses: { "200": "{ grant }", "401": LINK_PASSWORD_INVALID, "404": LINK_UNAVAILABLE, "429": LINK_UNLOCK_LIMITED }
      # 중지·만료·삭제 판정을 비밀번호 확인보다 먼저 한다. grant 발급 시각이 링크 만료 이후면 404로 끝낸다
  /public/links/{token}/summary:
    get:
      summary: AI 기본 요약 (U5)
      responses: { "200": "{ status: PENDING|DONE|FAILED, items: GatedItem[] }", "401": LINK_PASSWORD_REQUIRED, "404": LINK_UNAVAILABLE }
      # FAILED면 받은 사람에게는 요약 없음. 다시 만들기는 작성자 경로(U5 기능 설계)
  /public/links/{token}/questions:
    post:
      summary: 질의응답 (U5, 로그인 없음)
      requestBody: "{ question: string, history: [{ role: USER|ASSISTANT, text: string }] }"   # 턴·길이 상한은 U5
      responses:
        "200": "text/event-stream — event item: GatedItem, event done: {}, event error: { code }"
        "401": LINK_PASSWORD_REQUIRED
        "404": LINK_UNAVAILABLE
        "409": INDEX_NOT_READY
        "429": QUESTION_LIMIT_REACHED     # 링크당 하루 질문 횟수(Redis, 셀 수 없으면 통과·기록)
  /public/links/{token}/jd-summaries:
    post:
      summary: JD 요약 실행 (U10, 로그인 회원)
      requestBody: "{ jdId: uuid }"
      responses:
        "202": "{ runId: uuid }"
        "401": "AUTH_REQUIRED·AUTH_INVALID(JdSummaryPanel이 로그인 안내) 또는 LINK_PASSWORD_REQUIRED(onAccessLost)"
        "403": AI_CONSENT_REQUIRED
        "404": LINK_UNAVAILABLE
        "409": INDEX_NOT_READY
        "422": INPUT_TOO_LARGE
        "429": DAILY_LIMIT_REACHED
  /public/links/{token}/jd-summaries/{runId}:
    get:
      summary: 본인 JD 요약 결과 다시 열기 (U10, 실행한 회원만, 링크가 유효한 동안)
      responses:
        "200": "{ status, requirements: [...] }"
        "401": "AUTH_REQUIRED·AUTH_INVALID(JdSummaryPanel이 로그인 안내) 또는 LINK_PASSWORD_REQUIRED(onAccessLost)"
        "404": "LINK_UNAVAILABLE 또는 RESOURCE_UNAVAILABLE"
```

작성자 쪽 경로(발행·목록·중지·삭제·[검색 다시 준비]·Catch 설명·텍스트 자료·JD 관리·기본 요약 다시 만들기·탈퇴)는 각 Unit 안의 web↔api라 기능 설계에서 정한다.

### C-13 텍스트 자료 표

U6은 이 모양으로 시험 자료를 넣어 개발한다.

```yaml
# shared-schema
table text_material:
  text_material_id: uuid PK
  member_id: uuid NOT NULL  FK member_account(member_id) ON DELETE CASCADE
  title: text NOT NULL CHECK (char_length(title) >= 1)
  body: text NOT NULL
  created_at: timestamptz NOT NULL
  updated_at: timestamptz NOT NULL      # 마지막 저장이 남는다(FR2.4), 충돌 감지 없음
read-rule (U6): member_id로만 거른다. 길이 상한 값은 U4 기능 설계
```

### C-14 Catch 설명 속성

10월 `catch_asset`에 작성자 설명 칸이 없어 U4가 더한다. 재분석 때 같은 작업은 기존 Catch를 참조하므로 설명이 유지된다(ADR-004).

```yaml
# shared-schema
alter table catch_asset:
  author_description: text NULL                       # 없으면 NULL
  author_description_updated_at: timestamptz NULL CHECK ((author_description IS NULL) = (author_description_updated_at IS NULL))
existing-columns-read-by-U6: catch_id, owner_id, title, work_facts, subject_contribution, visibility, mismatch
catch_evidence-read-by-U6: catch_id, source_url
note: draft_content(AI 설명 초안)는 MCP 도구가 내보내지 않는다(FR13.2는 설명을 포함한 Catch 조회)
```

### C-15 Claude에 보이는 MCP 도구

원격 연결 하나(Streamable HTTP)에 OAuth는 MCP 공식 SDK 인증 도구로 처리한다(ADR-009). 엔드포인트 경로와 OAuth 세부는 U6 기능 설계에서 정한다. 도구는 모두 읽기 전용이며 쓰기·JD 요약·의미 검색 도구는 없다(FR13.5). 한 번 응답 크기 상한 안에 들도록 목록은 쪽 단위로 돌려준다.

```yaml
# shared-schema: MCP tools
list_my_catches:              # U6
  input:  { cursor?: string }
  output: { catches: [{ catchId, title: string|null, visibility: PUBLIC|PRIVATE, workFacts: string[], subjectContribution, authorDescription: string|null, evidenceUrls: string[], mismatch: boolean, omitted?: true }], nextCursor: string|null }
    # omitted: 항목 하나가 한 쪽 응답 크기 상한을 넘어 글을 뺐다는 표시. 그 항목의 workFacts는 빈 배열, subjectContribution은 빈 글, authorDescription은 null이다
list_my_text_materials:       # U6
  input:  { cursor?: string }
  output: { materials: [{ textMaterialId, title, body, updatedAt, bodyOmitted?: true }], nextCursor: string|null }
    # bodyOmitted: 항목 하나가 한 쪽 응답 크기 상한을 넘어 글을 뺐다는 표시. 그 항목의 body는 빈 글이다
read_shared_publication:      # U9, 후순위
  input:  { link: string, cursor?: string }      # 링크 전체 주소 또는 토큰
  output: { title, publishedAt, expiresAt, items: [{ position, itemKind, title, content: string }], nextCursor: string|null }
    # content는 snapshot을 글로 편 것(PDF는 쪽별 글 포함, aiDraft 제외). 길면 cursor로 나눠 읽는다
  errors:
    LINK_PASSWORD_REQUIRED: "비밀번호가 있는 링크는 웹에서 열어 주세요"   # 비밀번호는 Claude를 거치지 않는다
    LINK_UNAVAILABLE: "이 링크는 열람할 수 없습니다"
  access: 페이지(cursor)마다 C-10 판정을 다시 한다
common-errors:
  RATE_LIMITED                 # 회원 기준 짧은 시간 빈도(값·형태는 U6 결정, IP로 세지 않음)
  INVALID_CURSOR               # 서버가 준 모양이 아닌 cursor
  INTERNAL_ERROR               # DB 실패. 로그를 남기고 오류에는 입력 원문·SQL·stack·토큰을 넣지 않는다
  UNAUTHORIZED                 # MCP 채널 인증 실패의 문서상 이름(토큰 만료·해제·탈퇴). OAuth 표준 401은 공식 SDK가 처리하고
                               # REST 오류 코드에는 더하지 않는다. 갱신 토큰 없음, 다시 승인
auth-check: U6은 요청마다 저장된 접근 토큰·만료·연결을 확인한다
consent: 첫 연결 승인 화면에서 한 번(본인 Catch 공개·비공개와 텍스트 자료를 읽게 됨)
tables (U6 소유, C-06 규칙): mcp_client(회원 참조 없음), mcp_connection·mcp_authorization_code·mcp_access_token(회원 연쇄 삭제)
disconnect: 전체 해제는 그 회원의 mcp_access_token·mcp_connection과 쓰지 않은 mcp_authorization_code를 모두 지운다
```

### C-16 PDF 글 추출 요청·결과 수신 (후순위)

10월 결과 수신 방식(메시지 검증·중복 반영 방지·지워진 부모 거부)을 따른다. worker는 S3를 읽기만 한다.

```yaml
asyncapi: 2.6.0
info: { title: CatchU PDF 글 추출, version: "2026-10-24" }
channels:
  pdf-extraction-requests:                 # api → worker, 새 큐
    publish:
      message:
        name: PdfExtract                   # 작업 ID = pdfMaterialId, 시도 1회, 재시도 없음
        payload: { pdfMaterialId: uuid, memberId: uuid, storageKey: string }
  worker-messages:                         # worker → api, 10월 큐에 작업 이름 하나 더함
    subscribe:
      message:
        name: PdfExtractionResult
        payload:
          pdfMaterialId: uuid
          outcome: SUCCEEDED | FAILED
          pages: [{ pageNumber: int, text: string, readable: boolean }]   # SUCCEEDED만, 글은 신뢰하지 않는 입력
receipt (10월 수신 확인 모양):
  ACCEPTED/OK: pdf_material이 PENDING이고 시한 전 → pdf_page_text 저장, DONE(또는 FAILED)
  DUPLICATE/ALREADY_RECEIVED: 이미 DONE
  REJECTED/CONTEXT_MISMATCH: pdf_material 없음(자료 삭제·탈퇴)
  REJECTED/STALE_ATTEMPT: 시한이 지나 FAILED로 확정된 뒤 도착 → 버림
  REJECTED/SCHEMA_INVALID: 모양 오류
  worker는 거부된 결과를 다시 보내지 않는다
deadline: pdf_material.extraction_state·extraction_deadline_at에 C-02 readStatus 규칙. FAILED면 작성자에게 다시 올리라고 안내
```

### C-17 PDF 발행 순서 (후순위)

PDF 복사는 트랜잭션 밖이라 순서로 정리한다(도메인 설계 승인 때 팀장 결정). 청소 장치는 두지 않는다.

```yaml
# shared-schema: 발행 순서 (U4 publish-sequence의 2단계를 U8이 채운다)
preconditions: 고른 PDF는 모두 추출 DONE. 아니면 발행 전 거부하고 이유 안내
sequence:
  1: publicationId를 먼저 만든다
  2: 고른 PDF마다 FileStorage.copy(materialKey → publishedPdfKey)
  3: 복사 하나라도 실패 → deletePrefix(publicationPrefix) 시도 → 발행 실패 응답(DB는 건드리지 않음)
  4: C-08 트랜잭션. published_pdf_page는 그 시점 pdf_page_text를 복사해 고정
  5: 트랜잭션 실패(한도 429로 되돌린 경우 포함) → deletePrefix(publicationPrefix) 시도 → 발행 실패 응답
  6: 3·5의 접두어 삭제가 실패하면 로그만 남긴다. 남은 파일은 탈퇴 때 memberPrefix로 지워진다
delete-publication: deletePrefix(publicationPrefix) 먼저 → 성공하면 publication 행 삭제(연쇄). 접두어 삭제 실패면 오류를 보이고 DB는 지우지 않는다
pdf-free-publish: PDF가 없으면 2·3·5·6 단계가 없다(U4 혼자 동작)
```

## Contract ownership rules

- **주인은 제공 Unit이다.** 표의 Owner가 그 계약의 인터페이스·표 정의·가짜 구현을 소유한다(Q1 조건 3).
- **첫 주 선합치:** 제공 Unit은 11/2 주 첫 작은 PR(또는 첫 제출)로 경계의 인터페이스·표 정의(마이그레이션 포함)·가짜 구현을 먼저 합친다. 합치는 곳은 팀 방식이면 intent 작업 브랜치, 이슈·PR 방식이면 `dev`이며, 선합치는 Unit 완료와 별개다. U4가 `publication`·`published_item`·`text_material` 표와 `catch_asset` 작성자 설명 칸을 먼저 합친다. 각 제공 Unit은 자기 표만 마이그레이션한다. 소비 Unit은 그것을 가져다 합성 제공자로 쓴다.
- **소비 Unit은 고치지 않고 요청한다.** 남의 인터페이스·표를 직접 고치지 않고 제공 Unit 담당에게 요청한다.
- **더하는 변경:** 기존 호출·가짜 구현·DB 행이 그대로 유효한 변경(새 선택 필드·함수·NULL 허용 칸 등)은 제공 Unit이 하고, 같은 변경에서 이 계약 문서를 고치며 소비 Unit 담당에게 알린다. 소비자는 모르는 응답 필드를 무시한다. 기본값 없는 NOT NULL 칸은 기존 행을 깨므로 깨는 변경이다.
- **깨는 변경:** 이름·자료형·의미·오류를 바꾸거나 지우는 변경은 멈추고 소비 Unit과 합의한 뒤 계약 수정 PR로 처리한다(입력 §3).
- **Unit 안 세부:** 자기 Unit 안에서만 쓰는 API의 세부(필드·검증 값·응답 코드)는 담당이 자기 기능 설계(entities·rules·frontend-components)에 정하고 그 승인으로 끝내며, 이 계약 문서는 고치지 않는다.
- **새 표:** 어느 Unit이든 새 표는 C-06 규칙을 따르고 같은 PR에서 탈퇴 삭제 표에 행을 더한다.
- **저장소 반영:** API 명세·ERD는 이 단계 승인 뒤 PR로 저장소에 반영한다(입력 §3 「적용 방법」).

## Open questions

| Contract | Question | Blocks |
|---|---|---|
| C-02, C-09, C-16 | 처리 시한 값(임베딩·기본 요약·JD 요약·PDF 추출) | 없음. 각 담당 기능 설계에서 정한다 |
| C-01, C-12 | AI 입력 상한·질의응답 턴·길이 상한, 링크당 하루 질문 횟수와 계정당 하루 실행 횟수 값 | 없음. 개발 담당 결정(요구사항) |
| C-15 | MCP 쪽 크기·응답 크기 상한·빈도 제한 값과 거부 형태 | 없음. U6 기능 설계(FR13.6) |
| C-09 | Voyage AI 임베딩 모델과 벡터 차원 | 없음. U3 기능 설계(요구사항 「개발 담당 결정」) |
