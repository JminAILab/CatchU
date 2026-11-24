# NFR Requirements Questions — u3-reader-views

근거: 기능 설계 `construction/u3-reader-views/functional-design/`(검토 review-01), 요구사항 `inception/requirements-analysis/requirements.md` NFR1~NFR6, 계약 `inception/contract-design/contract-summary.md` P-3, 코드 지식 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`, 지금 코드 `web/src/features/recipient/recipient-api.ts`·`web/src/features/publications/published-pdf-item.tsx`.

이 단위는 화면만 바꾸고 새 경로·저장·외부 호출이 없어, 사람이 고를 빈 곳이 없다. 아래 전제로 요구를 적었다.

## Assumption Confirmation

- 응답 시간 숫자 목표와 재는 장치는 두지 않는다(U2 NFR 요구 Q2와 같은 판단). 대신 탭을 바꿔도 요청이 0이고, 열리지 않은 탭의 PDF는 누를 때만 받는다는 것을 요구로 적는다.
- 받은 사람 응답 해석(`recipient-api.ts`의 `pickItem`)은 `presetOrdinal`·`presetName` 두 칸만 더 옮기고, 그 밖의 칸은 지금처럼 버린다(기능 설계 검토 Major 1). 두 칸이 없거나 어긋나면 지금처럼 조회 실패다.
- 권한(NFR2)과 프리셋 목록 한 번(NFR6)은 이 단위에 해당하지 않는다.

A. Accept assumptions
B. Convert to follow-up questions

[Answer]: A. Accept assumptions

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
