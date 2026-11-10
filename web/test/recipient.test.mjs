// U4 제출 3 — 받은 사람 화면(web/src/features/recipient, /s/[token]) 시험. 10월(#152) 시험을 Step 22(2026-11-06)에서 보안 설계 「web 시험 유지·제거 (R-03)」
// 표대로 정리했다: 「그대로 유지」 묶음(grant 보관·삭제·손상값·저장소 오류, 근거 링크, 비밀번호·grant 비노출)은 바꾸지 않았고, 「응답 모양만 바꿔 유지」 묶음은
// 성공 응답만 C-10 PublishedSnapshot으로 바꿨으며, 「W6와 함께 제거」 묶음(공개 프로필·Catch 목록·다음 페이지·Catch 상세·10/8 자동 생성 안내)은 지웠다.
// 대신 발행본 첫 진입·0~4 자리 배치(G1~G4의 구조 부분)·사본 표지 구분(NFR7.1)·onAccessLost·근거 위치 대조 시험을 더했다.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 W4와 S8·S9·S14의 화면 부분, 보안 요구사항 「안내 중복 통과 조건」 G1~G7, 보안 설계 「web 화면 출력 (Q2 A)」·
// 「받은 사람 화면 자리 (C-11)」, 계약 C-11, BR6.6·BR7.1·BR7.5·BR7.6, NFR1.10·NFR1.11·NFR7.1~NFR7.4, team.md Testing Posture). Step 19(2026-11-05)에서 확정했다.
//
// 표시: [NFR-6 결정] = #416 OQ-U4-NFR-6 팀장 결정(2026-11-05, 1번 A·2번 예). 작성자(소유 회원) 비활성은 api가 404 LINK_UNAVAILABLE로 주므로 화면은 링크 불가
//      공통 화면이고 따로 구분하지 않는다. 작성자 회원 행 없음 500은 조회 실패(링크 불가 아님). 화면은 api 응답 코드만 따른다.
//
// 화면 자리 G1~G4 (C-11 slot 0·guide-rule; 세 상태를 그려 확인)
//   - 기대: 판정 통과 화면 = U4 h1(tabIndex={-1}, 첫 초점) → 0번 RecipientGuide(U2, showClaudeConnect={false}) 정확히 1개 → U4 고정 안내(발행 시각) → 1번 발행본 자료
//           → 2 BaseSummaryPanel(U5) → 3 QnaPanel(U5) → 4번 자리(U10 제공 전 빈 자리). 비밀번호 입력 화면과 접근 불가 화면 = U4 h1(첫 초점)과 U4 안내만, RecipientGuide 0개(G1·G2).
//           각 상태의 h1은 U4 것 하나뿐이고 RecipientGuide 안에 h1이 없다(G3). 상태가 바뀔 때 첫 초점은 U4 h1로 가고 RecipientGuide 안 요소로 가지 않는다(G4).
//   - 실패 조건: RecipientGuide가 2개이거나 비밀번호·불가 화면에 있음, showClaudeConnect 생략, h1 2개, 첫 초점이 안내 안으로 감.
//   - G4의 초점 이동 자체는 DOM이 필요해 여기서는 h1의 tabIndex와 비밀번호 입력에 autoFocus가 없음만 보고, 실제 이동(첫 진입 포함)은 브라우저에서 확인한다.
// G5~G7 (web 시험이 아니라 문구 검토): G5·G6은 U4 고정 안내 문구(발행 시각만)를 PR 「리뷰 요청」 체크리스트로 본다. 여기서는 U4 영역에 U2 안내 문장이
//   그대로 들어 있지 않은지만 기계적으로 본다. G7은 #423 병합 뒤 U2 base-summary·link-conditions 문구를 #416 결정 문장과 대조하고, 다르면 U4는 고치지 않고 U2 담당에게 알린다.
// 발행본 자료 1번 자리 (US4.4, BR6.6·BR7.5·BR7.6, NFR1.10·NFR1.11·NFR7.1, C-11)
//   - 기대: items를 position 순서로 그린다. Catch 항목은 기록(workFacts·subjectContribution·evidence)·작성자 설명(authorDescription)·AI 설명 초안(aiDraft)·불일치
//           표지(mismatch)를 서로 다른 표지로 구분하고 섞지 않는다. 텍스트 자료 항목은 제목·본문. 근거 원문은 evidence[].sourceUrl이 isGithubSourceUrl일 때만
//           target="_blank"·rel="noopener noreferrer"·"(새 탭)" 링크이고 그 밖은 글자. 본문·작성자 설명 안 GitHub 주소는 작성자 사본과 같은 Q1 B 규칙 함수로만 링크하고,
//           aiDraft에는 링크를 만들지 않는다. showEvidence(location)는 publishedItemId·fieldPath 항목을 보이고 [charStart, charEnd)를 강조하며, 사본에 없는 위치면
//           강조 없이 그 항목만 보인다. token·getGrant·onAccessLost·isLoggedIn·showEvidence를 RecipientSlotProps로 넘긴다(OQ-U4-7대로 화면 안 형).
//   - 실패 조건: aiDraft가 작성자 설명과 섞임, GitHub 외 주소가 링크, 본문이 HTML로 삽입됨, 10월 PublicProfile·PublicCatch 모양을 기대함, 빠진 위치에 강조.
// 판정 응답 처리 (W4-3·4, S8·S9·S14 화면 부분; 기대 동작은 10월과 같고 성공 응답만 PublishedSnapshot)
//   - 기대: GET 404 LINK_UNAVAILABLE → 사유 없는 공통 「이 링크는 열람할 수 없습니다」 화면, 그 링크 grant만 삭제(다른 링크 grant 유지). 401 LINK_PASSWORD_REQUIRED →
//           비밀번호 입력 화면, 받아 둔 grant가 거부되면 지우고 다시 입력 안내. unlock 200 { grant } → 그 링크에만 grant 저장(sessionStorage 링크별 키) 뒤 X-Link-Grant로
//           다시 GET. unlock 401 LINK_PASSWORD_INVALID만 비밀번호 오류로 안내하고 통신 실패·500·400은 확인 실패. 429 LINK_UNLOCK_LIMITED + Retry-After → 남은 시간 동안
//           보내지 않고 자동 재시도 없음, Retry-After가 없거나 틀리면 추정하지 않음. 확인 중 404 → 공통 화면이고 grant를 남기지 않음. 빈 비밀번호는 보내지 않고 확인 중
//           중복 전송 없음. 손상된 성공 응답은 성공으로 바꾸지 않음. 다시 조회 실패는 이전 화면 유지(NFR6.1), 확정 거부(404·401)는 이전 자료 삭제. 늦은 응답·화면 해제 뒤
//           응답은 버림. 붙는 컴포넌트가 onAccessLost(code)를 부르면 같은 전환과 grant 삭제. 토큰은 경로에만, 비밀번호는 본문으로만, grant는 헤더로만.
//   - 실패 조건: 404 사유 노출, 다른 링크 grant 사용, 429 중 자동 재전송, 비밀번호·grant 원문이 상태·로그에 남음, 조회 실패를 링크 불가로 바꿈.
//
// 원본 tsx는 u2-render.mjs로 변환해 불러온다. 실제 브라우저·api·DB 검증이 아니다(그 확인은 Step 23·브라우저 확인).

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRecipientApi, readPublishedSnapshot } from "../src/features/recipient/recipient-api.ts";
import { createGrantStore, GRANT_KEY_PREFIX, GRANT_MAX_LENGTH } from "../src/features/recipient/recipient-grants.ts";
import { createRecipientPublicationStore } from "../src/features/recipient/recipient-store.ts";
import { fieldText, resolveEvidenceTarget } from "../src/features/recipient/recipient-slots.ts";
import {
  isGithubSourceUrl, LINK_UNAVAILABLE_TEXT, PASSWORD_REQUIRED_TITLE, PUBLISHED_AT_LABEL, publishedAtText, unlockMessage,
} from "../src/features/recipient/recipient-format.ts";
import { formatKst } from "../src/features/publications/publication-format.ts";
import { load } from "./u2-render.mjs";

