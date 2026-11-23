# Performance Design — u3-reader-views

근거: NFR 요구 `construction/u3-reader-views/nfr-requirements/performance-requirements.md`(NFR5.1~NFR5.5, NFR1.2)와 그 검토 review-01, 기능 설계 `functional-design/`(흐름 1~4, 검토 review-01), 이 단계 질문 Q1(2026-11-20 팀장), 지금 코드 `web/src/features/publications/published-pdf-item.tsx`·`recipient-screen.tsx`·`publication-detail-screen.tsx`·`materials-screen.tsx`.

## 이 단위 번호와 상류 요구의 대응 (NFR 요구 검토 Major 1)

이 단위의 `NFRx.y`는 상류 번호 아래에서 이 화면이 지킬 몫을 적은 것이다. 상류 문장과의 대응은 아래와 같다.

| 이 단위 | 상류 문장(요구사항) | 이 단위의 몫 |
|---|---|---|
| NFR5.1~NFR5.5 | NFR5 「불러오는 중·비었음·실패를 다른 화면으로, 조회 실패를 0건으로 보이지 않는다」 | 탭은 새로 불러오지 않으므로 불러오는 중·실패 화면은 지금 그대로(받은 사람·상세의 조회 실패 화면). 탭을 바꿔도 요청이 없고 패널을 다시 만들지 않아, 탭 때문에 「불러오는 중」이나 빈 화면이 새로 생기지 않게 하는 것 |
| NFR1.1·NFR1.2 | NFR1 「탭·출처 이동을 키보드로, 역할·선택 상태·이유가 읽힘, 색만으로 나타내지 않음」 | 탭 줄 역할·키보드(NFR1.1), 출처 이동에서 대상 항목이 그려진 뒤 초점이 가는 것(NFR1.2) |
| NFR4.1~NFR4.3 | NFR4 「이름과 자료 내용을 로그에 남기지 않음」 | 받은 사람 응답에서 정한 칸만 옮김(4.1·4.2)과 이름을 기록에 넘기지 않음(4.3). 4.1·4.2는 상류 NFR4의 「자료 보호」를 응답 해석까지 넓혀 읽은 것이다 |

## 1. 요청과 패널

| 때 | 요청 | 요구 |
|---|---|---|
| 받은 사람 화면·작성자 상세 열기 | 지금처럼 사본 1번 | 그대로 |
| 탭 누름·화살표·출처로 다른 탭 | 0 | NFR5.1 |
| 열리지 않은 탭의 PDF 항목 | 0(누를 때만 사본 요청, 지금 `published-pdf-item.tsx`) | NFR5.3 |

- 모든 탭 패널을 처음에 한 번 그리고, 탭을 바꿀 때는 `hidden`만 바꾼다. 패널의 React key는 `presetOrdinal`이라 탭을 바꿔도 같은 부품이 남아 PDF 뷰어의 받은 파일·보던 쪽이 남는다(NFR5.2).
- 그리는 항목은 발행본 전체(최대 20개)라 지금 한 화면 양과 같다(NFR5.4). `hidden` 패널은 화면에 그려지지 않고(`display: none`) 화면 낭독기와 페이지 안 찾기에서도 빠진다(NFR 요구 검토 Minor 2).
- 다시 조회로 사본이 바뀌면 같은 `presetOrdinal`이 있으면 열린 탭을 그대로, 없으면 첫 탭(NFR5.5).

## 2. 출처 이동 (NFR1.2)

- `useSnapshotJump`가 열린 탭과 대상(`publishedItemId`·강조·`seq`)을 한 상태 객체로 갖고, `showEvidence`가 둘을 한 번에 바꾼다. 효과가 그려진 뒤 항목에 초점(`preventScroll`)과 스크롤을 한다(지금 방식). 대상 항목은 이미 그려져 있어(숨김 패널이 열림으로 바뀜) 못 찾는 경우가 없다.
- 탭이 바뀐 이동이면 알림 칸 글을 「(이름) 탭을 열었습니다」로 바꾸고, 같은 탭이면 바꾸지 않는다.

## 3. 텍스트 자료 화면의 탭 거절 (이 단계 Q1 A)

- TabStrip의 `onChange(id)`는 바꿨는지(`true`/`false`)를 돌려준다. 화살표·Home·End로 옮길 때 `onChange`가 `false`면 초점을 옮기지 않고 열린 탭에 둔다.
- 텍스트 자료 화면의 `changeTab`은 지금처럼 저장하지 않은 입력이 있으면 PDF 탭으로 가기 전에 묻는다(화살표·누름마다). 머무르기를 고르면 `false`를 돌려주어 탭과 초점이 「텍스트 자료」에 남는다.

## 4. 확인 수단 (NFR 요구 검토 Major 2)

| 요구 | 확인 |
|---|---|
| NFR5.1 탭 바꿈에 요청 0 | 화면 모델 시험: 주입한 받은 사람·상세 호출 함수의 호출 수가 탭 바꿈·출처 이동 전후로 같음 |
| NFR5.2 패널 유지 | 서버 렌더링 시험: 모든 패널이 그려지고 열리지 않은 패널에 `hidden`이 있음. 부품이 다시 만들어지지 않는지(PDF 다시 받지 않음)는 브라우저에서 사람이 로컬로 확인(Build and Test) |
| NFR5.3 PDF 0 | 서버 렌더링 시험: 처음 그릴 때 주입한 PDF 사본 함수 호출 0 |
| NFR5.5 갱신 뒤 탭 | 순수 함수 시험: 이전 순번과 새 사본으로 열린 탭을 정하는 함수 |
| NFR1.2 출처 한 번 | 순수 함수 시험: 다른 탭 대상이면 탭과 대상이 한 번에 바뀐 상태 |
| Q1 거절 | TabStrip 시험: `onChange`가 `false`를 돌려주면 초점 대상이 바뀌지 않음(키 처리 함수 단위 시험) |

## Assumptions & Open Questions

None.

## Sources

- NFR 요구 `performance-requirements.md`, 검토 review-01(Major 1·2, Minor 2)
- 기능 설계 흐름 1~4, 검토 review-01
- 이 단계 질문 Q1 A(2026-11-20)
- 지금 코드 `published-pdf-item.tsx`, `recipient-screen.tsx`, `publication-detail-screen.tsx`, `materials-screen.tsx`
