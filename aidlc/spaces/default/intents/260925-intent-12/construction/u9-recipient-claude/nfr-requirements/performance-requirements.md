# U9 받은 사람의 Claude 연결 — 성능 요구사항

## Sources

작성일: 2026-11-09. 입력:
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)
- [U9 업무 규칙](../functional-design/rules.md)(rules)
- [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·FR13.3
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-10·C-15
- [U6 성능 요구사항](../../u6-claude-mcp/nfr-requirements/performance-requirements.md)
- [비기능 질문·답변](nfr-requirements-questions.md)의 요약 확인

코드: `api/src/claude-mcp/mcp-limits.ts`, `api/src/publications/db-publication-access.ts`, `api/src/publications/publications-config.ts`, `api/src/publications/snapshot-builder.ts`, `api/src/publications/publish.service.ts`, `api/src/materials/text-material-input.ts`, `api/src/materials/pdf-material.entity.ts`, `api/src/catches/entities/catch-asset.entity.ts`.

## 범위

U9의 성능 요구는 한 번의 도구 응답 크기와 한 번의 호출이 하는 DB 일에 관한 것이다. 처리 시간·처리량 수치는 새로 만들지 않는다(NFR4). web의 버튼과 안내는 API를 부르지 않으므로 성능 요구가 없다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.1 | 한 쪽 응답을 `JSON.stringify`한 길이는 40,000자(U6 `MCP_PAGE_CHARS`) 이하다. 쪽을 채울 때 `nextCursor` 자리는 최대 길이 1,024자로 잡는다. 쪽의 첫 조각은 최소 진행(코드 포인트 하나 또는 빈 항목 하나)을 지키고, 이때는 최소 진행이 상한보다 앞선다. Catch 제목은 길이 상한이 없다(`catch_asset.title`은 text이고 1자 이상만 검사한다). 그래서 rules BR4.1과 functional-spec 가정의 "고정 칸과 항목 머리 칸은 짧다"는 Catch 제목에 맞지 않는다. 이 전제를 두지 않고 긴 Catch 제목 시험으로 확인한다. 제목만으로 남은 자리가 없으면 빈 쪽에 코드 포인트 하나가 들고, 그 쪽은 40,000자를 넘을 수 있다. 상한을 넘을 수 있는 쪽은 이 경우뿐이다 | 기능 설계 S12(긴 Catch 제목 포함)·S13 | C-15(응답 크기 상한), FR13.3(길면 나눠 읽기), rules BR4.1·BR4.2 |
| NFR4.2 | 입력 상한은 `link` 2,048자, `cursor` 1,024자다. 모양 검사는 DB 앞에서 하므로, 틀린 입력은 DB를 읽지 않는다 | 기능 설계 S2·S14 | rules BR1.3·BR4.5·BR5.2 |
| NFR4.3 | 한 호출의 DB 일은 `resolveForRecipient`와 `readSnapshot` 두 번이다. 각각 `DbPublicationAccess`가 여는 읽기 전용 REPEATABLE READ 트랜잭션 하나다. 쪽 사이에 캐시하지 않으므로 쪽마다 사본 전체를 읽고 편다. 긴 발행본을 끝까지 읽는 비용은 쪽 수 × 사본 크기다. 사본 크기는 U4·U8 입력 상한으로 묶인다. 항목은 20개 이하다. PDF 밖 글의 경계는 발행본 전체 글 상한 `SNAPSHOT_TEXT_TOTAL_MAX` 60,000자(코드 포인트, 임시값)다. 이 합계는 Catch의 기록 내용·본인 기여·근거가 나타낸 사실·작성자 설명과 텍스트 자료 본문을 세고, 제목·근거 주소·판본은 세지 않는다. PDF 글은 이 합계 밖이다. `snapshotTextLength`가 PDF 항목을 0으로 센다. 그래서 PDF는 50쪽(`PDF_PAGE_LIMIT`)과 파일 20 MB(U8 기능 설계 BR1.2) 상한만 받고, 쪽별 글 길이 상한은 없다. 분당 60회 제한 안에서 이 비용을 받아들인다 | 기능 설계 S12 | NFR4, C-10(캐시 없음), rules BR3.5 |
| NFR4.4 | 응답 시간·처리량 목표는 두지 않는다. 시연 규모에서 받은 사람이 Claude로 발행본 하나를 읽는 경로다 | 해당 없음 | NFR4 |

## 채택하지 않은 것

- **쪽 사이 사본 캐시:** 쪽마다 판정을 다시 해야 하고(C-10), 캐시를 두면 무효화와 저장 위치가 늘어난다.
- **cursor에 사본 지문을 묶기:** 발행본은 고정 사본이라 같은 글이 나오고(rules BR3.5), 글은 판정을 통과한 사본에서만 나온다.
- **응답 시간 목표:** NFR4가 새 수치를 만들지 않는다.
