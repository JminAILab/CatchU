# Functional Design Questions — u2-applicant-screens

근거: 단위 `inception/units-generation/unit-of-work.md` U2, 이야기 지도 `unit-of-work-story-map.md`(US1.1~US1.6, US2.1, US2.2, US2.4), 이야기 `inception/user-stories/stories.md`, 요구사항 `inception/requirements-analysis/requirements.md` FR1·FR2·NFR1·NFR3·NFR5, 구성 요소 `inception/domain-design/components.md` PresetScreens·PublishScreen·CatchLibrary, 계약 `inception/contract-design/contract-summary.md` P-1·P-2, 다듬은 화면 `inception/refined-mockups/mockups.md` M1~M4·`interaction-spec.md`, U1이 만든 프리셋 API(`api/docs/presets.md`), 지금 코드(`web/src/features/publications/publish-view.tsx`·`publish-sources.ts`, `web/src/components/header/member-header.tsx`, `api/src/catches/owner-catch-input.ts`).

다듬은 화면과 요구사항이 정한 글자·상태·순서는 다시 묻지 않는다. 아래는 앞 단계가 기능 설계로 넘긴 것과, 지금 코드·U1 API와 맞춰 보니 비어 있는 곳이다.

## Q1. [개발자] 프리셋 화면 주소

다듬은 화면은 주소를 기능 설계로 넘겼고, 「발행본」 주소(`/publications`) 아래가 아니어야 한다고 정했다(interaction-spec 「MemberHeader」). 상단 메뉴의 현재 자리 판정은 지금처럼 「주소가 같거나 그 아래」다.

A. 목록 `/presets`, 새 프리셋 `/presets/new`, 고치기 `/presets/{presetId}`. 지금 발행본 주소(`/publications`, `/publications/new`, `/publications/{id}`)와 같은 꼴이다(권장, 가장 단순)
B. 목록 `/presets` 하나에 편집을 쿼리로(`/presets?edit={presetId}`). 주소가 하나라 메뉴 판정은 단순하지만, 새 프리셋을 처음 저장한 뒤 「그 프리셋의 편집 화면 주소로 바뀐다」(M3 Q5)를 쿼리로 다뤄야 한다
X. Other (please specify)

[Answer]: A

## Q2. [개발자] 본인 Catch 목록의 「담을 수 있는 Catch만」 조건 모양

U2가 api `GET /v1/catches`에 이 조건 하나를 더한다(components CatchLibrary, ADR-009). 판정은 발행과 같아야 한다: 공개, 작업 사실·기여 확인됨, 원본 저장소가 보호되지 않음. 지금 이 경로는 `authorDescription=written|unwritten` 같은 쿼리를 받고, 쿼리 값을 커서 범위에 넣는다.

A. 쿼리 `publishable=true` 하나를 더한다. 다른 값·빈 값·두 번은 400(지금 `authorDescription`과 같은 규칙), 커서 범위에 넣고, `authorDescription`과 함께 쓸 수 있다. 판정 SQL은 U1의 PublishableSource 판정과 같은 결과인지 시험으로 묶는다(권장, 가장 단순)
B. 프리셋 전용 새 경로(예: `GET /v1/presets/candidates`)를 만든다. 고르기 목록 응답에 글자 수까지 실을 수 있지만, 쪽 나눔·커서·걸러 보기를 새로 만들어야 해 공수가 Catch 목록 하나만큼 늘어난다
X. Other (please specify)

[Answer]: A

## Q3. [제품 담당] 고르기 단추의 「전체 글이 60,000자를 넘습니다」 막힘을 언제 정하나

다듬은 화면 M3는 담으면 60,000자를 넘는 자료의 단추를 미리 막고 단추 안에 이유를 보인다. 그러려면 고르기 목록의 자료마다 글자 수를 알아야 한다. 지금 Catch·텍스트 자료·PDF 목록 응답에는 글자 수가 없고, U1이 만든 `POST /v1/presets/measure`(자료 1~50개의 글자 수와 이유)가 있다. interaction-spec은 「값을 얻을 수 없으면 M3의 막힘 이유와 글자 수 표시를 다시 정한다」고 넘겼다.

