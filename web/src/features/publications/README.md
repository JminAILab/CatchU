# 발행·발행본 화면 (U4 W3·W5)

12월 intent U4(발행·링크) 제출 2의 발행 화면과 작성자 발행본 목록·상세·중지·삭제 화면이다. 주소는 `/publications`(목록)·`/publications/new`(발행)·`/publications/[publicationId]`(상세)이고 회원 헤더의 [발행본]으로 들어간다. 회원 가드·API 호출·토큰은 공통 기반(`(member)` 레이아웃, `api.member`)을 쓰며 이 폴더가 따로 갖지 않는다. 기준: [U4 기능 명세](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md) W3·W5·「작성자 API」·「C-09 합의 전 임시 상태」, [업무 규칙](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/rules.md) BR4·BR5·BR7·BR8, [신뢰성 설계](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/reliability-design.md) 「작성자 실패 안내」, [보안 설계](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md) 「web 화면 출력」, #416 팀장 결정(2026-10-29 Q1 B, 2026-11-02·11-03 [링크 열기]).

## 파일

| 파일 | 역할 |
| --- | --- |
| `publications-api.ts` | 「작성자 API」 호출(`createPublicationsApi(api.member)`), 응답 모양 확인, 보내기 전 길이 검사, 발행 실패 구분(`publishOutcome`)과 안내 문구. 화면과 분리해 시험한다 |
| `publication-format.ts` | 상태·비밀번호·시각 표기와 고정 안내 문구 |
| `publish-sources.ts` | 발행 화면이 고를 수 있는 Catch·텍스트 자료 모양과 고를 수 없는 이유 판정 |
| `publish-view.tsx` | 고르기·순서·입력·확인·완료 화면 그리기 |
| `publish-screen.tsx` | 발행 화면 상태 전이(`createPublishModel`)와 페이지(`PublishPage`). 동의 창은 `useAiConsent`로 연다 |
| `publications-list-view.tsx` / `publications-list-screen.tsx` | 발행본 목록 그리기와 상태 전이(`createPublicationsListModel`) |
| `publication-detail-view.tsx` / `publication-detail-screen.tsx` | 발행본 상세 그리기와 상태 전이(`createPublicationDetailModel`, 중지·삭제) |
| `snapshot-view.tsx` | 사본(C-07 `PublishedSnapshot`) 그리기. 본문·작성자 설명의 GitHub 주소 링크(`LinkedText`), 작성자 설명 칸별 보기와 강조 범위 맞추기 |
| `github-link.tsx` | 작성자 설명 속 GitHub 링크 하나(`GithubLink`): 이름 글자, `href`·`title`은 원래 주소, 숨은 「(새 탭)」. 내 자산 편집 화면의 링크 목록도 쓴다 |
| `publication-link-actions.tsx` | [URL 복사]·[링크 열기] |
| `publications.module.css` | 화면 모양 |
| `src/app/(member)/publications/…/page.tsx` | 주소 연결(목록·`new`·`[publicationId]`) |

GitHub 주소 판정 `isGithubSourceUrl`과 본문 나누기 `splitGithubLinks`는 `src/lib/github-source-url.ts`에 있다. 받은 사람 화면(`src/features/recipient/recipient-format.ts`)은 같은 함수를 재수출한다(동작 변경 없음). 새 Catch NC1의 공통 함수 둘도 `src/lib/`에 있다: `author-description-sections.ts`(작성자 설명 칸 나누기·합치기, 칸 시작 위치)와 `github-link-name.ts`(링크 이름·근거 저장소·링크 모으기). 둘 다 순수 함수이고 이름은 화면에서만 계산해 저장된 글·사본·API 응답은 바꾸지 않는다.

## 주소와 API

| 화면 | 주소 | API |
| --- | --- | --- |
| 발행 | `/publications/new` | `GET /v1/catches`(본인 Catch 목록, 걸러 보기를 켜면 `authorDescription=written`), `GET /v1/me/repositories`(저장소 이름, 열 때 한 번), `GET /v1/text-materials`(제출 1), `POST /v1/publications` |
| 목록 | `/publications` | `GET /v1/publications?limit=20&cursor=` |
| 상세 | `/publications/[publicationId]` | `GET /v1/publications/{id}`, `PUT /v1/publications/{id}/stop`, `DELETE /v1/publications/{id}` |