// 2·3번 자리의 U5 패널이 불러오는 lib/api.ts가 읽는 값이다. 이 주소로 나가는 요청은 없다(서버 렌더링에서는 효과가 돌지 않는다).
process.env.NEXT_PUBLIC_API_BASE_URL ??= "http://127.0.0.1:3001";

const { RecipientPublicationView } = await load("features/recipient/recipient-view.tsx");
const { RECIPIENT_GUIDE_ITEMS } = await load("components/recipient-guide/recipient-guide-items.ts");
const { INITIAL_EVIDENCE_TOGGLE, evidenceDetailsOpen, isInEvidenceDetails } = await load("features/publications/snapshot-view.tsx");

const TOKEN = "tok_A";
const OTHER = "tok_B";
const PASSWORD = "secret-pass-1";
const PUBLISHED_AT = "2026-11-05T03:04:05.000Z";
const EXPIRES_AT = "2027-02-03T03:04:05.000Z";

const catchItem = (id, position, patch = {}) => ({
  publishedItemId: id, position, itemKind: "CATCH", title: `Catch ${id}`,
  snapshot: {
    workFacts: [`사실 ${id}`, "둘째 사실"], subjectContribution: "본인 커밋",
    evidence: [{ sourceUrl: `https://github.com/o/r/commit/${id}`, sourceRevision: "abc", representedFacts: ["파일 1개"] }],
    authorDescription: `작성자 설명 https://github.com/o/r/pull/1 참고`, aiDraft: "AI 초안 글 https://github.com/o/r/issues/9", mismatch: false, ...patch,
  },
});
const textItem = (id, position, body = "본문 글") => ({ publishedItemId: id, position, itemKind: "TEXT_MATERIAL", title: `자료 ${id}`, snapshot: { body } });
const publication = (items = [catchItem("c1", 1)], patch = {}) => ({ title: "발행본 제목", publishedAt: PUBLISHED_AT, expiresAt: EXPIRES_AT, items, ...patch });
const ok = (data, status = 200) => ({ kind: "success", status, data });
const lookupFailed = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const apiError = (status, code, extra = {}) => ({ kind: "api-error", status, code, message: "안내", ...extra });
const unavailable = apiError(404, "LINK_UNAVAILABLE");
const passwordRequired = apiError(401, "LINK_PASSWORD_REQUIRED");
const passwordInvalid = apiError(401, "LINK_PASSWORD_INVALID");
const serverError = apiError(500, "INTERNAL_ERROR");
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

/** 호출을 기록하고 큐에 넣은 응답을 순서대로 돌려주는 가짜 api.recipient. */
function fakeRecipient() {
  const calls = [];
  const queue = [];
  const recipient = (path, request) => {
    calls.push({ path, request });
    const next = queue.shift();
    if (!next) throw new Error(`응답이 준비되지 않은 호출: ${path}`);
    return typeof next === "function" ? next(request) : Promise.resolve(next);
  };
  return { calls, queue, recipient };
}

/** Storage 대역. `broken`이면 모든 접근이 예외를 던진다. */
function fakeStorage({ broken = false, failSet = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem(key) { if (broken) throw new Error("blocked"); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { if (broken || failSet) throw new Error("quota"); map.set(key, String(value)); },
    removeItem(key) { if (broken) throw new Error("blocked"); map.delete(key); },
  };
}

function setup({ storage = fakeStorage(), now } = {}) {
  const fake = fakeRecipient();
  const api = createRecipientApi(fake.recipient);
  const grants = createGrantStore(() => storage);
  let clock = 1_000_000;
  const time = now ?? (() => clock);
  const advance = (ms) => { clock += ms; };
  const publicationStore = (token = TOKEN) => createRecipientPublicationStore({ api, grants, token, now: time });
  return { ...fake, api, grants, storage, advance, publicationStore };
}

// ── 응답 모양 검사 ───────────────────────────────────────────────

test("주소: 토큰을 경로에 인코딩하고 쿼리를 보내지 않는다. 비밀번호는 본문으로만, grant는 헤더로만 보낸다", async () => {
  const { api, calls, queue } = setup();
  queue.push(ok(publication()), ok(publication()), ok({ grant: "g-1" }));
  await api.publication("t/1?x", null);
  await api.publication("t/1?x", "g-1");
  await api.unlock("t/1?x", PASSWORD);
  assert.equal(calls[0].path, "/public/links/t%2F1%3Fx");
  assert.equal(calls[0].request.method, "GET");
  assert.equal(calls[0].request.linkGrant, undefined);
  assert.equal(calls[1].request.linkGrant, "g-1");
  assert.equal(calls[2].path, "/public/links/t%2F1%3Fx/unlock");
  assert.deepEqual(calls[2].request.body, { password: PASSWORD });
  for (const call of calls) {
    assert.ok(!call.path.includes(PASSWORD) && !call.path.includes("g-1"), "비밀번호·grant가 주소에 없다");
    assert.ok(!call.path.includes("?"), "쿼리 없음(정의 밖 쿼리는 api가 400)");
    assert.equal(call.request.idempotencyKey, undefined);
  }
});

test("손상된 성공 응답·200이 아닌 성공은 성공이나 0건으로 바꾸지 않는다", async () => {
  const { api, queue } = setup();
  queue.push(
    ok({ title: "t", publishedAt: PUBLISHED_AT, expiresAt: EXPIRES_AT, items: "x" }),
    ok(publication([{ ...catchItem("c1", 1), itemKind: "VIDEO" }])),
    ok(publication([catchItem("c1", 1, { mismatch: "yes" })])),
    ok(publication(), 201),
    ok({ grant: "" }),
    () => { throw new Error("network"); },
  );
  for (let i = 0; i < 4; i += 1) assert.equal((await api.publication(TOKEN, null)).kind, "lookup-failed", `${i}번째 손상 응답`);
  assert.equal((await api.unlock(TOKEN, PASSWORD)).kind, "lookup-failed");
  assert.equal((await api.publication(TOKEN, null)).kind, "lookup-failed");
});

test("사본은 C-07 모양 그대로 받고(항목 0개도 정상), 계약 밖 칸(indexState·원본 ID·본인용 정보)은 화면 자료에 싣지 않는다", () => {
  const raw = publication(
    [{ ...catchItem("c1", 2), sourceCatchId: "src-1", snapshot: { ...catchItem("c1", 2).snapshot, reflection: { questions: ["본인용"] } } }, textItem("m1", 1)],
    { indexState: "READY", publicationId: "p-1" },
  );
  const data = readPublishedSnapshot(raw);
  assert.ok(data);
  assert.deepEqual(Object.keys(data), ["title", "publishedAt", "expiresAt", "items"]);
  assert.deepEqual(data.items.map((item) => item.publishedItemId), ["c1", "m1"], "순서는 화면이 position으로 정렬한다");
  assert.equal("sourceCatchId" in data.items[0], false);
  assert.equal("reflection" in data.items[0].snapshot, false);
  assert.equal(data.items[0].snapshot.aiDraft, catchItem("c1", 2).snapshot.aiDraft);
  assert.deepEqual(readPublishedSnapshot(publication([])).items, []);
  assert.equal(readPublishedSnapshot(publication([catchItem("c1", 1, { authorDescription: 3 })])), null);
});

// ── grant 보관(그대로 유지) ─────────────────────────────────────

test("grant는 링크별로 sessionStorage에 따로 두고, 지우면 그 링크 것만 지운다", () => {
  const storage = fakeStorage();
  const grants = createGrantStore(() => storage);
  grants.set(TOKEN, "g-A");
  grants.set(OTHER, "g-B");
  assert.equal(storage.map.get(`${GRANT_KEY_PREFIX}${TOKEN}`), "g-A");
  assert.equal(grants.get(TOKEN), "g-A");
  assert.equal(grants.get(OTHER), "g-B");
  grants.remove(TOKEN);
  assert.equal(grants.get(TOKEN), null);
  assert.equal(grants.get(OTHER), "g-B");
});

test("손상된 저장값(빈 값·헤더에 실을 수 없는 문자·지나치게 긴 값)은 쓰지 않고 지운다", () => {
  const storage = fakeStorage();
  for (const bad of ["", "한글", "a b", "x".repeat(GRANT_MAX_LENGTH + 1)]) {
    // 페이지를 새로 열 때 저장소에 손상된 값이 들어 있는 경우
    storage.map.set(`${GRANT_KEY_PREFIX}${TOKEN}`, bad);
    const opened = createGrantStore(() => storage);
    assert.equal(opened.get(TOKEN), null);
    assert.equal(storage.map.has(`${GRANT_KEY_PREFIX}${TOKEN}`), false);
  }
  const grants = createGrantStore(() => storage);
  grants.set(TOKEN, "bad value");
  assert.equal(grants.get(TOKEN), null, "손상된 값은 보관하지 않는다");
});

test("저장소를 쓸 수 없거나 저장에 실패하면 이 화면의 메모리에만 두고, 영속 저장소로 옮기지 않는다", () => {
  const broken = createGrantStore(() => fakeStorage({ broken: true }));
  broken.set(TOKEN, "g-A");
  assert.equal(broken.get(TOKEN), "g-A");
  assert.equal(broken.get(OTHER), null);
  broken.remove(TOKEN);
  assert.equal(broken.get(TOKEN), null);

  const throwing = createGrantStore(() => { throw new Error("SecurityError"); });
  throwing.set(TOKEN, "g-A");
  assert.equal(throwing.get(TOKEN), "g-A");

  const full = fakeStorage({ failSet: true });
  const quota = createGrantStore(() => full);
  quota.set(TOKEN, "g-A");
  assert.equal(full.map.size, 0);
  assert.equal(quota.get(TOKEN), "g-A");
});

// ── 저장소 오류에서의 grant(검토 지적: 읽기는 되고 쓰기·지우기가 실패하는 저장소) ─────
// 저장소 오류 주입 시험이다. 서버 판정은 가짜 api.recipient의 응답으로 대신한다.

/** 이전 grant가 남은 Storage 대역. `failWrite`면 setItem·removeItem만 실패하고, `broken`이면 모든 접근이 실패한다. 실행 중 바꿀 수 있다. */
function staleStorage(entries = {}) {
  const map = new Map(Object.entries(entries).map(([token, grant]) => [`${GRANT_KEY_PREFIX}${token}`, grant]));
  const flags = { failWrite: false, broken: false };
  return {
    map,
    flags,
    getItem(key) { if (flags.broken) throw new Error("blocked"); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { if (flags.broken || flags.failWrite) throw new Error("quota"); map.set(key, String(value)); },
    removeItem(key) { if (flags.broken || flags.failWrite) throw new Error("blocked"); map.delete(key); },
  };
}

test("저장소 쓰기·지우기가 실패해도: 거부된 이전 grant 대신 비밀번호 확인으로 받은 새 grant로 발행본을 읽는다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old" });
  storage.flags.failWrite = true;
  const { queue, calls, publicationStore } = setup({ storage });
  queue.push(passwordRequired, ok({ grant: "g-new" }), ok(publication()));
  const store = publicationStore();
  await store.load();
  assert.equal(calls[0].request.linkGrant, "g-old");
  assert.equal(store.getSnapshot().unlock.reentry, true);
  assert.equal(await store.unlock(PASSWORD), "granted");
  assert.equal(calls[2].request.linkGrant, "g-new", "비밀번호 확인 뒤 조회는 새 grant");
  assert.equal(store.getSnapshot().view, "ready", "비밀번호 입력으로 되돌아가지 않는다");

  queue.push(ok(publication()));
  const reopened = publicationStore();
  await reopened.load();
  assert.equal(calls[3].request.linkGrant, "g-new", "같은 탭에서 다시 연 화면도 새 grant");
  assert.equal(storage.map.get(`${GRANT_KEY_PREFIX}${TOKEN}`), "g-old", "주입: 저장소에는 이전 값이 남아 있다");
});

