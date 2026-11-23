# Unit Test Instructions — u3-reader-views

근거: `code-generation-plan.md`(Testing Contract, Step 1·Step 8·Step 10), 기능 설계 `functional-design/functional-spec.md` 「시나리오」·`rules.md` BR1~BR5, NFR 요구 `nfr-requirements/`, NFR 설계 `nfr-design/performance-design.md` 4 「확인 수단」.

## 실행기와 준비

- Node 내장 시험 실행기(`node --test`), 서버 렌더링은 `web/test/u2-render.mjs`. 새 도구·설정 없음. 미리 `npm --prefix web ci`.
- api·DB가 필요 없다. 받은 사람·작성자 상세·PDF 호출은 시험이 주입하는 가짜 함수로 바꾸고 호출 수를 센다.

## 이 단위 명령

```bash
(cd web && node --test test/reader-tabs.test.mjs test/recipient.test.mjs test/recipient-pdf.test.mjs test/publications-owner.test.mjs test/materials-screen.test.mjs test/pdf-materials-api.test.mjs test/jd-recipient-binding.test.mjs)
```

Step 1 기준선(바꾸기 전 트리, 지금 있는 파일만):

```bash
(cd web && node --test test/recipient.test.mjs test/recipient-pdf.test.mjs test/publications-owner.test.mjs test/materials-screen.test.mjs test/pdf-materials-api.test.mjs test/jd-recipient-binding.test.mjs)
```

사본 고정 자료가 있는 다른 시험 파일을 Step 8에서 고치면 그 파일 이름을 위 명령에 더해 돌린다.

## 기대 커버리지

- 범위(mvp)의 80% 줄 커버리지는 Build and Test가 전체 시험(`npm --prefix web run test:coverage`)으로 잰다. 위 단위 명령은 문턱을 판정하지 않는다. 문턱 설정을 바꾸지 않는다.

## 시나리오(Step 1에서 시험 코드보다 먼저 확정)

| 묶음 | 시나리오 | 기대 결과 | 실패 조건 |
|---|---|---|---|
| 탭 묶음 | P1(2)·P2(3) 사본 | 탭 둘, P1에 1·2, P2에 3·4·5 | 섞임 |
| 탭 묶음 | 프리셋 하나 | 탭 줄과 탭 하나 | 탭 줄 없음 |
| 탭 묶음 | 같은 Catch가 P1·P2 | 두 탭에 각각 | 한 탭에만 |
| 탭 묶음 | 같은 순번에 이름 둘 | 첫 항목 이름 | 다른 이름 |
| 탭 이름 | 50자 이름 | 글자 그대로(말줄임 클래스), 탭 아래 이름 전체, 개수 없음 | 글자 잘림·개수 |
| 탭 이름 | `<b>x</b>`·`<img src=x onerror=alert(1)>` | 글자 그대로, 태그 없음, id에 이름 없음 | 태그 그려짐 |
| 처음 | 화면 열기 | 첫 탭 열림, 다른 패널 `hidden`(패널에 `display` 클래스 없음), 처음 PDF 요청 0 | 다른 탭이 열림·PDF 요청 |
| 키보드 | 오른쪽·왼쪽·끝에서 오른쪽·Home·End | 옆·옆·처음·처음·끝 탭이 열리고 초점 이동 | 열리지 않음 |
| 키보드 | 열린 탭만 `tabIndex=0`, 패널 `tabIndex=0` | 맞음 | 모두 0이거나 패널 없음 |
| 접근성 | 역할 | `tablist`(이름)·`tab`(`aria-selected`·`aria-controls`)·`tabpanel`(`aria-labelledby`) | 빠짐 |
| 응답 | `presetOrdinal` 없음·0·6·1.5, `presetName` 없음·빈 글자·공백만 | 응답 모양 어긋남(조회 실패) | 그대로 그림 |
| 응답 | `pickItem` | 두 칸 옮김, `isFirstCopy`·그 밖 칸 버림 | 칸이 빠지거나 남는 칸이 섞임 |
| 순서 | 받은 사람 화면 | 제목 → 안내 → (Claude) → 발행 시각 → AI 요약 → 발행본 자료 → 질문하기 → JD | 요약이 자료 아래 |
| 대화 | 질문·답 뒤 탭 바꿈 | 그대로, 요청 0 | 사라짐·요청 |
| 출처 | 첫 탭, 출처가 둘째 탭 PDF | 탭과 대상이 한 번에 바뀜, 「(이름) 탭을 열었습니다」 | 탭만 바뀜 |
| 출처 | 같은 탭 | 탭 그대로, 알림 없음 | 알림 |
| 출처 | 돌아가기 | 단추 없음 | 단추 |
| 갱신 | 같은 순번 있음·없음 | 그대로·첫 탭 | 첫 탭으로 튐 |
| 상세 | 작성자 상세 | 같은 탭 줄·키·요약 출처로 다른 탭 | 다름 |
| 자료 화면 | 화살표·Home·End | 「텍스트 자료」「PDF 자료」 옮겨 가며 열림, 이름·자리·`data-testid` 그대로, 두 탭 모두 `tabpanel` | 화살표 안 됨 |
| 자료 화면 | 저장하지 않은 입력이 있고 PDF로 화살표, 확인에서 머무르기 | 탭·초점이 「텍스트 자료」에 그대로 | 초점이 PDF 탭에 남음 |
| 자료 화면 | 같은 상황에서 이동하기 | PDF 탭 열림 | 안 열림 |
| 자료 화면 | 지우기 확인 | 텍스트·PDF 문장 끝에 「프리셋에 담겨 있으면 거기서도 빠집니다.」 | 말 없음 |
| 자료 화면 | PDF를 쓰지 않는 구성 | 지금처럼 탭 줄 없이 텍스트만 | 탭 줄 생김 |

## 모의·시험 자료

- 사본 고정 자료는 항목마다 `presetOrdinal`·`presetName`을 갖게 고친다(지금 시험 자료 포함). 실제 회원 자료를 쓰지 않는다.
- PDF 사본 요청·받은 사람 호출은 기록용 가짜로 호출 수를 센다. 효과(초점·스크롤)는 서버 렌더링에서 돌지 않으므로, 대상 정하기는 순수 함수로 시험하고 실제 초점은 Build and Test에서 브라우저로 본다.