응답 모양은 기능 명세 「작성자 API」 표 그대로이며 `indexState`는 받지 않는다(있어도 무시). `url`에만 토큰이 있고 화면은 토큰을 따로 꺼내지 않는다(BR10.2).

## 동작

### 발행 (W3)

- 본인 Catch·텍스트 자료를 첫 쪽부터 20개씩 읽고 [더 보기]로 이어 읽는다. 조회 실패는 0건으로 보이지 않고 [목록 다시 불러오기]를 보인다.
- 확인(작업 사실·나의 기여)이 끝나지 않았거나 원본 저장소가 보호된(`restriction = SOURCE_PRIVATE`) Catch는 이유와 함께 고를 수 없다(BR4.2, 화면 표시는 10월 확인·보호 상태). 최종 판정은 발행 트랜잭션이 한다.
- 비공개 Catch를 고르면 "발행하면 이 Catch는 공개로 바뀝니다"를 보인다(BR4.4). 고르고 빼고 순서를 바꾸는 동안 서버에 아무것도 보내지 않는다.
- 새 Catch NC1(BR6.1~BR6.7): 기존 안내 아래에 「저장소마다 3~5개를 권합니다.」 한 줄이 있고, 저장소별로 세거나 경고·추천·순위를 내지 않는다. 「내 Catch」 항목 단추 안 작은 줄은 「저장소 이름 · 공개 상태 · 설명 안 씀 · 불일치 표시됨」 순서다(「설명 안 씀」은 작성자 설명이 없을 때만). 저장소 이름은 화면을 열 때 내 자산 화면과 같은 저장소 목록(`createRepositoryOptionsStore`)을 한 번 끝 쪽까지 읽어 `repositoryId`로 찾고, 못 불러오거나 못 찾으면 이름만 뺀다(고르기·발행은 막지 않는다).
- 「내 Catch」 아래 체크 칸 「작성자 설명을 쓴 Catch만 보기」는 처음 꺼져 있고, 켜고 끄면 Catch 목록만 첫 쪽부터 다시 불러온다(저장소 목록은 다시 부르지 않는다). 개수 줄 「불러온 N개의 Catch」는 `aria-live="polite"`다. 켰는데 맞는 Catch가 없으면 「작성자 설명을 쓴 Catch가 없습니다」다. 발행 중에만 누를 수 없고 목록 불러오기가 실패해도 쓸 수 있다. 고른 항목은 고르기 목록과 따로 있어, 걸러 보기로 목록에서 사라진 항목도 고른 항목·순서·최대 개수에 남는다.
- 확인 단계는 고른 자료 가운데 작성자 설명이 없는 Catch가 1개 이상이면 비공개 안내와 같은 꼴로 「작성자 설명이 없는 Catch가 N개 있습니다. 면접관에게는 「작성자 설명이 없습니다.」로 보입니다.」를 보인다. [발행]은 막지 않는다. 화면은 열 때마다 목록을 새로 불러오므로 「설명 안 씀」은 그때까지 저장된 결과대로 보인다.
- 항목은 1~20개, 제목은 1~50자(앞뒤 공백 제외), 비밀번호는 쓸 때 8~64자(다듬지 않음)다. 넘거나 비면 [다음]에서 보내지 않고 안내한다(BR4.1·BR4.5). 서버 검증이 기준이다.
- 확인 단계는 고른 항목을 순서대로, 비밀번호 여부, "발행 시각부터 90일 뒤 만료, 연장 없음"을 보인 뒤 [발행]을 둔다(BR4.6). 발행 전 미리보기 사본은 만들지 않는다.
- [발행]은 응답까지 버튼을 막는다(BR4.9). 재전송 키는 보내지 않는다. 201과 응답 모양이 맞을 때만 완료 화면이며, 완료 화면은 실제 응답의 링크 주소·상태·발행·만료 시각·비밀번호 여부와 [URL 복사]·[링크 열기]·[발행본 상세 보기]를 보인다(BR5.6). 사본 자체는 상세에서 본다.
- 403 `AI_CONSENT_REQUIRED`는 U2 공용 동의 창(`components/ai-consent`, `useAiConsent().run`)이 열고 [동의] 뒤 같은 요청을 한 번 다시 보낸다. [닫기]면 보내지 않고 입력을 남긴다.
- 실패 안내(신뢰성 설계 「작성자 실패 안내」)는 `publishOutcome` → `publishFailureLines`가 맡는다. 어떤 경우든 고른 항목·순서·제목·비밀번호 입력은 그대로 두고 첫 줄은 "발행되지 않았습니다"다.

