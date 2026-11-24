# NFR Design Questions — u3-reader-views

근거: NFR 요구 `construction/u3-reader-views/nfr-requirements/`(검토 review-01), 기능 설계 `construction/u3-reader-views/functional-design/`(검토 review-01 Major 2), 다듬은 화면 `inception/refined-mockups/interaction-spec.md` TabStrip, 지금 코드 `web/src/features/materials/materials-screen.tsx`(`changeTab`: 텍스트 편집에 저장하지 않은 입력이 있으면 PDF 탭으로 가기 전에 묻고, 머무르기를 고르면 탭을 바꾸지 않음).

앞 단계 검토가 남긴 나머지 지적(빈 프리셋 이름, 같은 순번에 다른 이름, 숨긴 패널과 화면 낭독기·찾기, 추적 번호의 뜻, 확인 수단)은 이 단계 문서에서 정한다. 아래 하나만 사람이 골라야 한다.

## Q1. [개발자] 텍스트 자료 화면에서 저장하지 않은 입력이 있을 때 화살표로 탭을 옮기면

TabStrip은 화살표를 누르면 옆 탭을 바로 열고 초점을 옮긴다(interaction-spec). 그런데 텍스트 자료 화면은 저장하지 않은 입력이 있으면 PDF 탭으로 가기 전에 「저장하지 않은 입력이 있습니다. 이동하시겠습니까?」를 묻고, 머무르기를 고르면 탭을 바꾸지 않는다. 그대로 두면 거절한 뒤 초점이 열리지 않은 탭(`tabindex=-1`)에 남고, 화살표를 누를 때마다 확인 창이 뜬다(기능 설계 검토 Major 2).

A. 지금처럼 화살표·누름마다 묻는다. 거절하면 탭도 초점도 그대로(열린 「텍스트 자료」 탭)에 둔다. TabStrip은 바꾸기 요청이 거절되면 초점을 옮기지 않는다(권장, 가장 단순)
B. 저장하지 않은 입력이 있으면 화살표로는 탭을 옮기지 않고, 누름(Enter·Space·클릭)일 때만 묻는다. 확인 창이 덜 뜨지만, interaction-spec의 「화살표로 옮기면 바로 열린다」와 이 화면에서만 다르게 움직인다
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
