// U8 Step 10.3 — 발행본의 PDF 항목 표시(받은 사람·작성자 화면) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U8 시나리오 표 F-9, 기능 명세 W4, 규칙 BR6.4, 계약 C-11 evidence-highlight, NFR1.8·NFR7.2). 세부 시험 코드는 구현 뒤 썼다.
// F-9 `fieldText(pages[n])` → n쪽의 글(`pdfPages`에서 쪽 번호로 찾음), readable=false 쪽은 "읽을 수 없음" 표지, `pickItem`은 `pdfPages`의 계약 칸만 통과.
//     쪽 글은 텍스트 노드로만 그리고(마크업 해석 없음), 근거 범위는 그 쪽 글에서만 `<mark>`로 감싼다.
//     실패 조건: 쪽 글이 마크업으로 해석됨, 다른 쪽·다른 항목에 강조, 계약 밖 칸이 화면으로 넘어감, 읽을 수 없는 쪽에 글이 보임.
// 화면 연결 — 기대: 받은 사람 화면과 작성자 발행본 화면의 PDF 항목에 제목·쪽 수·쪽 목록·[PDF 보기]·[새 탭에서 열기]·[원본 n쪽 열기]가 있고,
//     각 화면이 넘긴 요청(받은 사람: 사본 경로 + grant, 작성자: 작성자 사본 경로)을 쓴다. 실패 조건: "준비 중" 자리가 남음, 단추에 data-testid 없음.
//
// 합성 응답과 서버 렌더링만 쓴다(단추를 실제로 누르는 흐름은 pdf-viewer.test.mjs의 모델 시험과 브라우저 확인이 본다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readPublishedSnapshot } from "../src/features/recipient/recipient-api.ts";
import { fieldText, resolveEvidenceTarget } from "../src/features/recipient/recipient-slots.ts";
import { createPublicationsApi, isPublishedSnapshot, pdfPageCount } from "../src/features/publications/publications-api.ts";
import { load } from "./u2-render.mjs";

// 받은 사람 화면의 U5 패널이 불러오는 lib/api.ts가 읽는 값이다. 이 주소로 나가는 요청은 없다(서버 렌더링에서는 효과가 돌지 않는다).
process.env.NEXT_PUBLIC_API_BASE_URL ??= "http://127.0.0.1:3001";

const { PublishedSnapshotView } = await load("features/publications/snapshot-view.tsx");
const { PublishedPdfItem, UNREADABLE_PAGE_TEXT, pdfPagePath } = await load("features/publications/published-pdf-item.tsx");
const { RecipientPublicationView } = await load("features/recipient/recipient-view.tsx");
const { PublicationDetailView } = await load("features/publications/publication-detail-view.tsx");

const PUBLISHED_AT = "2026-11-10T03:04:05.000Z";
const EXPIRES_AT = "2027-02-08T03:04:05.000Z";
const PDF_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pages = () => [
  { pageNumber: 1, text: "첫 쪽 글이다. <script>alert(1)</script>", readable: true },
  { pageNumber: 2, text: "", readable: false },
  { pageNumber: 3, text: "셋째 쪽의 근거 문장이 여기 있다.", readable: true },
];
const pdfItem = (patch = {}) => ({ publishedItemId: PDF_ID, position: 2, itemKind: "PDF_MATERIAL", title: "합성 PDF 제목",
  snapshot: { pageCount: 3 }, pdfPages: pages(), ...patch });
const textItem = () => ({ publishedItemId: "t1", position: 1, itemKind: "TEXT_MATERIAL", title: "자료", snapshot: { body: "본문 글" } });
const snapshot = (items = [textItem(), pdfItem()]) => ({ title: "발행본 제목", publishedAt: PUBLISHED_AT, expiresAt: EXPIRES_AT, items });
const source = () => ({ fetchPdf: async () => new Response(null, { status: 500 }) });

