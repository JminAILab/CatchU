# 회원 탈퇴 화면 — 12월 intent U2

회원 정보 화면(`/profile`) 아래의 [탈퇴] → 확인창 → [탈퇴하기] → `DELETE /v1/me`. 기준: U2 [기능 명세](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/functional-spec.md) W7, [업무 규칙](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR7, api [탈퇴 안내](../../../../api/docs/withdrawal.md).

| 파일 | 하는 일 |
|---|---|
| `withdrawal.ts` | 문구, 결과 판정(204만 성공), 요청, 탈퇴 뒤 비로그인 홈 주소(`/?withdrawn=1`) |
| `withdrawal-view.tsx` | 버튼·확인창·안내 표시(상태 없음)와 비로그인 홈의 "탈퇴했습니다" |
| `withdrawal-section.tsx` | 요청과 그 뒤 처리 |

- 204면 `window.location.replace("/?withdrawn=1")`로 페이지 전체를 다시 연다. 이 탭의 메모리 토큰이 사라지고, 서버 세션은 이미 폐기·삭제돼 세션 복원도 비로그인으로 끝난다.
- 500 `WITHDRAWAL_FAILED`는 "탈퇴를 끝내지 못했습니다. 팀에 알려 주세요", 응답을 받지 못했으면 결과를 모른다고, 그 밖의 거부는 다시 로그인해 시도하라고 안내한다. 실패를 성공으로 보이지 않고 자동으로 다시 보내지 않는다.
- 비로그인 홈(`src/app/(guest)/page.tsx`)은 쿼리 `withdrawn`이 정확히 `1`일 때만 안내를 보인다. 쿼리에 회원 정보를 넣지 않는다.