A. 고르기 목록을 불러올 때마다(Catch 20개씩, 텍스트 자료·PDF 목록) 그 쪽의 자료를 `measure`로 한 번 세어, 담으면 넘는 단추를 M3대로 미리 막는다. 쪽마다 요청이 하나 늘고, 세기가 실패하면 그 쪽 단추는 막지 않고 담을 때 서버 검사에 맡긴다(M3 그대로)
B. 미리 막지 않는다. 단추를 누르면 그 자료 하나를 `measure`로 세어, 넘으면 담지 않고 「전체 글이 60,000자를 넘어 담을 수 없습니다.」를 보인다. 요청은 누를 때만 늘지만 M3(단추 안 이유)와 다르게 보인다
C. 미리 막지 않고 세지도 않는다. 담긴 목록의 글자 수는 저장한 뒤에 상세에서만 보이고, 넘으면 저장 때 서버 거부(400 `maxTotalLength`)로 알린다. 가장 단순하지만 M3의 「담긴 자료와 순서 (항목 N개 · M자)」가 저장 전에는 글자 수를 보일 수 없다
X. Other (please specify)

[Answer]: A

## Q4. [제품 담당] 발행 화면의 「발행할 수 없는 자료가 있습니다: (자료 이름)」에 자료가 여럿일 때

프리셋 목록 응답(`PresetSummary.unpublishableItems`)은 그 프리셋의 발행할 수 없는 자료를 모두 준다. 다듬은 화면 M4는 자료 이름 하나만 그렸다.

A. 첫 자료 이름만 쓰고 나머지는 수로: 「발행할 수 없는 자료가 있습니다: Catch C 외 2개」. 단추 글이 길어지지 않는다(권장)
B. 모두 쉼표로 이어 쓴다: 「발행할 수 없는 자료가 있습니다: Catch C, 자기소개서, 포트폴리오.pdf」. 단추가 길어질 수 있다
X. Other (please specify)

[Answer]: A

## Q5. [제품 담당] 발행이 서버에서 막혔을 때(409·400 `blockedSources`) 화면

막힘 응답은 프리셋 ID·자료 종류·자료 ID만 준다(이름은 싣지 않는다, 계약 공통 전제). 다듬은 화면 M4는 「‘자기소개서’ 프리셋의 ‘Catch C’ 때문에 발행할 수 없습니다.」를 지금 막힘 안내 자리에 보인다. 막힘은 고른 뒤 다른 창에서 Catch를 숨긴 경우처럼, 화면이 가진 목록이 이미 낡았을 때 난다.

A. 막히면 프리셋 목록을 다시 불러와, 새 목록의 `unpublishableItems`에서 이름을 찾아 줄마다 「‘(프리셋 이름)’ 프리셋의 ‘(자료 이름)’ 때문에 발행할 수 없습니다.」를 보인다. 이름을 못 찾으면 자료 이름 자리에 종류(「Catch」·「PDF 자료」)를 쓴다. 다시 불러온 목록으로 그 프리셋 단추도 막힘 이유와 함께 막힌다. 고른 프리셋과 입력한 제목·비밀번호는 그대로 둔다(권장)
B. 다시 불러오지 않고, 지금 화면이 가진 목록에서만 이름을 찾는다. 막힘 직전에 숨긴 Catch는 목록에 이유가 없어 이름을 못 찾을 수 있고, 그때는 종류만 보인다
X. Other (please specify)

[Answer]: A — A로 하되, 화면이 막힘 칸을 받도록 web/src/lib/api-response.ts가 details.blockedSources를 옮기게 고친다(#626 리뷰에서 팀원 3이 짚음: 지금은 violations·existingRequestId·catchIds만 옮기고 blockedSources를 버림). api가 더는 보내지 않는 catchIds 처리는 지운다.

## Q6. [제품 담당] 저장한 뒤 원본이 길어져 60,000자를 넘은 프리셋의 [저장]

U1은 저장할 때 담은 자료 글자 합이 60,000자를 넘으면 400(`maxTotalLength`)으로 거부한다(api presets 「검사」). 그래서 상한을 넘은 프리셋은 자료를 빼기 전에는 이름만 바꿔도 저장되지 않는다. 다듬은 화면 M3는 「담긴 자료와 순서」 머리에 「전체 글이 60,000자를 넘어 발행할 수 없습니다.」만 정했다.

A. [저장]은 막지 않는다. 서버가 거부하면 「전체 글이 60,000자를 넘어 저장할 수 없습니다. 자료를 빼 주세요.」를 보이고 입력은 남긴다. 화면에서 따로 세어 막지 않는다(권장, 가장 단순)
B. 담긴 자료 글자 합이 60,000자를 넘으면 [저장]을 막고 같은 안내를 미리 보인다. 서버에 가기 전에 알 수 있지만, 화면이 글자 합을 정확히 알아야 해 Q3의 A 또는 B가 필요하다
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
