# 외부 AI 첫 이용 동의 창·한 줄 안내 — 12월 intent U2

계약 C-04의 web 공용 동의 창이다. AI 실행을 접수하는 화면(U4 발행, U10 JD 요약, U8 PDF 업로드)은 api가 403 `AI_CONSENT_REQUIRED`를 주면 이 창을 연다. 기준: U2 [기능 명세](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/functional-spec.md) W2, [업무 규칙](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR2.

```tsx
const { run, dialog } = useAiConsent();
const outcome = await run(() => api.member("/public/links/…/jd-summaries", { method: "POST", body }));
// outcome.kind: "result"(처음 결과 또는 동의 뒤 한 번 다시 보낸 결과) | "declined"([닫기]) | "consent-failed"(동의 기록 실패)
return <>{dialog}{/* 화면 */}</>;
```

- 403 `AI_CONSENT_REQUIRED` → 창 열기 → [동의] → `POST /v1/ai-consent { noticeVersion }` 성공 → 같은 요청을 **한 번만** 다시 보낸다. 또 403이어도 창을 다시 열지 않는다. [닫기]·Esc면 실행하지 않는다.
- 생성 POST라면 다시 보낼 때 같은 재전송 키를 쓰도록 `request` 함수 안에서 같은 키를 넘긴다(「API 호출」).
- 창은 받는 곳 둘(Claude API(Anthropic)·Voyage AI(운영사 MongoDB)), 보내는 기능, 올린 자료를 그대로 보낸다는 사실, 문의 경로 한 줄(저장소 이슈 주소)을 보인다. 접수·회신 약속은 쓰지 않는다.
- 동의 뒤 AI 화면마다 `<AiNoticeLine />` 한 줄을 둔다. 비로그인 질의응답(U5)은 입력란 옆에 같은 한 줄을 둔다.
- `AI_NOTICE_VERSION`(`ai-consent-notice.ts`)은 api의 같은 상수와 같아야 한다. 문구를 바꾸면 두 값을 함께 올린다(`test/u2-consent.test.mjs`가 대조).
- 한도·동의·탈퇴 실패 코드의 안내 문구는 `src/lib/u2-error-messages.ts`에 있다(한도 안내에 남은 횟수를 넣지 않는다).