| 응답 | 안내 | 화면 |
| --- | --- | --- |
| 409 `CONFIRMATION_REQUIRED` / `SOURCE_RESTRICTED` | 10월 Catch 문구("작업 사실과 나의 기여를 먼저 확인해 주세요." / "원본 저장소가 보호되어 지금은 공개할 수 없습니다.") | `details.catchIds`의 Catch를 고르기·고른 목록에서 표시하고 편집 단계로 돌아간다. 다른 Catch는 그대로 |
| 404 `RESOURCE_UNAVAILABLE` | "고른 자료 중 지금 발행할 수 없는 것이 있습니다. 목록을 다시 불러온 뒤 다시 골라 주세요." | 편집 단계로 돌아간다. [목록 다시 불러오기]는 고르기 패널에 있다 |
| 400 `VALIDATION_FAILED` | `details.violations`의 칸(`title`·`password`·`items`)별 안내. `items`의 `maxTotalLength`(고른 자료의 전체 글 60,000자 초과)는 개수·중복 안내와 구분해 자료를 빼거나 수정할 수 있는 Catch 설명·텍스트 자료 원문을 줄이라고 안내한다. 모르는 칸은 전체 글 상한을 함께 적는다 | 편집 단계로 돌아간다 |
| 403 `AI_CONSENT_REQUIRED` | 동의 창. 창을 거친 뒤에도 403이면 "외부 AI 전송에 먼저 동의해 주세요." | 확인 단계에 남는다 |
| 429 `DAILY_LIMIT_REACHED` | "오늘 한도에 도달했습니다" | 확인 단계에 남는다. 남은 횟수는 보이지 않는다 |
| 429 `RATE_LIMITED` | "발행 요청이 잦아 잠시 발행할 수 없습니다. N초 뒤에 [발행]을 다시 누를 수 있습니다."(`Retry-After`가 있을 때) / "… 잠시 뒤 [발행]을 다시 눌러 주세요."(없을 때) | 남은 초 동안 [발행]을 막고 1초마다 남은 초를 보인다. 자동으로 다시 보내지 않는다. `Retry-After`가 없으면 시간을 추정하지 않고 막지 않는다 |
| 401 `AUTH_*` | 로그인 만료 안내 | 입력은 남지만 공통 인증 모드에 따라 화면이 바뀔 수 있다(텍스트 자료 README 「한계」와 같다) |
| 500·통신 실패·손상된 응답 | "서버에서 처리하지 못했거나 응답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요." | 확인 단계에 남아 [발행]을 다시 누른다 |

- 저장하지 않은 입력(고른 항목·제목·비밀번호)이 있으면 새로고침·창 닫기·링크 이동(`useUnsavedGuard`), 뒤로·앞으로 가기(`useUnsavedTraverseGuard`), 로그아웃·다시 로그인(`useUnsavedChanges`) 전에 묻는다. 완료 뒤에는 묻지 않는다.

### 발행본 목록·상세 (W5)

