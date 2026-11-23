// #607 발행본 자료의 긴 글 접기·펼치기와 출처 이동 때 자동 펼침(web/src/features/publications/fold-text.tsx) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(#607 완료 기준, 2026-11-19 팀장 댓글 두 건):
//   접는 기준
//   - 기대: AI 설명 초안·기록에서 확인한 내용·PDF 쪽 글은 12줄을 넘으면 6줄만, 작성자 설명·텍스트 자료 본문은 18줄을 넘으면 12줄만 보인다.
//           12줄·18줄은 접지 않고 13줄·19줄부터 접는다. 줄 수는 본문 글줄(문단·목록 항목)만 센다: 덩어리마다 그려진 높이를 줄 높이로 나눠 더하고
//           (브라우저가 높이를 정수로 줘도 같다), 작성자 설명의 칸 제목과 칸·항목 사이 여백은 넣지 않는다.
//           접힌 높이는 보일 마지막 글줄의 아래 끝까지다. 그 위의 칸 제목·여백은 높이에 들어가고 보이는 글줄은 6줄·12줄이다.
//   - 실패 조건: 기준과 같은 줄 수를 접음, 기준을 넘는데 접지 않음, 줄 높이를 모를 때 접음, 칸 제목·여백 때문에 18줄 글이 접힘,
//           접힌 높이가 칸 제목만큼 모자라 글줄이 덜 보임.
//   펼침 규칙
//   - 기대: 처음에는 접혀 있고 사람이 누르면 펼친다. 강조가 그 글을 가리키면 펼치고, 사람이 다시 접은 뒤 같은 출처를 다시 누르면(새 강조) 다시 펼친다.
//           사람이 펼쳐 둔 글은 강조가 다른 곳으로 가도 펼친 채다. 강조가 떠나면 자동으로 펼쳤던 글은 사람이 고른 상태(접힘)로 돌아간다.
//   - 실패 조건: 같은 출처를 다시 눌러도 접힌 채, 사람이 펼친 글이 접힘.
//   그려진 모양
//   - 기대: 접을 만큼 길 때만 단추가 있고 글자는 「전체 보기」/「접기」, aria-expanded와 aria-controls로 상태와 대상을 알린다. 접힌 동안에도 원문 전체가
//           그대로 들어 있고 높이만 max-height로 줄인다. 「N줄」「미리보기」「전체 표시」 같은 검토용 글은 없다.
//           사본에서는 Catch의 세 칸·텍스트 본문·읽을 수 있는 PDF 쪽마다 접는 틀이 하나씩 있고, 「이 기록으로 알 수 없는 것」과 「근거 자세히 보기」는 틀 밖이다.
//           강조 `<mark>`는 접는 틀 안에 그대로 그려진다.
//   - 실패 조건: 원문이 잘림, 기준 이하인데 단추가 있음, 근거 자세히 보기가 틀 안에 들어감.
//
// 원본 tsx는 u2-render.mjs로 변환해 불러온다. 실제 줄 수 재기·폭 변경·초점·화면 낭독은 DOM이 필요해 여기서 보지 않고 브라우저에서 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

const { FOLD_AUTHORED, FOLD_GENERATED, FOLD_TEXT_SELECTOR, FoldFrame, INITIAL_FOLD_TOGGLE, countLines, foldNeeded, foldOpen, measureFold } = await load("features/publications/fold-text.tsx");
const { PublishedSnapshotView } = await load("features/publications/snapshot-view.tsx");

// 본문 글자 16px × 줄 높이 1.6 = 25.6px. 브라우저의 scrollHeight는 정수라 반올림한 높이를 넣는다.
const LINE = 25.6;
const heightOf = (lines) => Math.round(lines * LINE);

test("접는 기준: 생성 글은 12줄 초과 시 6줄, 지원자가 쓴 글은 18줄 초과 시 12줄", () => {
  assert.deepEqual(FOLD_GENERATED, { over: 12, show: 6 });
  assert.deepEqual(FOLD_AUTHORED, { over: 18, show: 12 });
});

