# NFR Design Questions — u2-applicant-screens

근거: NFR 요구 `construction/u2-applicant-screens/nfr-requirements/`(performance·security·tech-stack, 검토 review-01), 기능 설계 `construction/u2-applicant-screens/functional-design/`(검토 review-01), 계약 `inception/contract-design/contract-summary.md` P-1·P-2, 지금 코드(`web/src/features/publications/publish-screen.tsx`의 `createSourceLoader`, `web/src/features/github-connection/github-callback-screen.tsx`의 `window.history.replaceState`, Next.js 16.4.5).

앞 단계 검토가 남긴 지적 가운데 설계로 정하면 되는 것(늦게 온 응답 버리기, 접근성 요구 줄, 저장 중 입력, 지우기 실패 뒤 상태 등)은 이 단계 문서에서 정한다. 아래 하나만 사람이 골라야 한다.

## Q1. [개발자] 새 프리셋을 처음 저장한 뒤 주소를 바꾸는 방법

기능 설계는 새 프리셋(`/presets/new`)을 처음 저장하면 「그 프리셋의 편집 화면 주소로 바뀐다」(M3 Q5)고 정했다. 그런데 `/presets/new`와 `/presets/[presetId]`가 서로 다른 주소 파일이라, Next 라우터로 주소를 바꾸면 편집 화면이 새로 그려진다. 그러면 「저장했습니다.」와 이미 불러온 고르기 목록·글자 수가 사라진다(기능 설계 검토 Major).

A. 라우터를 거치지 않고 `window.history.replaceState`로 주소만 `/presets/{presetId}`로 바꾼다. 화면은 그대로 남아 「저장했습니다.」와 불러온 목록이 유지된다. 지금 GitHub 연동 콜백 화면이 같은 방법을 쓴다. 이후 새로고침하면 그 주소의 고치기 화면이 열린다(권장, 가장 단순)
B. 라우터로 `/presets/{presetId}`에 옮긴다(`router.replace`). 새로 그려진 화면이 상세와 고르기 목록을 다시 불러오고, 「저장했습니다.」를 보이도록 한 번 쓰고 버리는 표시(예: 쿼리 `?saved=1`)를 넘긴다. 요청이 한 벌 더 들고 표시를 넘기는 코드가 는다
C. 주소 파일을 하나(`/presets/[presetId]`, 새 프리셋은 `new`라는 값)로 합쳐 같은 화면이 새로 그려지지 않게 한다. 주소 꼴은 그대로지만, `new`가 프리셋 ID 자리에 들어가 ID 검사와 구분이 필요하다
X. Other (please specify)

[Answer]: A — A로 하되, 첫 저장(201) 뒤 화면은 받은 presetId로 고치기 상태가 된다: 다음 [저장]은 PUT /v1/presets/{presetId}, h1은 「프리셋 고치기」, [프리셋 지우기]가 보인다. 첫 저장 뒤 두 번째 저장이 PUT으로 나가고 프리셋이 늘지 않는지 시험으로 확인한다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
