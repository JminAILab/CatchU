# 시작 안내 — 12월 intent U2

기준: U2 [업무 규칙](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR8.1·BR8.2·BR8.3.

- **회원 홈 시작 안내**(`member-start-guide.tsx`, 문구·순서·링크는 `member-start-steps.ts`): 회원 홈 제목 바로 아래에 고정 여섯 단계(Google 로그인 완료 → GitHub 연결·분석 동의 → 저장소 등록·분석 → Catch 설명 → 자료 → 발행·본인 Claude 연결)와 단계마다 메뉴 링크를 늘 보인다. 완료 여부·닫기 상태는 저장하지 않는다. 자료 올리기는 텍스트 자료와 U8 PDF 탭을 함께 둔 `/materials`로 보낸다. 마지막 단계는 U6의 Claude 연결 화면(`/profile/claude`)으로 보낸다.
- **받은 사람 안내 묶음**(`src/components/recipient-guide/`): U4가 받은 사람 화면 위쪽(계약 C-11 수정 PR #421의 slots 0번)에 `<RecipientGuide showClaudeConnect={…} />`로 단다. props는 하나이며 Claude 연결 줄은 U9가 켤 때만 true로 넘긴다(기본 꺼짐). 처음에는 제목만 보이고 항목은 접혀 있다(#606). 제목(h2) 안의 단추가 `aria-expanded`로 접힘·펼침을 알리고, 접힌 항목은 `hidden`으로 화면과 낭독에서 빠지되 DOM에는 남는다. 펼친 상태는 저장하지 않아 화면을 다시 열면 접힌 채로 시작한다. 처음 초점은 지금처럼 U4의 h1이며 단추에 두지 않는다.
- **404·기본 오류 화면**(`src/app/not-found.tsx`, `src/app/error.tsx`, 문구는 `src/components/error-pages/error-page-text.ts`): "페이지를 찾을 수 없습니다"와 홈 링크, "문제가 생겼습니다"와 [다시 시도]·홈 링크. 오류 내용·digest·스택은 화면과 브라우저 로그에 내보내지 않는다.
