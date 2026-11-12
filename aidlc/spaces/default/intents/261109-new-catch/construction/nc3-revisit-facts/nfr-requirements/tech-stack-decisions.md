# NC3 다시 볼 곳 사실과 작업 시각 — 기술 스택 결정

입력:
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 기능 설계 `construction/nc3-revisit-facts/functional-design/`(functional-spec.md, rules.md, entities.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(제약 1·17, NFR1)
- 계약 `inception/contract-design/contract-summary.md`(C2·C4)

새 라이브러리·서비스·AWS 자원은 들이지 않는다(제약 1·17). 모두 지금 쓰는 것으로 만든다.

| 자리 | 쓰는 것 | 까닭 |
|---|---|---|
| worker RevisitFacts | Python 3.12 표준 라이브러리(`re`, `pathlib.PurePosixPath`, `fnmatch`, `dataclasses`). 비밀 경로는 지금 `app.redact.is_secret_path` | patch 줄 읽기와 경로 꼴 판정은 표준 라이브러리로 충분하다. 비밀 경로 판정을 AI 재료와 같은 함수로 써 두 목록이 어긋나지 않는다. |
| worker 수집 | 지금 `normalize.commit_changes`가 받는 응답의 `sha` 칸 | 새 호출 없이 이미 받는 값(NFR1.1). |
| 결과 메시지 계약 | 지금 `worker-messages.yaml`(Result "4"), api Ajv 8 검사, worker 결과 검사 | C4가 정본이다. 같은 파일을 api·worker가 함께 쓴다. |
| api 저장 | PostgreSQL 16 `jsonb`·`timestamptz`, TypeORM 마이그레이션 하나(칸 셋과 검사 둘) | ADR-004. 표·외래 키·인덱스를 늘리지 않는다(Q4 A). |
| api 정렬·커서 | 지금 `owner-catch-input.ts`·`owner-catch-store.ts`의 SQL 질의(매개변수) | 정렬 조각은 고정 SQL이다. 공개 목록 커서 함수는 지금 모양을 따로 둔다(BR7.3). |
| web 화면 | React 19 텍스트 요소와 지금 `visually-hidden` 글자 꼴 | 발행본 링크의 「(새 탭)」과 같은 꼴(NFR6.1). |
| 시험 | api `node --test`(지금 시험 틀), worker `pytest`, web `node --test`(지금 시험 틀) | 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다(team.md 「Testing Posture」). |

## 들이지 않는 것

- 줄 대조용 diff 라이브러리: patch의 '+'·'-' 줄 글자만 맞춰 보므로 필요 없다(BR3.1).
- 저장소 이름을 위한 새 API 칸: 상세가 이미 불러오는 이름을 쓴다(기능 설계 Q4 A).

## Sources

- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `construction/nc3-revisit-facts/functional-design/rules.md`(BR1.1, BR2.3, BR3.1, BR7.3), `entities.md`, `functional-spec.md`
- `inception/requirements-analysis/requirements.md` 제약, NFR1
- `inception/contract-design/contract-summary.md` C2·C4
- `inception/domain-design/decisions.md` ADR-004