test("줄 수 경계: 12줄·18줄은 접지 않고 13줄·19줄부터 접는다", () => {
  for (const [limit, keep, fold] of [[FOLD_GENERATED, 12, 13], [FOLD_AUTHORED, 18, 19]]) {
    assert.equal(countLines(heightOf(keep), LINE), keep);
    assert.equal(countLines(heightOf(fold), LINE), fold);
    assert.equal(foldNeeded(countLines(heightOf(keep), LINE), limit), false, `${keep}줄은 그대로`);
    assert.equal(foldNeeded(countLines(heightOf(fold), LINE), limit), true, `${fold}줄은 접음`);
  }
  assert.equal(foldNeeded(countLines(heightOf(1), LINE), FOLD_GENERATED), false);
  assert.equal(foldNeeded(countLines(heightOf(14), LINE), FOLD_AUTHORED), false, "지원자가 쓴 글은 14줄이어도 접지 않는다");
});

test("줄 높이를 알 수 없으면 0줄로 세어 접지 않는다", () => {
  for (const lineHeight of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
    assert.equal(countLines(1000, lineHeight), 0);
    assert.equal(foldNeeded(countLines(1000, lineHeight), FOLD_GENERATED), false);
  }
  assert.equal(countLines(Number.NaN, LINE), 0);
});

