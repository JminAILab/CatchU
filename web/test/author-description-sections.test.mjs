// 새 Catch NC1 — 작성자 설명 칸 나누기·합치기(`src/lib/author-description-sections.ts`, AuthorDescriptionSections) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(US1.1~US1.3 수락 기준, BR1.1~BR1.6, NFR7.1, Unit 시험 안내 「실패 조건」 칸). 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 쓴 칸만 칸 제목 줄(`【칸 제목】`)과 함께 저장 글에 들어가고 칸 사이에 빈 줄 하나가 있다. 「더 쓰기」만 쓰면 칸 제목 없이 그 글 그대로다.
//         합친 글을 다시 나누면 같은 8칸이고 칸 안 줄바꿈이 그대로 돌아온다. 칸 제목 줄이 없는 옛 글은 「더 쓰기」 하나로 열리고 그대로 합치면 원래 글이다.
//         합계 글자 수는 칸 제목 포함 코드 포인트이고, 칸 시작 위치는 UTF-16 위치다.
// - 실패 조건: 빈 칸의 칸 제목이 저장 글에 남음, 「더 쓰기」만 쓴 글에 칸 제목이 붙음, 옛 글을 그대로 합쳤는데 글이 바뀜, 4,001자를 상한 안으로 셈,
//         【참고】 같은 다른 겹낫표 줄을 칸 제목으로 읽음, 이은 칸을 이은 칸으로 표시하지 않음.
//
// 순수 함수만 부른다. 화면 렌더링·api 저장 검증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_DESCRIPTION_LENGTH, SECTION_TITLES, countCodePoints, joinSections, sectionTexts, splitSections,
} from "../src/lib/author-description-sections.ts";

const empty = () => Object.fromEntries(SECTION_TITLES.map((title) => [title, ""]));
const texts = (patch) => ({ ...empty(), ...patch });

test("칸 제목 8개는 정한 순서다", () => {
  assert.deepEqual(SECTION_TITLES, [
    "이 작업에서 정한 것", "맡은 부분", "무엇이 문제였나", "고른 것과 버린 것",
    "어떻게 확인했나·결과", "AI가 낸 것 가운데 받아들이지 않았거나 고친 것", "짚어 볼 곳", "더 쓰기",
  ]);
  assert.equal(MAX_DESCRIPTION_LENGTH, 4000);
});

test("AC1.1.1 두 칸만 쓰면 저장 글에 그 두 칸만 칸 제목과 함께 들어가고 나머지 여섯 칸 제목은 없다", () => {
  const joined = joinSections(texts({ "이 작업에서 정한 것": "브라우저에서 줄여 올리기로 했다.", "짚어 볼 곳": "https://github.com/o/r/commit/ba6bba8" }));
  assert.equal(joined, "【이 작업에서 정한 것】\n브라우저에서 줄여 올리기로 했다.\n\n【짚어 볼 곳】\nhttps://github.com/o/r/commit/ba6bba8");
  for (const title of SECTION_TITLES.filter((t) => t !== "이 작업에서 정한 것" && t !== "짚어 볼 곳")) {
    assert.ok(!joined.includes(`【${title}】`), title);
  }
});

test("AC1.1.2 두 칸을 저장했다 다시 열면 칸 안 줄바꿈까지 그대로 돌아오고 나머지 여섯 칸은 비어 있다", () => {
  const written = texts({
    "맡은 부분": "게시글 작성 화면\n프로필 설정 창",
    "짚어 볼 곳": "https://github.com/o/r/blob/ba6bba8/a.ts#L3 줄이는 곳\nhttps://github.com/o/r/commit/ba6bba8 관련 커밋\n",
  });
  const reopened = sectionTexts(joinSections(written));
  assert.deepEqual(reopened, written);
  assert.equal(Object.values(reopened).filter((text) => text === "").length, 6);
  // 칸 글 앞뒤의 빈 줄·공백도 바꾸지 않는다.
  const padded = texts({ "맡은 부분": "\n  앞에 빈 줄", "무엇이 문제였나": "끝에 빈 줄\n\n" });
  assert.deepEqual(sectionTexts(joinSections(padded)), padded);
});

test("AC1.1.3 8칸을 모두 비우면 빈 글이고 공백만 있는 칸도 빈 칸이다", () => {
  assert.equal(joinSections(empty()), "");
  assert.equal(joinSections(texts({ "맡은 부분": "   ", "더 쓰기": "\n\t" })), "");
  assert.deepEqual(splitSections(null), []);
  assert.deepEqual(splitSections(""), []);
  assert.deepEqual(sectionTexts(null), empty());
});

test("AC1.1.5 칸 안에 칸 제목 줄과 같은 줄을 써도 합치기는 막히지 않고, 다시 열면 그 줄부터 그 칸으로 읽힌다(한계)", () => {
  const written = texts({ "고른 것과 버린 것": "버린 안\n【짚어 볼 곳】\n이 줄은 다음 칸으로 읽힌다" });
  const joined = joinSections(written);
  assert.equal(joined, "【고른 것과 버린 것】\n버린 안\n【짚어 볼 곳】\n이 줄은 다음 칸으로 읽힌다");
  const reopened = sectionTexts(joined);
  assert.equal(reopened["고른 것과 버린 것"], "버린 안");
  assert.equal(reopened["짚어 볼 곳"], "이 줄은 다음 칸으로 읽힌다");
});