test("저장소 지우기가 실패해도: 링크 불가로 지운 grant는 같은 실행 중 다시 보내지 않는다(새 값도 이전 값도)", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old" });
  storage.flags.failWrite = true;
  const { queue, calls, publicationStore } = setup({ storage });
  queue.push(passwordRequired, ok({ grant: "g-new" }), ok(publication()), unavailable, passwordRequired);
  const store = publicationStore();
  await store.load();
  await store.unlock(PASSWORD);
  assert.equal(calls[2].request.linkGrant, "g-new");
  const stopped = publicationStore();
  await stopped.load();
  assert.deepEqual(stopped.getSnapshot(), { view: "unavailable" });
  const again = publicationStore();
  await again.load();
  assert.equal(calls[4].request.linkGrant, undefined, "지운 grant가 되살아나지 않는다");
  assert.equal(again.getSnapshot().unlock.reentry, false);
});

test("저장소 접근이 실패했다가 복구돼도 저장소의 이전 값이 최신 grant·삭제 상태를 덮지 않는다. 다른 링크는 영향이 없다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old", [OTHER]: "g-B" });
  const { queue, calls, publicationStore } = setup({ storage });
  storage.flags.broken = true;
  queue.push(passwordRequired, ok({ grant: "g-new" }), ok(publication()));
  const first = publicationStore();
  await first.load();
  assert.equal(calls[0].request.linkGrant, undefined, "읽을 수 없으면 grant 없이 요청");
  await first.unlock(PASSWORD);
  assert.equal(calls[2].request.linkGrant, "g-new");

  storage.flags.broken = false; // 복구: 저장소에는 이전 값이 그대로 있다
  queue.push(ok(publication()));
  const second = publicationStore();
  await second.load();
  assert.equal(calls[3].request.linkGrant, "g-new", "복구 뒤에도 최신 grant");

  storage.flags.broken = true;
  queue.push(unavailable);
  const third = publicationStore();
  await third.load();
  storage.flags.broken = false;
  queue.push(passwordRequired);
  const fourth = publicationStore();
  await fourth.load();
  assert.equal(calls[5].request.linkGrant, undefined, "복구 뒤에도 삭제 상태 유지");

  queue.push(ok(publication()));
  const other = publicationStore(OTHER);
  await other.load();
  assert.equal(calls[6].request.linkGrant, "g-B", "다른 링크의 저장된 grant는 그대로 쓴다");
});

test("저장만 실패(용량)하면: 이 실행에서는 새 grant를 쓰고, 남아 있던 이전 값은 지워 새로 고친 뒤에도 이전 grant를 보내지 않는다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old" });
  const { api, queue, calls, publicationStore } = setup({ storage });
  queue.push(passwordRequired, ok({ grant: "g-new" }), ok(publication()));
  const store = publicationStore();
  storage.flags.failWrite = true; // 401 때 이전 값 지우기 실패
  await store.load();
  storage.flags.failWrite = false;
  storage.setItem = () => { throw new Error("quota"); }; // 지우기는 되고 저장만 실패
  await store.unlock(PASSWORD);
  assert.equal(calls[2].request.linkGrant, "g-new");

  queue.push(passwordRequired);
  const after = createRecipientPublicationStore({ api, grants: createGrantStore(() => storage), token: TOKEN });
  await after.load();
  assert.equal(calls[3].request.linkGrant, undefined, "새로 고친 뒤: 새 grant는 남지 않았고 이전 grant도 보내지 않는다(다시 입력)");
});

test("정상 저장소: 만료·무효 grant 거부 → 다시 입력 → 새 grant를 sessionStorage에 두고, 새로 고친 뒤에도 재사용한다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-expired" });
  const { api, queue, calls, publicationStore } = setup({ storage });
  queue.push(passwordRequired, ok({ grant: "g-fresh" }), ok(publication()));
  const store = publicationStore();
  await store.load();
  assert.equal(calls[0].request.linkGrant, "g-expired");
  assert.equal(store.getSnapshot().unlock.reentry, true);
  assert.equal(storage.map.has(`${GRANT_KEY_PREFIX}${TOKEN}`), false, "거부된 grant는 저장소에서도 지운다");
  await store.unlock(PASSWORD);
  assert.equal(calls[2].request.linkGrant, "g-fresh");
  assert.equal(store.getSnapshot().view, "ready");
  assert.equal(storage.map.get(`${GRANT_KEY_PREFIX}${TOKEN}`), "g-fresh");

  // 새로 고침: 메모리는 사라지고 같은 탭의 sessionStorage만 남는다.
  const reloaded = createGrantStore(() => storage);
  queue.push(ok(publication()));
  const after = createRecipientPublicationStore({ api, grants: reloaded, token: TOKEN });
  await after.load();
  assert.equal(calls[3].request.linkGrant, "g-fresh", "새로 고친 뒤에도 재사용");
});