test("F-9: fieldText(pages[n])은 n쪽의 글이고, 근거 범위가 그 글 안에 있을 때만 강조 대상이 된다", () => {
  const item = pdfItem();
  assert.equal(fieldText(item, "pages[1]"), pages()[0].text);
  assert.equal(fieldText(item, "pages[3]"), "셋째 쪽의 근거 문장이 여기 있다.");
  assert.equal(fieldText(item, "pages[2]"), "", "읽을 수 없는 쪽은 빈 글이다");
  assert.equal(fieldText(item, pdfPagePath(3)), fieldText(item, "pages[3]"));
  // 쪽 번호로 찾는다(배열 자리가 아니다). 순서가 섞여 와도 같은 쪽을 가리킨다.
  assert.equal(fieldText(pdfItem({ pdfPages: pages().reverse() }), "pages[1]"), pages()[0].text);
  for (const path of ["pages[0]", "pages[4]", "pages[-1]", "pages[1.5]", "pages", "body", "pages[1].text", "workFacts[0]"]) {
    assert.equal(fieldText(item, path), null, path);
  }
  assert.equal(fieldText(pdfItem({ pdfPages: undefined }), "pages[1]"), null, "쪽 사본이 없으면 가리킬 글이 없다");
  assert.equal(fieldText(textItem(), "pages[1]"), null, "PDF가 아닌 항목에는 쪽이 없다");

  // showEvidence 대조(C-11): 범위가 쪽 글 안이면 강조, 밖이거나 읽을 수 없는 쪽이면 항목만 가리킨다. 사본에 없는 항목은 null.
  const location = (patch) => ({ publishedItemId: PDF_ID, fieldPath: "pages[3]", charStart: 5, charEnd: 10, pdfPage: 3, ...patch });
  assert.deepEqual(resolveEvidenceTarget(snapshot(), location({})),
    { publishedItemId: PDF_ID, highlight: { publishedItemId: PDF_ID, fieldPath: "pages[3]", charStart: 5, charEnd: 10 } });
  assert.deepEqual(resolveEvidenceTarget(snapshot(), location({ charEnd: 999 })), { publishedItemId: PDF_ID, highlight: null });
  assert.deepEqual(resolveEvidenceTarget(snapshot(), location({ fieldPath: "pages[2]", charStart: 0, charEnd: 1 })), { publishedItemId: PDF_ID, highlight: null });
  assert.deepEqual(resolveEvidenceTarget(snapshot(), location({ fieldPath: "pages[9]" })), { publishedItemId: PDF_ID, highlight: null });
  assert.equal(resolveEvidenceTarget(snapshot(), location({ publishedItemId: "none" })), null);
});

test("F-9: 사본 응답의 PDF 항목은 쪽 수와 쪽 사본의 계약 칸만 화면으로 넘기고, 쪽 사본 모양이 틀리면 사본 전체를 믿지 않는다", async () => {
  const raw = snapshot([textItem(), {
    ...pdfItem({ pdfPages: pages().map((page) => ({ ...page, publishedPdfPageId: "internal", extra: 1 })) }),
    snapshot: { pageCount: 3, storageKey: "members/secret" }, pdfCopyKey: "members/secret/copy.pdf",
  }]);
  const read = readPublishedSnapshot(raw);
  assert.deepEqual(read.items[1], { publishedItemId: PDF_ID, position: 2, title: "합성 PDF 제목", itemKind: "PDF_MATERIAL",
    snapshot: { pageCount: 3 }, pdfPages: pages() }, "계약 밖 칸(저장 키·내부 ID)은 넘기지 않는다");
  assert.ok(!JSON.stringify(read).includes("members/secret"));
  assert.equal(pdfPageCount(read.items[1]), 3);
  assert.equal(pdfPageCount({ ...read.items[1], snapshot: {} }), null);

  // 쪽 사본이 없거나 null인 응답(U8 전의 사본 모양)은 빈 목록으로 본다. 텍스트 항목의 pdfPages: null도 그대로 받는다.
  assert.deepEqual(readPublishedSnapshot(snapshot([pdfItem({ pdfPages: undefined })])).items[0].pdfPages, []);
  assert.deepEqual(readPublishedSnapshot(snapshot([pdfItem({ pdfPages: null })])).items[0].pdfPages, []);
  assert.equal(isPublishedSnapshot(snapshot([{ ...textItem(), pdfPages: null }, pdfItem()])), true);

  // 쪽 모양이 틀리면 성공이나 0쪽으로 바꾸지 않는다.
  for (const bad of [[{ pageNumber: 0, text: "x", readable: true }], [{ pageNumber: 1, text: 1, readable: true }],
    [{ pageNumber: 1, text: "x" }], [{ pageNumber: "1", text: "x", readable: true }], "pages", [null]]) {
    assert.equal(readPublishedSnapshot(snapshot([pdfItem({ pdfPages: bad })])), null, JSON.stringify(bad));
  }

  // 작성자 상세도 같은 사본 검사를 지난다(쪽 사본이 그대로 보인다).
  const detail = { publicationId: "p1", url: "https://catchu.example/s/x", state: "ACTIVE", passwordProtected: false, snapshot: snapshot() };
  const owner = createPublicationsApi(async () => ({ kind: "success", status: 200, data: detail }));
  const loaded = await owner.get("p1");
  assert.equal(loaded.kind, "ok");
  assert.deepEqual(loaded.value.snapshot.items[1].pdfPages, pages());
});