test("AC1.2.1 칸 제목을 포함한 합계가 4,001자면 상한을 넘고 4,000자는 넘지 않는다", () => {
  const heading = "【맡은 부분】\n";
  const fixed = countCodePoints(joinSections(texts({ "맡은 부분": "가", "짚어 볼 곳": "x" }))) - 1;
  const over = texts({ "맡은 부분": "가".repeat(4001 - fixed), "짚어 볼 곳": "x" });
  const joined = joinSections(over);
  assert.equal(countCodePoints(joined), 4001);
  assert.ok(countCodePoints(joined) > MAX_DESCRIPTION_LENGTH);
  assert.equal(countCodePoints(joinSections(texts({ "맡은 부분": "가".repeat(4000 - heading.length) }))), 4000);
});

test("AC1.3.1 칸 제목 줄이 없는 3,990자 옛 글은 「더 쓰기」 하나로 열리고 그대로 합치면 원래 글과 같아 상한에 걸리지 않는다", () => {
  const old = ("예전에 자유롭게 쓴 설명입니다.\n").repeat(300).slice(0, 3990);
  assert.equal(countCodePoints(old), 3990);
  const opened = sectionTexts(old);
  assert.deepEqual(opened, texts({ "더 쓰기": old }));
  const saved = joinSections(opened);
  assert.equal(saved, old);
  assert.ok(countCodePoints(saved) <= MAX_DESCRIPTION_LENGTH);
  assert.deepEqual(splitSections(old), [{ title: "더 쓰기", text: old, start: 0, joined: false }]);
});

test("AC1.3.2 「더 쓰기」만 쓰면 저장 글에 칸 제목 글자가 붙지 않는다", () => {
  assert.equal(joinSections(texts({ "더 쓰기": "  덧붙이는 말  " })), "  덧붙이는 말  ");
  // 다른 칸과 함께면 「더 쓰기」도 칸 제목 줄을 쓴다.
  assert.equal(joinSections(texts({ "맡은 부분": "a", "더 쓰기": "b" })), "【맡은 부분】\na\n\n【더 쓰기】\nb");
});

test("BR1.1 【참고】 같은 다른 겹낫표 줄, 앞뒤 공백이 붙은 칸 제목 줄, 줄 안의 칸 제목은 일반 글이다", () => {
  for (const stored of ["【참고】\n본문", " 【맡은 부분】\n본문", "【맡은 부분】 \n본문", "앞 【맡은 부분】 뒤"]) {
    assert.deepEqual(splitSections(stored), [{ title: "더 쓰기", text: stored, start: 0, joined: false }], stored);
  }
});

test("BR1.2 같은 칸 제목 줄이 두 번이면 빈 줄 하나를 두고 이어 이은 칸이 되고, 첫 칸 제목 앞 글은 「더 쓰기」 맨 앞에 온다", () => {
  const twice = splitSections("【맡은 부분】\n첫 조각\n\n【짚어 볼 곳】\n링크\n\n【맡은 부분】\n둘째 조각");
  assert.deepEqual(twice.map((s) => [s.title, s.text, s.joined]), [
    ["맡은 부분", "첫 조각\n\n둘째 조각", true], ["짚어 볼 곳", "링크", false],
  ]);
  const preface = splitSections("칸 제목 앞 글\n\n【맡은 부분】\n맡음\n\n【더 쓰기】\n덧붙임");
  assert.deepEqual(preface.map((s) => [s.title, s.text, s.joined]), [["맡은 부분", "맡음", false], ["더 쓰기", "칸 제목 앞 글\n\n덧붙임", true]]);
  // 「더 쓰기」 칸 제목 줄 없이 앞 글만 있으면 이은 칸이 아니다.
  const prefaceStored = "칸 제목 앞 글\n\n【맡은 부분】\n맡음";
  assert.deepEqual(splitSections(prefaceStored).map((s) => [s.title, s.text, s.joined, s.start]),
    [["맡은 부분", "맡음", false, prefaceStored.indexOf("맡음")], ["더 쓰기", "칸 제목 앞 글", false, 0]]);
});

test("BR1.2 줄 끝은 \\n과 \\r\\n을 모두 읽고 칸 글 안의 줄바꿈 문자는 바꾸지 않는다", () => {
  const sections = splitSections("【맡은 부분】\r\n첫 줄\r\n둘째 줄\r\n\r\n【짚어 볼 곳】\r\n링크");
  assert.deepEqual(sections.map((s) => [s.title, s.text]), [["맡은 부분", "첫 줄\r\n둘째 줄"], ["짚어 볼 곳", "링크"]]);
});

test("BR1.3 칸 시작 위치는 UTF-16 위치라 이모지가 든 글에서 코드 포인트 수와 다르고, 그 위치부터 칸 글이 그대로 있다", () => {
  const stored = joinSections(texts({ "맡은 부분": "😀 화면", "짚어 볼 곳": "https://github.com/o/r/pull/1" }));
  const sections = splitSections(stored);
  for (const section of sections) assert.equal(stored.slice(section.start, section.start + section.text.length), section.text, section.title);
  const pointsBefore = countCodePoints(stored.slice(0, sections[1].start));
  assert.equal(sections[1].start, pointsBefore + 1, "😀은 UTF-16 두 단위, 코드 포인트 하나");
  assert.equal(countCodePoints("😀"), 1);
  assert.equal("😀".length, 2);
});

test("BR1.6 합친 글을 다시 나누면 같은 8칸이 나온다(모든 칸을 쓴 경우)", () => {
  const all = Object.fromEntries(SECTION_TITLES.map((title, index) => [title, `${index + 1}번 칸\n두 줄`]));
  assert.deepEqual(sectionTexts(joinSections(all)), all);
  assert.deepEqual(splitSections(joinSections(all)).map((s) => s.title), SECTION_TITLES);
});