// ── 첫 진입·접근 분기(S8·S9·S14 화면 부분) ────────────────────────

test("첫 진입: 불러오는 중 → 발행본. 항목 0개도 정상이고 조회 실패(500·통신 실패·예상 밖 코드)와 다르다 [NFR-6 결정: 회원 행 없음 500도 조회 실패]", async () => {
  const { queue, publicationStore } = setup();
  const pending = deferred();
  queue.push(() => pending.promise);
  const store = publicationStore();
  const loading = store.load();
  assert.equal(store.getSnapshot().view, "loading");
  pending.resolve(ok(publication([textItem("m1", 2), catchItem("c1", 1)])));
  await loading;
  const ready = store.getSnapshot();
  assert.equal(ready.view, "ready");
  assert.equal(ready.snapshot.title, "발행본 제목");
  assert.equal(ready.snapshot.items.length, 2);

  queue.push(ok(publication([])));
  const empty = publicationStore();
  await empty.load();
  assert.equal(empty.getSnapshot().view, "ready");

  for (const failure of [serverError, lookupFailed, apiError(400, "INVALID_REQUEST"), apiError(403, "SOMETHING"), apiError(404, "RESOURCE_UNAVAILABLE")]) {
    const fresh = publicationStore();
    queue.push(failure);
    await fresh.load();
    assert.equal(fresh.getSnapshot().view, "failed", `${failure.code}는 조회 실패`);
  }
});

test("링크 불가 404는 사유 없이 공통 화면이고, 받아 둔 grant를 지운다. 다른 링크의 grant는 그대로다 [NFR-6 결정: 작성자 비활성도 같은 화면]", async () => {
  const { queue, grants, publicationStore } = setup();
  grants.set(TOKEN, "g-A");
  grants.set(OTHER, "g-B");
  queue.push(unavailable);
  const store = publicationStore();
  await store.load();
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" });
  assert.equal(grants.get(TOKEN), null);
  assert.equal(grants.get(OTHER), "g-B");
});

test("비밀번호 401은 회원 로그인 이동 없이 비밀번호 입력으로 간다. 받아 둔 grant가 거부되면 지우고 다시 입력을 안내한다", async () => {
  const { queue, calls, grants, publicationStore } = setup();
  queue.push(passwordRequired);
  const first = publicationStore();
  await first.load();
  assert.equal(first.getSnapshot().view, "password");
  assert.equal(first.getSnapshot().unlock.reentry, false);
  assert.equal(calls[0].request.linkGrant, undefined);

  grants.set(TOKEN, "expired-grant");
  queue.push(passwordRequired);
  const again = publicationStore();
  await again.load();
  assert.equal(calls[1].request.linkGrant, "expired-grant");
  assert.equal(again.getSnapshot().view, "password");
  assert.equal(again.getSnapshot().unlock.reentry, true);
  assert.equal(grants.get(TOKEN), null);
  assert.equal(unlockMessage(again.getSnapshot().unlock, 0).text, "비밀번호를 다시 입력해 주세요.");
});

// ── 비밀번호 확인 ───────────────────────────────────────────────

test("비밀번호 확인 성공: 이 링크에만 grant를 두고 grant로 발행본을 읽는다. 다른 링크 요청에는 그 grant를 쓰지 않는다", async () => {
  const { queue, calls, grants, publicationStore } = setup();
  queue.push(passwordRequired, ok({ grant: "g-A" }), ok(publication()));
  const store = publicationStore();
  await store.load();
  assert.equal(await store.unlock(PASSWORD), "granted");
  assert.equal(grants.get(TOKEN), "g-A");
  assert.equal(calls[2].request.linkGrant, "g-A");
  assert.equal(store.getSnapshot().view, "ready");

  queue.push(passwordRequired);
  const other = publicationStore(OTHER);
  await other.load();
  assert.equal(calls[3].request.linkGrant, undefined, "다른 링크에는 이 링크의 grant를 보내지 않는다");
  assert.equal(other.getSnapshot().view, "password");
});

test("빈 비밀번호는 보내지 않고 안내한다. 확인 중에는 다시 보내지 않는다", async () => {
  const { queue, calls, publicationStore } = setup();
  queue.push(passwordRequired);
  const store = publicationStore();
  await store.load();
  assert.equal(await store.unlock(""), "empty");
  assert.equal(calls.length, 1);
  assert.equal(store.getSnapshot().unlock.phase, "empty");

  const pending = deferred();
  queue.push(() => pending.promise);
  const first = store.unlock(PASSWORD);
  assert.equal(store.getSnapshot().unlock.phase, "submitting");
  assert.equal(await store.unlock(PASSWORD), "ignored");
  assert.equal(calls.length, 2, "확인 중 반복 제출은 요청하지 않는다");
  pending.resolve(passwordInvalid);
  assert.equal(await first, "invalid");
});

test("비밀번호 오류는 확인된 불일치(401 INVALID)에만 쓰고, 통신 실패·500·400은 확인 실패로 둔다", async () => {
  const { queue, publicationStore } = setup();
  queue.push(passwordRequired);
  const store = publicationStore();
  await store.load();
  queue.push(passwordInvalid);
  assert.equal(await store.unlock("wrong"), "invalid");
  assert.equal(store.getSnapshot().unlock.phase, "invalid");
  assert.equal(unlockMessage(store.getSnapshot().unlock, 0).text, "비밀번호가 맞지 않습니다.");
  for (const failure of [lookupFailed, serverError, apiError(400, "INVALID_REQUEST")]) {
    queue.push(failure);
    assert.equal(await store.unlock(PASSWORD), "failed");
    const message = unlockMessage(store.getSnapshot().unlock, 0);
    assert.notEqual(message.text, "비밀번호가 맞지 않습니다.");
  }
});

test("시도 제한 429: 남은 시간 동안 보내지 않고, 시간이 지나도 자동으로 다시 보내지 않으며, 지난 뒤 누르면 보낸다", async () => {
  const { queue, calls, advance, publicationStore } = setup();
  queue.push(passwordRequired);
  const store = publicationStore();
  await store.load();
  queue.push({ ...apiError(429, "LINK_UNLOCK_LIMITED"), retryAfterSeconds: 90 });
  assert.equal(await store.unlock(PASSWORD), "limited");
  const limited = store.getSnapshot().unlock;
  assert.equal(limited.phase, "limited");
  assert.equal(store.retryWaitSeconds(), 90);
  assert.match(unlockMessage(limited, store.retryWaitSeconds()).text, /90초 뒤/);
  assert.notEqual(unlockMessage(limited, 90).text, "비밀번호가 맞지 않습니다.", "차단을 비밀번호 오류로 표시하지 않는다");
  assert.equal(await store.unlock(PASSWORD), "ignored");
  advance(89_500);
  assert.equal(store.retryWaitSeconds(), 1, "남은 초는 올림");
  assert.equal(await store.unlock(PASSWORD), "ignored");
  assert.equal(calls.length, 2);
  advance(1_000);
  assert.equal(store.retryWaitSeconds(), 0);
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(calls.length, 2, "기한이 지나도 자동 재전송 없음");
  queue.push(ok({ grant: "g-A" }), ok(publication()));
  assert.equal(await store.unlock(PASSWORD), "granted");
  assert.equal(calls.length, 4);
});

test("Retry-After가 없거나 형식이 틀린 429는 남은 시간을 추정하지 않고, 사용자가 누를 때 보낸다", async () => {
  const { queue, calls, publicationStore } = setup();
  queue.push(passwordRequired);
  const store = publicationStore();
  await store.load();
  queue.push(apiError(429, "LINK_UNLOCK_LIMITED"));
  assert.equal(await store.unlock(PASSWORD), "limited");
  assert.equal(store.getSnapshot().unlock.retryAt, null);
  assert.equal(store.retryWaitSeconds(), 0);
  assert.match(unlockMessage(store.getSnapshot().unlock, 0).text, /잠시 뒤/);
  queue.push(passwordInvalid);
  assert.equal(await store.unlock(PASSWORD), "invalid");
  assert.equal(calls.length, 3);
});