test("F-9: PDF 항목은 쪽 수와 쪽마다 n쪽을 보이고, 읽을 수 없는 쪽은 표지만, 읽을 수 있는 쪽은 글을 텍스트로만 그리며, 근거 범위는 그 쪽에서만 강조한다", () => {
  const render = (props) => renderToStaticMarkup(createElement(PublishedPdfItem, { title: "합성 PDF 제목", pageCount: 3, pages: pages(), ...props }));
  const html = render({ source: source() });

  assert.match(html, /data-testid="snapshot-pdf-page-count">3쪽</);
  assert.equal((html.match(/data-testid="snapshot-pdf-page"/g) ?? []).length, 3);
  for (const n of [1, 2, 3]) assert.match(html, new RegExp(`<h4[^>]*>${n}쪽</h4>`));

  // 쪽 글은 마크업으로 해석하지 않는다(추출한 글은 신뢰할 수 없는 자료).
  assert.ok(html.includes("첫 쪽 글이다. &lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));

  // 읽을 수 없는 쪽: 표지만 있고 글 자리가 없다.
  const second = /<li[^>]*data-page="2"[^>]*>.*?<\/li>/s.exec(html)[0];
  assert.match(second, /data-readable="false"/);
  assert.match(second, new RegExp(`data-testid="snapshot-pdf-page-unreadable"[^>]*>${UNREADABLE_PAGE_TEXT}<`));
  assert.doesNotMatch(second, /snapshot-pdf-page-text/);
  assert.equal(UNREADABLE_PAGE_TEXT, "읽을 수 없음");
  assert.equal((html.match(/snapshot-pdf-page-text/g) ?? []).length, 2);

  // 열기 단추: [PDF 보기]·[새 탭에서 열기]와 쪽마다 [원본 n쪽 열기](읽을 수 없는 쪽에도 있다).
  assert.match(html, /data-testid="snapshot-pdf-viewer-open"[^>]*>PDF 보기</);
  assert.match(html, /data-testid="snapshot-pdf-viewer-new-tab"/);
  assert.equal((html.match(/data-testid="snapshot-pdf-open-page"/g) ?? []).length, 3);
  assert.match(second, /data-testid="snapshot-pdf-open-page"[^>]*>원본 2쪽 열기</);
  assert.doesNotMatch(html, /<mark/, "근거 위치가 없으면 강조가 없다");

  // 요청 방법을 넘기지 않으면 쪽 글만 보이고 열기 단추는 없다.
  const plain = render({});
  assert.doesNotMatch(plain, /snapshot-pdf-viewer|snapshot-pdf-open-page/);
  assert.equal((plain.match(/data-testid="snapshot-pdf-page"/g) ?? []).length, 3);

  // 강조: 가리킨 쪽의 [charStart, charEnd)만 <mark>다. 받은 사람 화면이 그 표지로 스크롤한다(다른 사본 항목과 같은 data-testid).
  const marked = render({ source: source(), highlight: { fieldPath: "pages[3]", charStart: 6, charEnd: 11 } });
  assert.equal((marked.match(/<mark/g) ?? []).length, 1);
  const third = /<li[^>]*data-page="3"[^>]*>.*?<\/li>/s.exec(marked)[0];
  assert.match(third, /셋째 쪽의 <mark[^>]*data-testid="snapshot-highlight"[^>]*>근거 문장<\/mark>이 여기 있다\./);
  assert.doesNotMatch(/<li[^>]*data-page="1"[^>]*>.*?<\/li>/s.exec(marked)[0], /<mark/);
  // 범위가 글 밖이면 잘라 내거나 강조하지 않는다. 다른 경로(본문 등)를 가리키는 강조는 쪽에 그리지 않는다.
  assert.match(render({ highlight: { fieldPath: "pages[3]", charStart: 13, charEnd: 999 } }), /<mark[^>]*>여기 있다\.<\/mark>/);
  assert.doesNotMatch(render({ highlight: { fieldPath: "pages[3]", charStart: 500, charEnd: 600 } }), /<mark/);
  assert.doesNotMatch(render({ highlight: { fieldPath: "body", charStart: 0, charEnd: 3 } }), /<mark/);
  assert.doesNotMatch(render({ highlight: { fieldPath: "pages[2]", charStart: 0, charEnd: 3 } }), /<mark/, "읽을 수 없는 쪽에는 강조할 글이 없다");

  // 쪽 수 칸이 없으면 쪽 사본 수로 보이고, 쪽이 순서 없이 와도 쪽 번호 순으로 그린다.
  const shuffled = render({ pageCount: null, pages: [pages()[2], pages()[0]] });
  assert.match(shuffled, /data-testid="snapshot-pdf-page-count">2쪽</);
  assert.deepEqual([...shuffled.matchAll(/data-page="(\d+)"/g)].map((match) => match[1]), ["1", "3"]);
  assert.match(render({ pageCount: 0, pages: [] }), /쪽 글이 없습니다/);
});

test("화면 연결: 받은 사람 화면과 작성자 발행본 화면의 PDF 항목에 제목·쪽 수·쪽 목록·열기 단추가 있고 '준비 중' 자리가 없다. 강조는 가리킨 항목에만 간다", () => {
  const view = (props) => renderToStaticMarkup(createElement(PublishedSnapshotView, { snapshot: snapshot(), ...props }));
  const withSource = view({ pdfSource: () => source() });
  const item = /<li[^>]*data-kind="PDF_MATERIAL"[^>]*>.*<\/li>/s.exec(withSource)[0];
  assert.match(item, /PDF 자료<\/span> 합성 PDF 제목</, "종류 표지와 제목");
  assert.match(item, /data-testid="snapshot-pdf-page-count">3쪽</);
  assert.match(item, /data-testid="snapshot-pdf-viewer-open"/);
  assert.ok(!withSource.includes("준비 중"));
  assert.match(item, new RegExp(`id="published-item-${PDF_ID}"`), "근거 위치로 옮길 수 있는 항목 id");

  // 항목마다 그 항목의 ID로 요청 방법을 받는다(다른 항목의 사본을 열지 않는다).
  const asked = [];
  view({ pdfSource: (publishedItemId) => { asked.push(publishedItemId); return source(); } });
  assert.deepEqual(asked, [PDF_ID], "PDF 항목에만, 그 항목의 ID로 묻는다");

  // 강조는 가리킨 항목에만 간다: 텍스트 항목의 body 강조가 PDF 쪽에 새지 않고, PDF 쪽 강조가 본문에 새지 않는다.
  const bodyMarked = view({ highlight: { publishedItemId: "t1", fieldPath: "body", charStart: 0, charEnd: 2 } });
  assert.equal((bodyMarked.match(/<mark/g) ?? []).length, 1);
  assert.doesNotMatch(/<li[^>]*data-kind="PDF_MATERIAL"[^>]*>.*<\/li>/s.exec(bodyMarked)[0], /<mark/);
  const pageMarked = view({ pdfSource: () => source(), highlight: { publishedItemId: PDF_ID, fieldPath: "pages[1]", charStart: 0, charEnd: 3 } });
  assert.equal((pageMarked.match(/<mark/g) ?? []).length, 1);
  assert.match(pageMarked, /data-kind="PDF_MATERIAL"[^>]*data-highlighted="true"/);
  assert.match(pageMarked, /<mark[^>]*>첫 쪽<\/mark> 글이다/);

  // 받은 사람 화면(판정 통과): 1번 자리의 PDF 항목이 넘겨받은 요청 방법으로 그려진다.
  const slotProps = { token: "tok_A", getGrant: () => null, onAccessLost() {}, isLoggedIn: false, showEvidence() {} };
  const recipient = renderToStaticMarkup(createElement(RecipientPublicationView, {
    snapshot: { view: "ready", snapshot: readPublishedSnapshot(snapshot()), refreshing: false, refreshFailed: false },
    headingRef: { current: null }, onRetry() {}, onUnlock: async () => "ok", waitSeconds: () => 0, highlight: null, slotProps,
    pdfSource: () => ({ ...source(), onAccessLost() {} }),
  }));
  assert.match(recipient, /data-testid="recipient-ready"/);
  assert.match(recipient, /data-testid="snapshot-pdf-viewer-open"/);
  assert.equal((recipient.match(/data-testid="snapshot-pdf-open-page"/g) ?? []).length, 3);
  assert.ok(recipient.includes(UNREADABLE_PAGE_TEXT));

  // 작성자 발행본 화면: 중지된 발행본에서도 PDF 항목과 열기 단추가 보인다(BR6.6).
  const detail = { publicationId: "p1", url: "https://catchu.example/s/x", state: "STOPPED", passwordProtected: true, snapshot: snapshot() };
  const owner = renderToStaticMarkup(createElement(PublicationDetailView, {
    detail, stoppedAt: PUBLISHED_AT, stopState: "idle", deleteState: "idle", onStop() {}, onDelete() {}, pdfSource: () => source(),
  }));
  assert.match(owner, /data-testid="publication-detail"[^>]*data-state="STOPPED"/);
  assert.match(owner, /data-testid="snapshot-pdf-viewer-open"/);
  assert.match(owner, /data-testid="snapshot-pdf-page-count">3쪽</);
});
