## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-09T12:45:05Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 4. 면접관 발행본 Catch (저장소 이름, 작성 시점, 작업 전체 한계) | 저장소 이름·작성 시점·작업 전체 한계는 발행 사본에 새로 담기는 값이라, 이 변경 전에 이미 발행한 발행본에는 없다(사본은 발행 시점에 굳는다). 초안은 새 값이 있는 경우만 그려서, 옛 발행본에서 저장소 줄·작성 시점·한계 목록이 어떻게 보이는지 정하지 않았다. 작성자 설명이 통째로 없거나 한 번도 고친 시점이 없는 Catch의 「작성 시점」도 같다. 이 빈틈은 요구사항 분석에서 면접관 화면 두 갈래로 갈라질 수 있다. | 4절에 「새 값이 없는 옛 발행본은 저장소 줄·작성 시점·한계 목록을 그리지 않고 나머지는 지금 그대로」 같은 한 줄을 정하거나, 열린 질문으로 올린다. 작성자 설명이 없을 때 작성 시점을 그리지 않는다는 것도 함께 적는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 2. 지원자 Catch 상세 (칸 제목 8칸, 옛 글) | 8칸을 한 칸(4,000자)에 칸 제목과 함께 합쳐 저장하고 받는 쪽이 칸 제목으로 다시 나누므로 모서리가 비어 있다. (1) 지원자가 글 안에 칸 제목과 같은 줄을 쓰면 나뉘는 자리가 틀어진다. (2) 8칸을 모두 비운 채 저장하면 제목만 남는 글인지 지금처럼 「지워짐」인지 정하지 않았다(지금 화면에는 「비워 두고 저장하면 설명이 지워집니다」가 있다). (3) 옛 자유 글을 「더 쓰기」에 넣을 때 칸 제목 글자가 더해져 4,000자에 가까운 옛 글은 고치지 않아도 저장이 막힐 수 있다. 초안은 이 셋을 말하지 않는다. | 가정 절에 세 모서리 각각을 「요구사항으로 정함」, 「가정과 이유」, 「범위 밖」 중 하나로 적는다. 최소한 모두 비운 저장이 설명 삭제인지와 옛 글이 한도에 걸릴 때의 안내를 정한다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 2. 지원자 Catch 상세 (면접관에게 열리는 링크) | 이 목록의 목적은 한글 앞에서 끊긴 링크를 저장 전에 보게 하는 것인데, 끊긴 주소를 다른 주소와 같은 모양으로 늘어놓기만 한다. 지원자가 붙여 넣은 주소와 눈으로 대조해야 끊긴 것을 알 수 있다. 같은 목록은 면접관 화면의 실제 링크 판별 규칙과 어긋날 수도 있다. | 끊긴 것으로 보이는 주소(주소 바로 뒤에 한글이 이어지는 경우 등)에 글자로 읽히는 표지를 단다. 규칙 일치는 기능 설계에서 같은 함수를 쓴다고 못 박거나 열린 질문으로 둔다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 1. 지원자 Catch 목록 (작업 시각순) | 작업 시각은 3단계에서 새로 남기는 값이라, 그 전에 분석한 기존 Catch에는 시각이 없을 수 있다. 시각 없는 Catch가 목록 위·아래 어디에 놓이는지 정하지 않았다. 걸러 보기가 불러온 목록 안에서만 거르는지(더 보기와의 관계)도 흐리다. | 시각이 없는 Catch의 자리를 한 줄로 정한다(예: 맨 아래, 기존 순서 유지). 걸러 보기는 목록 요청 조건이라는 점을 명시한다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 2절 접근성 줄, 3절 접근성 줄, 4절 접근성 줄 | 이 단계 정의는 화면마다 제목 수준, 주요 영역(landmark), 키보드 진입점을 한 줄씩 요구한다. 1절은 `main`을 말하나 3·4절은 영역과 진입점이 빠져 있고, 4절은 근거 접힘 초점 이동만 언급한다. | 3·4절 접근성 줄에 `main` 영역과 첫 키보드 진입점을 더한다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 2. 지원자 Catch 상세 (안내 한 줄) | 지금 편집 영역에 있는 「AI가 만든 Catch 설명 초안은 이 설명을 바꾸지 않습니다」와 「비워 두고 저장하면 설명이 지워집니다」 안내를 새 안내 한 줄로 바꾸는지, 함께 두는지 적혀 있지 않다. | 두 문장의 유지·삭제를 한 줄로 밝힌다. 이 선택에 새 화면 요소는 필요 없다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > GitHub 링크 이름 표, 2절 「발행하면 면접관에게 열릴 링크」 | 끊긴 주소를 이름에서 드러내는 것이 이 목록의 목적이다. 그런데 이름 표에는 `#L` 줄 범위가 있는 파일 줄 링크만 있다. 2절 그림의 예 「src · 브랜치 main」(폴더까지 끊긴 주소)과 줄 범위가 없는 파일 링크는 표의 어느 행에도 맞지 않고, 「그 밖의 GitHub 주소는 주소 전체」 행에 해당한다. 또 판본이 「커밋 식별값」인지 「브랜치」인지 가르는 기준(예: 16진수 7~40자)과 7자로 줄이는 규칙도 적지 않았다. | 표에 줄 범위 없는 파일·폴더 링크의 이름 모양(예: 「경로 끝 이름 · 판본/브랜치」)을 한 행 더하거나, 이런 주소는 주소 전체로 보인다고 고쳐 그림의 예와 맞춘다. 판본과 브랜치를 가르는 기준과 판본을 줄이는 길이는 요구사항 분석에서 정한다고 열린 질문에 적는다. | Resolved (reviewer) |
| R-08 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 2절 접근성 줄 | 「발행하면 면접관에게 열릴 링크」 목록은 알림 영역이 아니라고 정했다. 그러면 화면 낭독기 사용자는 글을 고친 뒤 목록이 바뀌었는지 알 방법이 없고, 이 목록의 목적(저장 전에 끊긴 링크를 보는 것)이 키보드·낭독기 사용자에게는 약해진다. | 목록을 가리키는 제목(h4 등)과 첫 글칸·저장 단추의 `aria-describedby` 연결 가운데 하나로 도달 방법을 정하거나, 쉬운 답으로 지금 선택을 유지한다는 한계를 가정으로 적는다. | Resolved (reviewer) |
| R-09 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > GitHub 링크 이름 표 | 파일 줄 링크 행은 `#L<시작>-L<끝>` 범위만 다룬다. GitHub에서 한 줄을 골라 Copy permalink 하면 `#L40`처럼 끝이 없는 주소가 나오는데, 이것이 어느 행에도 맞지 않는다. 그러면 가장 흔한 짚어 볼 곳 링크가 「그 밖의 GitHub 주소」로 떨어져 주소 전체가 그대로 보일 수 있다. 같은 이유로 `?plain=1` 같은 질의가 붙은 주소도 어느 행인지 알 수 없다. | 표에 한 줄 링크(`#L40`)를 같은 행으로 묶는지(예: `L40`) 적거나, 요구사항 분석의 열린 질문에 더한다. 질의가 붙은 주소가 어느 행인지도 함께 정한다. | Resolved (reviewer) |
| R-10 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 4절 그림 아래 텍스트 대체 | 텍스트 대체는 「판본이나 커밋이 발행 사본 근거의 본인 커밋과 맞으면」 표지가 붙는다고 쓴다. 본문과 「GitHub 링크 이름」 절은 2차 변경 요청 2에 따라 저장소와 판본(커밋)이 모두 맞을 때만 붙는다고 한다. 텍스트 대체만 읽는 사람은 저장소 조건을 놓친다. | 텍스트 대체 문장에 「저장소와 판본(또는 커밋)이 모두」 조건을 넣어 본문과 맞춘다. | Resolved (reviewer) |
| R-11 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/user-flow.md > 흐름 1 Steps | 단계 번호가 「2-1」이 「2」보다 앞에 놓여 있다. 「다시 볼 곳」을 열어 보는 일이 상세를 열기 전에 일어나는 것처럼 읽히고, 이 칸이 3단계에 들어간다는 표시도 없다. | 상세 창을 연 뒤의 단계로 순서를 바로잡고, 「다시 볼 곳」은 3단계 전에는 없다는 말을 붙인다. | Resolved (reviewer) |
| R-12 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/wireframes.md > 3. 발행 화면 | 「작성자 설명을 쓴 Catch만 보기」를 켜면 이미 골라 둔 Catch 가운데 설명이 없는 것이 목록에서 사라진다. 고른 것이 숨겨졌을 때 선택이 유지되는지, 순서와 최대 개수에 어떻게 세어지는지가 어디에도 적혀 있지 않다. | 요구사항 분석·기능 설계에서 정할 열린 질문으로 한 줄 올린다(예: 걸러도 고른 항목과 순서는 유지). 이번 단계의 승인을 막을 만한 것은 아니다. | New |
| R-13 | Minor | aidlc/spaces/default/intents/261109-new-catch/ideation/rough-mockups/user-flow.md > 흐름 1 Steps 3 | 「(3단계 뒤에만)」의 3단계는 납품 단계를 뜻하는데, 같은 줄이 속한 흐름 단계 번호도 3이다. 읽는 사람이 흐름의 3번째 단계로 읽을 수 있다. | 「(납품 3단계 뒤에만)」처럼 한 단어를 붙여 구별한다. | New |