test("비밀번호 확인 중 링크가 불가해지면(404) 공통 화면으로 바꾸고 grant를 남기지 않는다", async () => {
  const { queue, grants, publicationStore } = setup();
  queue.push(passwordRequired, unavailable);
  const store = publicationStore();
  await store.load();
  assert.equal(await store.unlock(PASSWORD), "unavailable");
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" });
  assert.equal(grants.get(TOKEN), null);
});

// ── 다시 조회·늦은 응답·붙는 컴포넌트의 접근 상실 ─────────────────

test("다시 조회: 실패는 같은 링크의 이전 화면을 유지하고 알린다. 확정 거부(404·401)는 이전 사본을 지운다", async () => {
  const { queue, grants, publicationStore } = setup();
  queue.push(ok(publication([catchItem("c1", 1), catchItem("c2", 2)])));
  const store = publicationStore();
  await store.load();
  const pending = deferred();
  queue.push(() => pending.promise);
  const refreshing = store.load();
  assert.equal(store.getSnapshot().refreshing, true);
  assert.equal(store.getSnapshot().snapshot.items.length, 2, "다시 조회 중에도 이전 화면 유지");
  pending.resolve(lookupFailed);
  await refreshing;
  assert.equal(store.getSnapshot().refreshFailed, true);
  assert.equal(store.getSnapshot().snapshot.items.length, 2);

  queue.push(ok(publication([catchItem("c1", 1)])));
  await store.load();
  assert.equal(store.getSnapshot().snapshot.items.length, 1, "성공하면 새 사본으로 바꾼다");
  assert.equal(store.getSnapshot().refreshFailed, false);

  grants.set(TOKEN, "g-A");
  queue.push(passwordRequired);
  await store.load();
  assert.equal(store.getSnapshot().view, "password");
  assert.equal("snapshot" in store.getSnapshot(), false, "비밀번호 필요가 확정되면 이전 사본을 지운다");
  assert.equal(grants.get(TOKEN), null);

  queue.push(ok({ grant: "g-B" }), ok(publication()), unavailable);
  await store.unlock(PASSWORD);
  await store.load();
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" });
});

test("늦게 도착한 응답: 다시 조회한 뒤의 이전 응답과 화면 해제 뒤의 응답은 버린다", async () => {
  const { queue, publicationStore } = setup();
  const old = deferred();
  queue.push(() => old.promise, ok(publication([catchItem("new", 1)])));
  const store = publicationStore();
  const first = store.load();
  await store.load();
  old.resolve(ok(publication([catchItem("old", 1)])));
  await first;
  assert.equal(store.getSnapshot().snapshot.items[0].publishedItemId, "new");

  const late = deferred();
  queue.push(() => late.promise);
  const disposed = publicationStore();
  const pending = disposed.load();
  disposed.dispose();
  late.resolve(ok(publication()));
  await pending;
  assert.equal(disposed.getSnapshot().view, "loading");
});

test("화면 해제 뒤 도착한 비밀번호 확인 응답은 grant를 남기지 않는다", async () => {
  const { queue, grants, publicationStore } = setup();
  queue.push(passwordRequired);
  const store = publicationStore();
  await store.load();
  const pending = deferred();
  queue.push(() => pending.promise);
  const unlocking = store.unlock(PASSWORD);
  store.dispose();
  pending.resolve(ok({ grant: "g-late" }));
  assert.equal(await unlocking, "ignored");
  assert.equal(grants.get(TOKEN), null);
});

test("붙는 컴포넌트의 onAccessLost(C-11 rule): 401이면 비밀번호 입력(다시 입력 안내), 404면 공통 화면. 그 링크 grant만 지우고 진행 중 조회의 늦은 응답은 버린다", async () => {
  const { queue, grants, publicationStore } = setup();
  grants.set(TOKEN, "g-A");
  grants.set(OTHER, "g-B");
  queue.push(ok(publication()));
  const store = publicationStore();
  await store.load();
  store.accessLost("LINK_PASSWORD_REQUIRED");
  assert.equal(store.getSnapshot().view, "password");
  assert.equal(store.getSnapshot().unlock.reentry, true, "쓰던 grant가 거부된 것이므로 다시 입력 안내");
  assert.equal(grants.get(TOKEN), null);
  assert.equal(grants.get(OTHER), "g-B");

  queue.push(ok({ grant: "g-C" }), ok(publication()));
  await store.unlock(PASSWORD);
  assert.equal(store.getSnapshot().view, "ready");
  const pending = deferred();
  queue.push(() => pending.promise);
  const refreshing = store.load();
  store.accessLost("LINK_UNAVAILABLE");
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" });
  pending.resolve(ok(publication()));
  await refreshing;
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" }, "늦은 성공 응답이 거부를 덮지 않는다");
  assert.equal(grants.get(TOKEN), null);
});

// ── 근거 위치(C-11 evidence-highlight) ───────────────────────────

test("showEvidence 위치 대조: 항목이 없으면 옮기지 않고, fieldPath 문자열 안의 범위만 강조하며, 사본에 없는 위치면 강조 없이 항목만 보인다", () => {
  const snapshot = readPublishedSnapshot(publication([catchItem("c1", 1), textItem("m1", 2, "텍스트 자료 본문입니다")]));
  const at = (publishedItemId, fieldPath, charStart, charEnd, pdfPage = null) => ({ publishedItemId, fieldPath, charStart, charEnd, pdfPage });
  assert.equal(resolveEvidenceTarget(snapshot, at("missing", "body", 0, 1)), null);
  assert.deepEqual(resolveEvidenceTarget(snapshot, at("m1", "body", 0, 6)), { publishedItemId: "m1", highlight: { publishedItemId: "m1", fieldPath: "body", charStart: 0, charEnd: 6 } });
  assert.deepEqual(resolveEvidenceTarget(snapshot, at("c1", "workFacts[1]", 0, 2)).highlight, { publishedItemId: "c1", fieldPath: "workFacts[1]", charStart: 0, charEnd: 2 });
  assert.ok(resolveEvidenceTarget(snapshot, at("c1", "evidence[0].representedFacts[0]", 0, 2)).highlight);
  assert.ok(resolveEvidenceTarget(snapshot, at("c1", "authorDescription", 0, 3)).highlight);
  assert.ok(resolveEvidenceTarget(snapshot, at("c1", "subjectContribution", 0, 2)).highlight);
  // 범위 밖·빈 범위·없는 경로(AI 초안은 조각 대상이 아님)·PDF 쪽: 항목만
  for (const location of [at("m1", "body", 0, 99), at("m1", "body", 3, 3), at("m1", "body", -1, 2), at("c1", "workFacts[7]", 0, 1), at("c1", "aiDraft", 0, 2), at("c1", "pages[1]", 0, 1, 1)]) {
    assert.deepEqual(resolveEvidenceTarget(snapshot, location), { publishedItemId: location.publishedItemId, highlight: null }, location.fieldPath);
  }
  assert.equal(fieldText(snapshot.items[1], "body"), "텍스트 자료 본문입니다");
  assert.equal(fieldText(snapshot.items[0], "body"), null);
});

// ── 표시 문구·링크(그대로 유지) ──────────────────────────────────

test("근거 원문은 GitHub https 주소만 링크로 연다", () => {
  assert.equal(isGithubSourceUrl("https://github.com/o/r/pull/1"), true);
  for (const value of ["http://github.com/o/r", "https://evil.example/o", "javascript:alert(1)", "https://user:pw@github.com/o", "https://github.com.evil.example/x", "not a url"]) {
    assert.equal(isGithubSourceUrl(value), false, value);
  }
});

