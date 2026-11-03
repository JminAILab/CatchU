/**
 * 브라우저 뒤로·앞으로 가기 미저장 확인(`src/lib/unsaved-traverse-guard.ts`, BR2.2, #461 리뷰 지적)의 판정 시험.
 * Catch 작성자 설명 편집기와 텍스트 자료 편집기가 `useUnsavedGuard`와 함께 쓴다.
 * 같은 문서 안의 이동은 라우터가 바로 반영해 편집 화면이 해제되므로, 그보다 먼저 오는 Navigation API `navigate`에서 묻고
 * 머무르면 이동을 취소한다. 다른 문서로의 이동·취소할 수 없는 이동·같은 주소·기록 추가·미저장 없음은 묻지 않는다.
 * 이벤트는 대역이며 실제 브라우저 확인이 아니다.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { unsavedTraverseGuard } from "../src/lib/unsaved-traverse-guard.ts";

const HERE = "https://catchu.test/assets?catchId=c1";
const MESSAGE = "저장하지 않은 입력이 있습니다. 이동하시겠습니까?";
function traverse(overrides = {}) {
  const event = {
    navigationType: "traverse", cancelable: true, destination: { url: "https://catchu.test/assets", sameDocument: true },
    prevented: false, preventDefault() { event.prevented = true; }, ...overrides,
  };
  return event;
}
const confirmer = (answer) => { const asked = []; return { asked, confirm: (message) => { asked.push(message); return answer; } }; };

test("뒤로·앞으로 가기: 저장하지 않은 입력이 있을 때 머무르면 이동을 취소하고, 계속하면 그대로 이동한다", () => {
  const stay = confirmer(false);
  const back = traverse();
  unsavedTraverseGuard(() => true, () => HERE, stay.confirm, MESSAGE)(back);
  assert.deepEqual(stay.asked, [MESSAGE]);
  assert.equal(back.prevented, true);

  const go = confirmer(true);
  const forward = traverse({ destination: { url: "https://catchu.test/materials", sameDocument: true } });
  unsavedTraverseGuard(() => true, () => HERE, go.confirm, MESSAGE)(forward);
  assert.deepEqual(go.asked, [MESSAGE]);
  assert.equal(forward.prevented, false);
});

test("뒤로·앞으로 가기: 미저장 없음·다른 문서·취소할 수 없는 이동·같은 주소·기록 추가는 묻지 않고 막지 않는다", () => {
  const cases = [
    [false, traverse()],
    [true, traverse({ destination: { url: "https://example.test/", sameDocument: false } })],
    [true, traverse({ cancelable: false })],
    [true, traverse({ destination: { url: HERE, sameDocument: true } })],
    [true, traverse({ navigationType: "push" })],
  ];
  for (const [dirty, event] of cases) {
    const dialog = confirmer(false);
    unsavedTraverseGuard(() => dirty, () => HERE, dialog.confirm, MESSAGE)(event);
    assert.deepEqual(dialog.asked, [], JSON.stringify(event));
    assert.equal(event.prevented, false);
  }
});