> R-09 Reviewer note: GitHub 링크 이름 표의 첫 두 행이 한 줄 링크(`#L40`)를 「L40」으로 보이는 예와 함께 다루고, `?plain=1` 같은 질의는 이름을 정할 때 무시하되 링크 대상에서는 지우지 않는다는 항목이 생겼다. 맞지 않던 주소 모양이 모두 행에 들어간다.

> R-10 Reviewer note: 4절 그림 아래 텍스트 대체가 「링크의 저장소와 판본(또는 커밋)이 모두 발행 사본 근거의 본인 커밋과 맞으면」으로 바뀌어 본문의 표지 조건과 같아졌다.

> R-11 Reviewer note: user-flow 흐름 1에서 「다시 볼 곳」 단계가 3단계 안으로 들어가 「(3단계 뒤에만)」 표시가 붙었고, 단계 번호 순서가 맞다. 단계별 표의 1단계 행에도 발행 화면 저장소 이름·「설명 안 씀」·확인 단계 안내가 올랐다.

### Summary

세 번째 변경 요청에서 지적한 R-09, R-10, R-11은 모두 고쳐졌고, 새로 더한 발행 화면의 「작성자 설명을 쓴 Catch만 보기」 칸도 1절과 같은 서버 거름 기준으로 문서 사이에서 일관된다. 엔지니어링이 질문 없이 시작하는 데 막히는 점은 없고, 남은 두 건은 표기·열린 질문 수준의 Minor이다.