test("비밀번호·grant 원문은 상태·로그에 남지 않는다", async () => {
  const { queue, publicationStore } = setup();
  const logged = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const name of Object.keys(original)) console[name] = (...args) => { logged.push(args.join(" ")); };
  try {
    queue.push(passwordRequired, passwordInvalid, ok({ grant: "grant-secret" }), ok(publication()));
    const store = publicationStore();
    await store.load();
    await store.unlock(PASSWORD);
    assert.ok(!JSON.stringify(store.getSnapshot()).includes(PASSWORD));
    await store.unlock(PASSWORD);
    assert.ok(!JSON.stringify(store.getSnapshot()).includes("grant-secret"));
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

// ── 화면 자리 G1~G4(구조)·사본 표지(NFR7.1)·고정 안내(G5·G6) ──────

const slotProps = (patch = {}) => ({ token: TOKEN, getGrant: () => null, onAccessLost() {}, isLoggedIn: false, showEvidence() {}, ...patch });
const idle = { phase: "idle", retryAt: null, reentry: false };
function render(snapshot, extra = {}) {
  return renderToStaticMarkup(createElement(RecipientPublicationView, {
    snapshot, headingRef: { current: null }, onRetry() {}, onUnlock: async () => "ignored", waitSeconds: () => 0, highlight: null, slotProps: slotProps(), ...extra,
  }));
}
const count = (html, needle) => html.split(needle).length - 1;
const ready = (items = [catchItem("c1", 2), textItem("m1", 1)], extra = {}) => ({ view: "ready", snapshot: readPublishedSnapshot(publication(items)), refreshing: false, refreshFailed: false, ...extra });

test("G1·G2·G3: 판정 통과 화면에만 RecipientGuide가 정확히 1개(showClaudeConnect=false), 비밀번호·불가·실패 화면에는 0개. 모든 상태의 h1은 U4 것 하나이고 tabIndex=-1", () => {
  const passed = render(ready());
  assert.equal(count(passed, 'data-testid="recipient-guide"'), 1);
  assert.equal(count(passed, "recipient-guide-claude-connect"), 0, "showClaudeConnect는 false");
  assert.equal(count(passed, "<h1"), 1);
  assert.ok(passed.includes('<h1 id="recipient-title" tabindex="-1"'));
  assert.ok(passed.includes("발행본 제목"));

  const password = render({ view: "password", unlock: idle });
  const blocked = render({ view: "unavailable" });
  const failed = render({ view: "failed" });
  for (const [name, html] of [["password", password], ["unavailable", blocked], ["failed", failed]]) {
    assert.equal(count(html, 'data-testid="recipient-guide"'), 0, `${name}: 안내 없음(G1)`);
    assert.equal(count(html, "<h1"), 1, `${name}: h1 하나(G3)`);
    assert.ok(html.includes('tabindex="-1"'), `${name}: 초점 대상 h1(G4)`);
    assert.equal(count(html, 'data-testid="publication-snapshot"'), 0, `${name}: 사본 없음`);
  }
  assert.ok(password.includes(PASSWORD_REQUIRED_TITLE) && password.includes('type="password"'));
  assert.ok(!password.includes("autofocus"), "첫 초점은 h1이므로 입력칸에 autoFocus를 두지 않는다(G4)");
  assert.ok(blocked.includes(LINK_UNAVAILABLE_TEXT));
  assert.ok(!blocked.includes("중지") && !blocked.includes("만료") && !blocked.includes("비활성"), "404 사유를 드러내지 않는다");
  assert.ok(failed.includes("다시 불러오기"));
});

test("판정 통과 화면 순서: h1 → 0 RecipientGuide → U4 고정 안내(발행 시각) → 1 발행본 자료 → 2 BaseSummaryPanel → 3 QnaPanel → 4 자리. 4번 자리는 isLoggedIn을 받는다", () => {
  const html = render(ready(), { slotProps: slotProps({ isLoggedIn: true }) });
  const order = ["<h1", 'data-testid="recipient-guide"', 'data-testid="recipient-published-at"', 'data-testid="publication-snapshot"',
    'data-testid="recipient-slot-2"', 'data-testid="recipient-slot-3"', 'data-testid="recipient-slot-4"'];
  const positions = order.map((needle) => html.indexOf(needle));
  assert.ok(positions.every((position) => position >= 0), String(positions));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "위에서부터 정한 순서");
  assert.ok(html.includes('data-testid="recipient-slot-4" data-slot="jd-summary" data-logged-in="true"'));
  assert.ok(render(ready()).includes('data-logged-in="false"'));
  // 2·3번 자리에 U5 패널이 하나씩 있다(U5 README 「붙이는 방법」). 4번은 U10 제공 전 빈 자리다
  const slot2 = html.slice(html.indexOf('data-testid="recipient-slot-2"'), html.indexOf('data-testid="recipient-slot-3"'));
  const slot3 = html.slice(html.indexOf('data-testid="recipient-slot-3"'), html.indexOf('data-testid="recipient-slot-4"'));
  assert.equal(count(slot2, 'data-testid="base-summary-panel"'), 1);
  assert.equal(count(slot3, 'data-testid="qna-panel"'), 1);
  assert.equal(count(slot3, 'data-testid="ai-notice-line"'), 1, "외부 AI 고지는 U5 질의응답 패널 안의 U2 한 줄뿐");
  assert.equal(count(html, 'data-testid="base-summary-panel"') + count(html, 'data-testid="qna-panel"'), 2);
  assert.match(html, /data-testid="recipient-slot-4" data-slot="jd-summary" data-logged-in="true"><\/div>/);
});

test("G5·G6: U4 고정 안내는 발행 시각(KST)뿐이고, U4 영역에 U2 안내 문장(고정 사본 설명·링크 조건 등)을 되풀이하지 않으며 만료 시각 원문도 보이지 않는다", () => {
  const html = render(ready());
  // U4 영역 = 전체에서 0번 안내(U2)와 2·3번 자리(U5)를 뺀 것
  const guideStart = html.indexOf('<section class="guide"');
  const guideEnd = html.indexOf("</section>", guideStart) + "</section>".length;
  const slotsStart = html.indexOf('data-testid="recipient-slot-2"');
  const u4Area = html.slice(0, guideStart) + html.slice(guideEnd, slotsStart);
  assert.ok(html.includes(`data-testid="recipient-published-at">${publishedAtText(PUBLISHED_AT)}</p>`));
  assert.equal(publishedAtText(PUBLISHED_AT), `${PUBLISHED_AT_LABEL} ${formatKst(PUBLISHED_AT)}`);
  assert.ok(!u4Area.includes(PUBLISHED_AT) && !u4Area.includes(EXPIRES_AT) && !u4Area.includes("2027-02-03"), "ISO 원문·만료 시각 없음");
  for (const item of RECIPIENT_GUIDE_ITEMS) assert.ok(!u4Area.includes(item.text), `U4 영역에 U2 ${item.id} 문장 없음`);
  for (const phrase of ["고정한", "반영되지 않", "중지하면", "로그인", "외부 AI", "전송"]) assert.ok(!u4Area.includes(phrase), `U4 영역에 "${phrase}" 없음(G5·G6)`);
});

test("1번 자리 사본: position 순서로 그리고, Catch는 기록·작성자 설명·AI 초안·불일치 표지를 나눈다. 본문·설명은 텍스트이고 GitHub 주소만 링크, AI 초안에는 링크가 없다", () => {
  const items = [
    catchItem("c1", 2, { mismatch: true, evidence: [
      { sourceUrl: "https://github.com/o/r/commit/1", sourceRevision: "abc", representedFacts: ["파일 1개"] },
      { sourceUrl: "https://evil.example/o/r", sourceRevision: "def", representedFacts: [] },
    ] }),
    textItem("m1", 1, "<b>본문</b> https://github.com/o/r/blob/main/a.md 와 https://evil.example/x"),
    catchItem("c2", 3, { authorDescription: null, aiDraft: null, mismatch: false }),
  ];
  const html = render(ready(items));
  const ids = [...html.matchAll(/id="published-item-([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["m1", "c1", "c2"], "position 순서");
  assert.deepEqual([...html.matchAll(/data-kind="([A-Z_]+)"/g)].map((match) => match[1]), ["TEXT_MATERIAL", "CATCH", "CATCH"]);
  assert.equal(count(html, 'data-testid="snapshot-catch-mismatch"'), 1, "불일치 표지는 c1에만");
  assert.equal(count(html, 'data-testid="snapshot-catch-facts"'), 2);
  assert.equal(count(html, 'data-testid="snapshot-catch-description"'), 2);
  // c2는 AI 초안이 없어 칸을 그리지 않는다(Catch 개편 CR3 BR7.1, 2026-11-08 팀장 결정).
  assert.equal(count(html, 'data-testid="snapshot-catch-ai-draft"'), 1);
  // AI 초안은 자기 표지 안에만 있고 작성자 설명 표지 안에는 없다
  const c1 = html.slice(html.indexOf('id="published-item-c1"'), html.indexOf('id="published-item-c2"'));
  const aiDraft = c1.slice(c1.indexOf('data-testid="snapshot-catch-ai-draft"'), c1.indexOf('data-testid="snapshot-catch-description"'));
  const description = c1.slice(c1.indexOf('data-testid="snapshot-catch-description"'), c1.indexOf('data-testid="snapshot-catch-facts"'));
  assert.ok(description.includes("작성자 설명") && !description.includes("AI 초안 글"));
  assert.ok(aiDraft.includes("AI 초안 글") && !aiDraft.includes("<a "), "AI 초안에는 링크를 만들지 않는다(OQ-U4-NFR-3)");
  assert.ok(description.includes('href="https://github.com/o/r/pull/1" target="_blank" rel="noopener noreferrer"'), "작성자 설명 안 GitHub 주소만 링크");
  // 근거 원문: GitHub https만 링크, 그 밖은 글자
  assert.equal(count(c1, 'data-testid="snapshot-evidence-link"'), 1);
  assert.ok(c1.includes('href="https://github.com/o/r/commit/1" target="_blank" rel="noopener noreferrer"') && c1.includes("(새 탭)"));
  assert.ok(c1.includes("https://evil.example/o/r") && !c1.includes('href="https://evil.example'), "GitHub 외 주소는 글자");
  // 텍스트 자료 본문: HTML로 삽입하지 않고(이스케이프) GitHub 주소만 링크
  const m1 = html.slice(html.indexOf('id="published-item-m1"'), html.indexOf('id="published-item-c1"'));
  assert.ok(m1.includes("&lt;b&gt;본문&lt;/b&gt;") && !m1.includes("<b>본문</b>"), "본문은 텍스트로만(NFR1.10)");
  assert.ok(m1.includes('href="https://github.com/o/r/blob/main/a.md"') && !m1.includes('href="https://evil.example/x"'));
  assert.ok(!html.includes("설명 초안을 생성하지 못했습니다") && !html.includes("자동으로 만들었습니다"), "10월 Catch 문구 없음");
  // c2: 작성자 설명은 없음 표시, AI 초안은 칸을 그리지 않음(Catch 개편 CR3 BR7.1, 2026-11-08 팀장 결정)
  const c2 = html.slice(html.indexOf('id="published-item-c2"'));
  assert.ok(c2.includes("작성자 설명이 없습니다.") && !c2.includes("AI 설명 초안"));
});

test("근거 강조: highlight가 가리킨 항목만 data-highlighted이고 그 fieldPath의 [charStart, charEnd)만 <mark>다. 범위가 없으면 항목만 표시한다", () => {
  const items = [textItem("m1", 1, "앞부분 강조할 글 뒷부분"), catchItem("c1", 2)];
  const marked = render(ready(items), { highlight: { publishedItemId: "m1", fieldPath: "body", charStart: 4, charEnd: 9 } });
  assert.equal(count(marked, 'data-highlighted="true"'), 1);
  assert.ok(marked.includes('id="published-item-m1" tabindex="-1"') && marked.indexOf('data-highlighted="true"') < marked.indexOf('id="published-item-c1"'));
  assert.equal(count(marked, 'data-testid="snapshot-highlight"'), 1);
  assert.match(marked, /<mark[^>]*>강조할 글<\/mark>/);
  assert.ok(marked.includes("앞부분 ") && marked.includes(" 뒷부분"));

  const factMarked = render(ready(items), { highlight: { publishedItemId: "c1", fieldPath: "workFacts[0]", charStart: 0, charEnd: 2 } });
  assert.match(factMarked, /<li><mark[^>]*>사실<\/mark> c1<\/li>/);

  const itemOnly = render(ready(items), { highlight: null });
  assert.equal(count(itemOnly, "<mark"), 0);
  assert.equal(count(itemOnly, 'data-highlighted="true"'), 0);
});

// #488: 면접관이 한 일(AI 설명 초안)과 이유(작성자 설명)를 먼저 보고, 근거 세부(본인 기여·근거 목록)는 필요할 때 펼친다.
//   - 기대: Catch 항목 안은 불일치 표지 → AI 설명 초안 → 작성자 설명 → 기록에서 확인한 내용 순서. 작업 사실은 펼친 채로, 본인 기여·근거 목록은
//           「근거 자세히 보기」(<details>) 안에 처음엔 접혀 있다. 강조가 그 안(subjectContribution·evidence[i]…)을 가리키면 펼친 채로 그려 <mark>가 보인다.
//           작업 사실·작성자 설명을 가리키면 펼치지 않는다. 근거 목록 안 순서는 사본 그대로다.
//   - 실패 조건: 기록이 AI 초안·작성자 설명보다 위, 작업 사실이 접힘, 처음부터 근거 목록이 펼쳐짐, 강조가 접힌 칸 안에 숨음.
test("#488 Catch 칸 순서와 근거 접기: 불일치 → AI 초안 → 작성자 설명 → 기록. 작업 사실은 펼치고 본인 기여·근거 목록은 「근거 자세히 보기」에 접는다", () => {
  const evidence = [
    { sourceUrl: "https://github.com/o/r/pull/7", sourceRevision: "rev-pr", representedFacts: ["PR 사실"] },
    { sourceUrl: "https://github.com/o/r/commit/2", sourceRevision: "rev-2", representedFacts: ["커밋 사실"] },
  ];
  const items = [catchItem("c1", 1, { mismatch: true, evidence })];
  const html = render(ready(items));
  const order = ['data-testid="snapshot-catch-mismatch"', 'data-testid="snapshot-catch-ai-draft"', 'data-testid="snapshot-catch-description"',
    'data-testid="snapshot-catch-facts"', "사실 c1", 'data-testid="snapshot-catch-evidence-details"', "<summary>근거 자세히 보기</summary>", "본인 커밋",
    'data-testid="snapshot-catch-evidence"'];
  const positions = order.map((needle) => html.indexOf(needle));
  assert.ok(positions.every((position) => position >= 0), String(positions));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "위에서부터 정한 순서");
  // 작업 사실은 <details> 밖(펼침), 본인 기여·근거 목록은 <details> 안이고 처음엔 접혀 있다(open 속성 없음).
  const details = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
  assert.match(details, /^<details[^>]*>/);
  assert.doesNotMatch(details.match(/^<details[^>]*>/)[0], /\sopen/);
  assert.ok(!details.includes("사실 c1") && details.includes("본인 커밋") && details.includes("rev-pr"));
  // 근거 목록 안 순서는 사본 그대로(2026-10-08 팀장 결정)
  assert.ok(details.indexOf("rev-pr") < details.indexOf("rev-2"));

  // 강조가 접힌 칸 안을 가리키면 펼친 채로 그리고 <mark>가 그 안에 있다.
  for (const fieldPath of ["subjectContribution", "evidence[1].representedFacts[0]"]) {
    const marked = render(ready(items), { highlight: { publishedItemId: "c1", fieldPath, charStart: 0, charEnd: 2 } });
    const openDetails = marked.slice(marked.indexOf("<details"), marked.indexOf("</details>"));
    assert.match(openDetails.match(/^<details[^>]*>/)[0], /\sopen=""/, fieldPath);
    assert.equal(count(openDetails, 'data-testid="snapshot-highlight"'), 1, fieldPath);
  }
  // 작업 사실·작성자 설명을 가리키면 펼치지 않는다.
  for (const fieldPath of ["workFacts[0]", "authorDescription"]) {
    const marked = render(ready(items), { highlight: { publishedItemId: "c1", fieldPath, charStart: 0, charEnd: 2 } });
    assert.doesNotMatch(marked.match(/<details[^>]*>/)[0], /\sopen/, fieldPath);
  }
});

test("#488 근거 접기 상태: 처음엔 접힘, 사람이 접고 편 상태를 따르되 그 뒤 새 강조가 안을 가리키면 펼친다(같은 근거를 다시 눌러도)", () => {
  const at = (fieldPath) => ({ publishedItemId: "c1", fieldPath, charStart: 0, charEnd: 1 });
  assert.equal(evidenceDetailsOpen(INITIAL_EVIDENCE_TOGGLE, null), false);
  assert.equal(evidenceDetailsOpen({ open: true, at: null }, null), true, "사람이 펼침");
  assert.equal(evidenceDetailsOpen(INITIAL_EVIDENCE_TOGGLE, at("workFacts[0]")), false, "작업 사실은 펼친 칸이라 열 필요 없음");
  const first = at("subjectContribution");
  assert.equal(evidenceDetailsOpen(INITIAL_EVIDENCE_TOGGLE, first), true, "안을 가리키면 펼침");
  assert.equal(evidenceDetailsOpen({ open: false, at: first }, first), false, "그 강조 뒤에 사람이 접으면 접힌 채");
  const again = at("subjectContribution");
  assert.equal(evidenceDetailsOpen({ open: false, at: first }, again), true, "같은 근거를 다시 누르면(새 강조) 다시 펼침");
  assert.equal(evidenceDetailsOpen({ open: false, at: first }, at("evidence[0].representedFacts[0]")), true);
  for (const fieldPath of ["subjectContribution", "evidence[0].representedFacts[0]"]) assert.equal(isInEvidenceDetails(at(fieldPath)), true, fieldPath);
  for (const fieldPath of ["workFacts[0]", "authorDescription", "aiDraft", "body"]) assert.equal(isInEvidenceDetails(at(fieldPath)), false, fieldPath);
});

// 새 Catch NC1 — 면접관 발행본의 작성자 설명 칸별 보기와 링크 이름(US1.4·US1.5·US2.2, BR7.1~BR7.3, BR2, NFR6.3).
//   - 기대: 글이 있는 칸만 h5 칸 제목과 보이고, 「더 쓰기」는 다른 칸과 함께일 때 h5 「덧붙인 말」, 하나뿐이면(옛 글 포함) h5 없이 글만이다.
//           작성자 설명 속 GitHub 링크는 이름으로 보이고 href·title은 원래 주소, 숨은 「(새 탭)」과 새 탭 속성이 있다. 칸 순서는 #488 그대로다.
//   - 실패 조건: 빈 칸의 h5가 DOM에 있음(숨긴 요소 포함), 「더 쓰기」 h5가 보임, 옛 글에 h5가 생김, 이름이 원래 주소와 다른 곳을 가리킴.
const sectionedDescription = "【맡은 부분】\n게시글 작성 화면 두 곳\n\n【더 쓰기】\n덧붙이는 말";
const descriptionOf = (html, id = "c1") => {
  const item = html.slice(html.indexOf(`id="published-item-${id}"`));
  return item.slice(item.indexOf('data-testid="snapshot-catch-description"'), item.indexOf('data-testid="snapshot-catch-facts"'));
};
const h5s = (html) => [...html.matchAll(/<h5[^>]*>([^<]*)<\/h5>/g)].map((match) => match[1]);

test("AC1.4.1 「맡은 부분」과 「더 쓰기」 두 칸이 저장된 발행본은 「맡은 부분」·「덧붙인 말」 두 칸만 보이고 다른 칸 제목은 없다", () => {
  const description = descriptionOf(render(ready([catchItem("c1", 1, { authorDescription: sectionedDescription })])));
  assert.deepEqual(h5s(description), ["맡은 부분", "덧붙인 말"]);
  assert.ok(description.includes("게시글 작성 화면 두 곳") && description.includes("덧붙이는 말"));
  for (const title of ["이 작업에서 정한 것", "무엇이 문제였나", "고른 것과 버린 것", "어떻게 확인했나·결과", "짚어 볼 곳", "더 쓰기", "【"]) {
    assert.ok(!description.includes(title), title);
  }
});

test("AC1.4.2 작성자 설명이 통째로 없거나 빈 글인 발행본은 「작성자 설명이 없습니다.」다", () => {
  for (const authorDescription of [null, ""]) {
    const description = descriptionOf(render(ready([catchItem("c1", 1, { authorDescription })])));
    assert.ok(description.includes("작성자 설명이 없습니다."), String(authorDescription));
    assert.equal(h5s(description).length, 0);
  }
});

test("AC1.4.3 칸 제목별로 나뉜 발행본도 불일치 → AI 설명 초안 → 작성자 설명 → 기록 순서이고 「이 작업에서 정한 것」이 제목 바로 아래로 오지 않는다", () => {
  const authorDescription = "【이 작업에서 정한 것】\n줄여 올리기로 했다.\n\n【짚어 볼 곳】\nhttps://github.com/o/r/pull/1";
  const html = render(ready([catchItem("c1", 1, { mismatch: true, authorDescription })]));
  const order = ["<h3", 'data-testid="snapshot-catch-mismatch"', 'data-testid="snapshot-catch-ai-draft"', 'data-testid="snapshot-catch-description"',
    ">이 작업에서 정한 것</h5>", 'data-testid="snapshot-catch-facts"'].map((needle) => html.indexOf(needle, html.indexOf('id="published-item-c1"')));
  assert.ok(order.every((position) => position >= 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("AC1.4.4 빈 칸의 칸 제목은 h5째 그리지 않고 숨긴 요소로도 남기지 않는다", () => {
  const authorDescription = "【맡은 부분】\n맡음\n\n【무엇이 문제였나】\n   \n\n【짚어 볼 곳】\n링크";
  const description = descriptionOf(render(ready([catchItem("c1", 1, { authorDescription })])));
  assert.deepEqual(h5s(description), ["맡은 부분", "짚어 볼 곳"]);
  assert.equal(count(description, 'data-testid="snapshot-description-section"'), 2);
  assert.doesNotMatch(description, /무엇이 문제였나|hidden|aria-hidden/);
});

test("AC1.5.1·AC1.5.2 칸 제목 줄이 없는 옛 글과 「더 쓰기」만 저장된 글은 h5 없이 글만 지금처럼 보인다", () => {
  const old = "칸 제목 없이 쓴 옛 설명입니다.\n둘째 줄 https://github.com/o/r/pull/3";
  for (const authorDescription of [old, "덧붙인 말만", "【더 쓰기】\n칸 제목 줄과 함께 저장된 더 쓰기"]) {
    const description = descriptionOf(render(ready([catchItem("c1", 1, { authorDescription })])));
    assert.equal(h5s(description).length, 0, authorDescription);
    assert.equal(count(description, "<p"), 1, authorDescription);
    assert.doesNotMatch(description, /snapshot-description-section|덧붙인 말<\/h5>|【/);
  }
  const plain = descriptionOf(render(ready([catchItem("c1", 1, { authorDescription: old })])));
  assert.ok(plain.includes("칸 제목 없이 쓴 옛 설명입니다.\n둘째 줄 "));
});

test("AC2.2.1·AC2.2.7 작성자 설명 속 파일 줄 링크는 「파일 · L범위 · 판본」 이름이고 href·title은 원래 주소, 새 탭 속성과 숨은 「(새 탭)」이 있다", () => {
  const url = "https://github.com/o/r/blob/ba6bba8c0123456789abcdef0123456789abcdef/src/CreateArticlePage.vue#L40-L58";
  const html = render(ready([catchItem("c1", 1, { authorDescription: `【짚어 볼 곳】\n${url} 줄이는 부분` })]));
  const description = descriptionOf(html);
  const anchor = description.match(/<a [^>]*data-testid="github-link"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? assert.fail("링크 이름 요소가 있어야 한다");
  assert.equal(anchor.replace(/ class="githubLink"/, ""),
    `<a href="${url}" target="_blank" rel="noopener noreferrer" title="${url}" data-testid="github-link">CreateArticlePage.vue · L40–58 · 판본 ba6bba8<span class="visually-hidden"> (새 탭)</span></a>`);
  assert.ok(description.includes(" 줄이는 부분"));
  // 근거 저장소(o/r)와 같아 앞붙임이 없고, 다른 저장소면 붙는다.
  const other = descriptionOf(render(ready([catchItem("c1", 1, { authorDescription: "관련 https://github.com/other/lib/commit/1a2b3c4d" })])));
  assert.ok(other.includes(">other/lib · 커밋 1a2b3c4<span"));
});
