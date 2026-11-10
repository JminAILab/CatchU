# CR1 규칙 쪽 Catch — 기술 선택

입력:
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 기능 설계 `construction/cr1-readable-catch/functional-design/functional-spec.md`(7. 지금 코드와의 대응)
- 계약 `inception/contract-design/contract-summary.md`

CR1은 새 언어, 프레임워크, 라이브러리, 저장소, 인프라를 들이지 않는다.

| 쓰는 곳 | 선택 | 이유 |
|---|---|---|
| worker 후보 판정·생성 | 지금의 Python 3.12.10 코드(`worker/app/candidates`, `worker/app/generation`) | 규칙만 바꾸고 새 의존이 없다 |
| 가리기 검사 | 지금 `worker/app/generation/redact.py`의 순수 함수를 후보 판정과 생성이 함께 쓰는 worker 모듈로 옮긴다. 새 라이브러리는 없다 | 후보 판정이 생성 쪽을 불러오면 불러오기 순환이 날 수 있다(기능 설계 BR2.4) |
| 부실 판단의 문자·숫자 세기와 문장 부호 빼기 | Python 표준 라이브러리의 유니코드 문자 범주 | 한국어·영어를 같은 규칙으로 센다. 새 의존이 없다 |
| 화면 2줄 말줄임 | web의 지금 CSS 모듈에 여러 줄 말줄임 속성(`-webkit-line-clamp`와 `display: -webkit-box`, `overflow: hidden`)을 더한다 | 지원 브라우저에서 표준처럼 쓰이는 방식이다. 글은 DOM에 그대로 남아 접근 이름이 전체 제목이다 |
| 계약·DB | 바꾸지 않는다 | 계약 C5 |

## 고르지 않은 것

- **화면에서 글자 수로 자르기:** 접근 이름과 상세의 전체 제목이 갈라진다. 또 글자 폭이 다른 한국어·영어에서 2줄을 맞추지 못한다.
- **가리기 검사를 후보 판정 쪽에 따로 두기:** 검사가 두 곳이 되어 판단이 갈릴 수 있다(NFR1.3).