// 덩어리 자리 만들기: 글줄 수와 덩어리 앞 여백(px)을 받아 위에서부터 쌓는다. 브라우저 값처럼 소수 높이를 그대로 쓴다.
const stack = (parts) => {
  let top = 0;
  return parts.map(([lines, gapBefore = 0]) => {
    top += gapBefore;
    const block = { top, height: lines * LINE, lineHeight: LINE };
    top += block.height;
    return block;
  });
};
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? "높이"}: ${actual} ≠ ${expected}`);

test("본문 기준: 문단 하나는 12·13줄, 18·19줄 경계가 같고 접힌 높이는 6줄·12줄이다", () => {
  assert.equal(FOLD_TEXT_SELECTOR, "p, li");
  assert.deepEqual(measureFold(stack([[12]]), FOLD_GENERATED), { lines: 12, needed: false, height: 0 });
  const generated = measureFold(stack([[13]]), FOLD_GENERATED);
  assert.deepEqual([generated.lines, generated.needed], [13, true]);
  near(generated.height, 6 * LINE);
  assert.deepEqual(measureFold(stack([[18]]), FOLD_AUTHORED), { lines: 18, needed: false, height: 0 });
  const authored = measureFold(stack([[19]]), FOLD_AUTHORED);
  assert.deepEqual([authored.lines, authored.needed], [19, true]);
  near(authored.height, 12 * LINE);
});

test("본문 기준: 칸 제목과 칸 사이 여백은 줄 수에 들지 않는다", () => {
  // 작성자 설명 세 칸. 칸마다 제목(h5 약 25px)과 칸 사이 여백 10px이 글 앞에 있다.
  const HEADING = 25;
  const GAP = 10;
  const eighteen = stack([[6, HEADING], [6, GAP + HEADING], [6, GAP + HEADING]]);
  const total = eighteen.at(-1).top + eighteen.at(-1).height;
  assert.ok(countLines(total, LINE) > 18, "상자 전체 높이로 세면 18줄을 넘는다");
  assert.deepEqual(measureFold(eighteen, FOLD_AUTHORED), { lines: 18, needed: false, height: 0 }, "글줄은 18줄이라 접지 않는다");

  const nineteen = stack([[7, HEADING], [6, GAP + HEADING], [6, GAP + HEADING]]);
  const folded = measureFold(nineteen, FOLD_AUTHORED);
  assert.equal(folded.lines, 19);
  assert.equal(folded.needed, true);
  // 12번째 글줄은 둘째 칸의 다섯째 줄이다. 그 아래 끝까지가 접힌 높이이고, 첫째·둘째 칸 제목과 여백이 그 안에 들어간다.
  near(folded.height, nineteen[1].top + 5 * LINE);
  assert.ok(folded.height > 12 * LINE, "칸 제목만큼 높이가 더 있어 글줄 12줄이 다 보인다");
});

test("본문 기준: 목록은 항목 사이 여백과 상관없이 글줄만 세고, 여러 줄 항목은 그 줄 수대로 센다", () => {
  const GAP = 6;
  const twelve = stack(Array.from({ length: 12 }, (_, index) => [1, index === 0 ? 0 : GAP]));
  assert.deepEqual(measureFold(twelve, FOLD_GENERATED), { lines: 12, needed: false, height: 0 }, "여백을 더해도 12줄은 접지 않는다");
  const thirteen = stack(Array.from({ length: 13 }, (_, index) => [1, index === 0 ? 0 : GAP]));
  const folded = measureFold(thirteen, FOLD_GENERATED);
  assert.equal(folded.needed, true);
  near(folded.height, thirteen[5].top + LINE, "여섯째 항목의 아래 끝까지");
  // 두 줄짜리 항목 일곱 개는 14줄이다. 6번째 글줄은 셋째 항목의 둘째 줄이다.
  const wrapped = stack(Array.from({ length: 7 }, () => [2]));
  const wrappedFold = measureFold(wrapped, FOLD_GENERATED);
  assert.deepEqual([wrappedFold.lines, wrappedFold.needed], [14, true]);
  near(wrappedFold.height, wrapped[2].top + 2 * LINE);
  // 6번째 글줄이 항목 가운데에 걸리면 그 줄까지만 보인다.
  const uneven = stack([[4], [5], [9]]);
  const unevenFold = measureFold(uneven, FOLD_GENERATED);
  assert.deepEqual([unevenFold.lines, unevenFold.needed], [18, true]);
  near(unevenFold.height, uneven[1].top + 2 * LINE);
});

test("본문 기준: 줄 높이를 모르는 덩어리는 0줄로 세고, 덩어리가 없으면 접지 않는다", () => {
  assert.deepEqual(measureFold([], FOLD_GENERATED), { lines: 0, needed: false, height: 0 });
  assert.deepEqual(measureFold([{ top: 0, height: 1000, lineHeight: Number.NaN }], FOLD_GENERATED), { lines: 0, needed: false, height: 0 });
});

test("펼침 규칙: 강조가 가리키면 펼치고, 다시 접은 뒤 같은 출처를 다시 누르면 다시 펼친다", () => {
  const first = { fieldPath: "body" };
  const again = { fieldPath: "body" };
  assert.equal(foldOpen(INITIAL_FOLD_TOGGLE, null), false, "처음에는 접힘");
  assert.equal(foldOpen({ open: true, at: null }, null), true, "사람이 펼침");
  assert.equal(foldOpen(INITIAL_FOLD_TOGGLE, first), true, "강조가 가리키면 펼침");
  assert.equal(foldOpen({ open: false, at: first }, first), false, "그 강조 뒤에 사람이 접으면 접힌 채");
  assert.equal(foldOpen({ open: false, at: first }, again), true, "같은 출처를 다시 누르면(새 강조) 다시 펼침");
  assert.equal(foldOpen({ open: true, at: null }, first), true);
  assert.equal(foldOpen({ open: true, at: first }, null), true, "사람이 펼쳐 둔 글은 강조가 떠나도 펼친 채");
  assert.equal(foldOpen(INITIAL_FOLD_TOGGLE, null), false, "자동으로 펼쳤던 글은 강조가 떠나면 접힘으로 돌아감");
});

const frame = (props) => renderToStaticMarkup(createElement(FoldFrame, { id: "fold-1", maxHeight: 153.6, label: "자료 A 본문", ...props }, "원문 글 전체"));

test("접는 틀: 기준 이하면 단추가 없고 높이를 줄이지 않는다", () => {
  const html = frame({ needed: false, open: false });
  assert.equal(html.includes("<button"), false);
  assert.equal(html.includes("max-height"), false);
  assert.equal(html.includes("data-folded"), false);
  assert.match(html, /원문 글 전체/);
});

test("접는 틀: 접힌 동안에는 「전체 보기」와 aria-expanded=false이고 원문은 그대로 있다", () => {
  const html = frame({ needed: true, open: false });
  assert.match(html, /<button type="button"[^>]*aria-expanded="false"[^>]*aria-controls="fold-1"[^>]*>전체 보기<span class="visually-hidden"> \(자료 A 본문\)<\/span><\/button>/);
  assert.match(html, /<div id="fold-1"[^>]*style="max-height:153.6px"[^>]*>원문 글 전체<\/div>/);
  assert.match(html, /data-folded="true"/);
});

test("접는 틀: 펼친 동안에는 「접기」와 aria-expanded=true이고 높이 제한이 없다", () => {
  const html = frame({ needed: true, open: true });
  assert.match(html, /<button type="button"[^>]*aria-expanded="true"[^>]*aria-controls="fold-1"[^>]*>접기<span/);
  assert.equal(html.includes("max-height"), false);
  assert.equal(html.includes("data-folded"), false);
  // 펼친 동안에만 단추 줄에 표지가 붙는다(키보드 초점이 있을 때 화면 아래쪽에 붙이는 모양은 CSS이고 브라우저에서 확인한다).
  assert.match(html, /<div class="foldBar" data-open="true"><button/);
  assert.match(frame({ needed: true, open: false }), /<div class="foldBar"><button/);
});

test("접는 틀: 검토용 글(N줄·미리보기·전체 표시)을 그리지 않는다", () => {
  for (const html of [frame({ needed: true, open: false }), frame({ needed: true, open: true }), frame({ needed: false, open: false })]) {
    for (const word of ["미리보기", "전체 표시", "줄 ·"]) assert.equal(html.includes(word), false, word);
  }
});

const LONG_FACTS = Array.from({ length: 30 }, (_, index) => `작업 사실 ${index + 1}번`);
const LONG_BODY = Array.from({ length: 40 }, (_, index) => `본문 ${index + 1}째 줄`).join("\n");
const LONG_PAGE = Array.from({ length: 40 }, (_, index) => `쪽 글 ${index + 1}째 줄`).join("\n");
const SNAPSHOT = {
  title: "발행본", publishedAt: "2026-11-05T03:04:05.000Z", expiresAt: "2027-02-03T03:04:05.000Z",
  items: [
    { publishedItemId: "c1", position: 1, itemKind: "CATCH", title: "결제 재시도",
      snapshot: { workFacts: LONG_FACTS, workLimits: ["실제 장애 때의 동작"], subjectContribution: "본인 커밋 4개",
        evidence: [{ sourceUrl: "https://github.com/o/r/commit/abc", sourceRevision: "abc", representedFacts: ["파일 1개"] }],
        authorDescription: LONG_BODY, aiDraft: LONG_BODY, mismatch: false } },
    { publishedItemId: "t1", position: 2, itemKind: "TEXT_MATERIAL", title: "자기소개서", snapshot: { body: LONG_BODY } },
    { publishedItemId: "p1", position: 3, itemKind: "PDF_MATERIAL", title: "포트폴리오", snapshot: { pageCount: 2 },
      pdfPages: [{ pageNumber: 1, readable: true, text: LONG_PAGE }, { pageNumber: 2, readable: false, text: "" }] },
  ],
};
const view = (highlight = null) => renderToStaticMarkup(createElement(PublishedSnapshotView, { snapshot: SNAPSHOT, highlight }));
const count = (html, needle) => html.split(needle).length - 1;

test("사본: Catch 세 칸·텍스트 본문·읽을 수 있는 PDF 쪽마다 접는 틀이 하나씩 있다", () => {
  const html = view();
  assert.equal(count(html, 'data-testid="snapshot-fold"'), 5, "AI 설명 초안·작성자 설명·작업 사실·본문·PDF 1쪽");
  assert.match(html, /data-testid="snapshot-pdf-page-unreadable"/, "읽을 수 없는 쪽은 틀 없이 표지만");
});

test("사본: 긴 글도 원문 전체를 그대로 그린다(글자를 자르지 않는다)", () => {
  const html = view();
  assert.equal(count(html, LONG_BODY), 3, "AI 설명 초안·작성자 설명·텍스트 본문");
  assert.equal(count(html, LONG_PAGE), 1);
  for (const fact of LONG_FACTS) assert.equal(count(html, `<li>${fact}</li>`), 1, fact);
  assert.equal(html.includes("…"), false);
});

test("사본: 「이 기록으로 알 수 없는 것」과 「근거 자세히 보기」는 접는 틀 밖이다", () => {
  const html = view();
  const facts = html.slice(html.indexOf('data-testid="snapshot-catch-facts"'), html.indexOf('data-kind="TEXT_MATERIAL"'));
  // 작업 사실의 틀은 목록(ul)만 감싸고 바로 닫힌다. 서버에서 그린 글은 재기 전이라 단추가 없다.
  const fold = /<div class="fold" data-testid="snapshot-fold"><div id="[^"]*" class="foldBody"><ul>(?:<li>[^<]*<\/li>)+<\/ul><\/div><\/div>/.exec(facts);
  assert.notEqual(fold, null);
  const after = facts.slice(fold.index + fold[0].length);
  assert.match(after, /^<div data-testid="snapshot-catch-work-limits">/);
  assert.match(after, /<details[^>]*data-testid="snapshot-catch-evidence-details"/);
  assert.equal(fold[0].includes("근거 자세히 보기"), false);
});

test("사본: 강조는 접는 틀 안에 그대로 그려지고 「근거 자세히 보기」 안 강조는 그 칸을 펼친다", () => {
  const mark = (text) => `<mark class="highlight" data-testid="snapshot-highlight">${text}</mark>`;
  const fact = view({ publishedItemId: "c1", fieldPath: "workFacts[20]", charStart: 0, charEnd: 5 });
  assert.match(fact, new RegExp(`class="foldBody"><ul>.*<li>${mark("작업 사실")} 21번</li>`));
  const body = view({ publishedItemId: "t1", fieldPath: "body", charStart: LONG_BODY.length - 4, charEnd: LONG_BODY.length });
  assert.equal(body.includes(mark("0째 줄")), true, "긴 본문의 맨 끝도 강조한다");
  const page = view({ publishedItemId: "p1", fieldPath: "pages[1]", charStart: 0, charEnd: 3 });
  assert.equal(count(page, 'data-testid="snapshot-highlight"'), 1);
  const inner = view({ publishedItemId: "c1", fieldPath: "evidence[0].representedFacts[0]", charStart: 0, charEnd: 2 });
  assert.match(inner, /<details[^>]*data-testid="snapshot-catch-evidence-details"[^>]*open=""/);
  assert.equal(inner.includes(mark("파일")), true);
});

test("사본: 접기 단추의 화면 낭독기 이름에 쓸 글 이름은 자료 제목과 칸 이름이다", () => {
  // 서버에서 그린 글은 재기 전이라 단추가 없다. 이름은 틀에 그려 확인한다.
  const html = renderToStaticMarkup(createElement(FoldFrame, { id: "x", needed: true, open: false, maxHeight: 1, label: "결제 재시도 AI 설명 초안" }, "글"));
  assert.match(html, /전체 보기<span class="visually-hidden"> \(결제 재시도 AI 설명 초안\)<\/span>/);
});