- 목록은 서버가 준 최신순 그대로 20개씩 읽고 [더 보기]로 이어 읽는다. 제목·상태(유효·중지됨·만료됨)·비밀번호 여부·발행·만료 시각·링크 주소를 보인다. 중지·만료된 발행본도 보인다(BR8.1).
- [URL 복사]는 상태와 관계없이 있고 실제 클립보드 쓰기에 성공했을 때만 "URL을 복사했습니다."를 보인다. 실패하면 주소를 직접 복사하게 보여 준다.
- [링크 열기](#416 2026-11-02·11-03)는 발행 완료·목록·상세 세 화면에 있고, [URL 복사]가 복사하는 것과 같은 서버 응답의 `url`을 `target="_blank"`·`rel="noopener noreferrer"`로 새 탭에서 연다. 서버가 돌려준 `state`가 `ACTIVE`일 때만 보인다. 새 API는 없고 작성자 로그인으로 받은 사람 접근 조건을 우회하지 않는다(새 탭의 받은 사람 화면이 비밀번호·중지·만료를 그대로 판정한다).
- 상세는 `GET /publications/{id}`의 사본을 항목 순서대로 보인다. Catch는 「AI 설명 초안」·「작성자 설명」·「기록에서 확인한 내용」(작업 사실·본인 기여·근거)을 다른 표지로 나누고(AI 설명 초안이 없으면 그 칸을 그리지 않는다, Catch 개편 CR3 BR7.1) 불일치 표시를 단다(BR1.3·BR4.3·BR7.5). 순서와 근거 접기는 받은 사람 화면과 같은 부품이라 같다: 불일치 표지 → AI 설명 초안 → 작성자 설명 → 기록이고, 기록의 본인 기여·근거 목록은 「근거 자세히 보기」에 접혀 있다가 누르거나 요약 근거 단추가 그 안을 가리키면 펼친다(#488, [받은 사람 화면 README](../recipient/README.md) 「동작」). 텍스트 자료는 제목·본문이다. 빈 설명·초안은 다른 값으로 채우지 않는다.
- 작성자 설명은 칸별로 보인다(새 Catch BR7.1~BR7.5). 저장된 글을 칸 제목 줄(`【칸 제목】`)로 나눠 글이 있는 칸만 h5 칸 제목과 그리고, 빈 칸은 h5째 그리지 않는다. 「더 쓰기」 하나뿐이면(칸 제목 줄이 없는 옛 글 포함) h5 없이 지금처럼 글만이고, 다른 칸과 함께면 h5는 「덧붙인 말」이다. 글이 없으면 「작성자 설명이 없습니다.」다. h5 칸 제목은 상수에서만 오고 h4보다 한 단계 작은 굵은 글이다.
- 작성자 설명 속 GitHub 링크는 주소 전체 대신 이름으로 보인다: 파일 줄은 「파일 이름 · L40–58 · 판본 ba6bba8」, 줄 없는 파일·폴더는 「경로 끝 · 판본」, 커밋은 「커밋 ba6bba8」, 커밋 화면에서 줄 번호를 눌러 얻은 바뀐 줄 주소(`#diff-…R16-R23`)는 「커밋 ba6bba8 · 바뀐 줄 16–23」(L 쪽은 「이전 줄」, 파일 이름은 주소에 없다, NC1 로컬 확인 중 팀장 발견 2026-11-10), PR은 「PR #12」, 판본이 커밋 식별값이 아니면 「브랜치 main」이고, 근거 저장소와 다른 저장소면 앞에 「소유자/저장소 · 」가 붙는다. 표에 맞지 않는 꼴(다른 조각·뒤 경로·포트가 든 주소 등)은 지금처럼 주소 전체다. 질의는 이름에서만 무시하고, 경로는 마디마다 풀어 이름에만 쓰며(풀리지 않으면 원문), 제어·서식 문자는 이름에서 지운다. `href`·`title`은 원래 주소이고 긴 이름은 자르지 않고 줄을 바꾼다. 텍스트 자료 본문 링크는 주소 전체 그대로다.
- AI 답의 근거 강조 범위는 저장된 글 전체의 UTF-16 위치로 오므로 칸마다 칸 안 위치로 바꿔 칸 글과 겹치는 부분만 강조한다. 칸 제목 줄·칸 사이 빈 줄에만 걸치면 강조하지 않고, 링크와 겹치면 지금처럼 링크 전체를 감싸며 위치는 원래 주소 길이로 센다. 같은 칸 제목 줄이 두 번 나와 이어 붙인 칸은 강조하지 않는다(FR1.6 한계).
- 본문·작성자 설명 안의 `https://github.com/…` 주소만 새 탭 링크이고 그 밖의 주소는 글자다(#416 Q1 B, NFR1.11). 판정은 받은 사람 화면과 같은 `isGithubSourceUrl`이다. 주소의 끝은 주소 글자(RFC 3986)가 끊기는 곳이며 끝에 붙은 문장 부호·닫는 괄호는 글자로 돌린다. AI 설명 초안·제목·근거의 GitHub가 아닌 주소에는 링크를 만들지 않는다(OQ-U4-NFR-3). 모든 글은 React 텍스트로만 그린다(NFR1.10).
- 고정 안내(BR7.2)는 항상, 저장소 비공개 전환 안내(BR7.3)는 사본에 Catch 항목이 하나라도 있을 때 보인다(사본에는 공개 전환 여부가 없어 Catch 유무로 정했다).
- 링크 중지는 확인 창(되살릴 수 없음 안내) 뒤 `PUT .../stop`을 보내고 응답의 `state`·`stoppedAt`을 그대로 반영한다. 이미 중지면 처음 시각, 만료면 `{EXPIRED, null}`이다(BR8.2). 실패하면 "링크가 중지되지 않았습니다"와 다시 시도이고 상태를 바꾸지 않는다.
- 삭제는 확인 창 뒤 `DELETE`를 보내고 204일 때만 목록으로 옮긴다. 실패(접두어 삭제 실패 500 포함)는 "삭제되지 않았습니다. 다시 시도해 주세요."와 함께 발행본을 그대로 둔다(BR8.4·NFR5.3). 접수만으로 중지·삭제를 표시하지 않는다.
- 조작 요소에는 `data-testid`(`publish-*`, `publications-*`, `publication-*`, `snapshot-*`)를 단다.

## 한계

- 상세의 요약 자리(`data-testid="publication-summary-slot"`)에는 U5 `BaseSummaryPanel` 작성자 모드를 단다(#441). 근거 단추는 받은 사람 화면과 같은 규칙(`resolveEvidenceTarget`)으로 사본의 그 위치를 강조하고 옮긴다. 중지·만료 뒤에도 보인다(계약 C-11 owner-summary).
- 색인 상태(`indexState`)와 [검색 다시 준비]는 C-09 합의 전이라 만들지 않았다(기능 명세 「C-09 합의 전 임시 상태」, OQ-U4-5). 이 상태는 미완성이며 U4 완료 전에 해소한다.
- 받은 사람 판정(비밀번호·중지·만료·삭제 뒤 404)의 브라우저 확인과 [링크 열기]로 연 새 탭의 받은 사람 화면 확인은 제출 3(W4)에서 한다. 제출 2에서는 세 화면의 버튼 주소·새 탭 속성(화면 시험)과 원래 탭의 작성자 화면·입력 유지(브라우저)만 확인한다.
- 링크 복사는 공용 `web/src/lib/copy-text.ts`의 `copyText`를 사용한다. `formatKst`와 상태 표기는 이 폴더에서 관리한다.
- 로그인 만료 때 입력 유지와 뒤로·앞으로 가기 보호의 한계는 [텍스트 자료 README](../materials/README.md) 「한계」와 같다.
- `node --test` 시험은 합성 응답과 서버 렌더링으로 한 행동 시험이다. 화면 컴포넌트의 마운트 효과(열 때 불러오기, 삭제 뒤 이동, 빈도 초과 1초 갱신, 동의 창 열기)는 이 시험에서 돌지 않아 브라우저에서 따로 확인한다.

## 시험

- `node --test test/publish.test.mjs`: 발행 API 경로·201 판정, 작성자 실패 안내 표의 응답별 구분과 문구, 보내기 전 검사, 고르기·순서·고를 수 없는 Catch·20개 상한, 확인 단계와 요청 본문 순서, 실패마다 입력 유지와 409 Catch 표시·편집 단계 복귀, 빈도 초과 버튼 잠금과 자동 재전송 없음, 발행 중 잠금·동의 창 닫기·로그인 변경, 완료 화면의 [링크 열기] 주소·새 탭 속성·`ACTIVE`에만 표시, 화면 `data-testid`. 합성 응답만 쓴다.
- `node --test test/publications-owner.test.mjs`: 목록·상세·중지·삭제 API 경로와 성공 판정, 목록 모델(실패·더 보기·늦은 응답·로그인 변경), 목록 화면([링크 열기]는 `ACTIVE` 행에만), 상세 모델(중지 확인·취소·실패·성공·만료 응답, 삭제 확인·취소·실패 유지·204), 사본 화면(표지 구분·칸 순서·근거 접기(#488), GitHub 주소만 링크, `aiDraft`·제목·그 밖 주소는 글자), GitHub 주소 판정·본문 나누기, 상세 화면([링크 열기]·[링크 중지]는 `ACTIVE`에만, 안내·요약 자리·실패 안내), [URL 복사]의 클립보드 성공·실패. 합성 응답만 쓴다.
- 새 Catch NC1: `publish.test.mjs`에 권장 안내·작은 줄·걸러 보기와 고른 자료 유지·최대 개수·확인 안내·저장소 목록 한 번 부르기·저장소 목록 실패를, `publications-owner.test.mjs`·`../../../test/recipient.test.mjs`에 작성자 설명 칸별 보기·링크 이름·텍스트 자료 본문 주소 전체·강조 맞추기를 더했다. 공통 함수는 `node --test test/author-description-sections.test.mjs test/github-link-name.test.mjs`다.
- 커버리지: `node --test --experimental-test-coverage --test-coverage-include="src/features/publications/**/*.{ts,tsx}" test/publish.test.mjs test/publications-owner.test.mjs`.
