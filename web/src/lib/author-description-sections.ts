/**
 * Catch 작성자 설명의 칸 나누기·합치기(새 Catch NC1 AuthorDescriptionSections, BR1.1~BR1.6, 계약 C7).
 * 저장 칸은 지금처럼 글 하나이고, 칸 제목 줄(`【칸 제목】`)로 칸을 가른다. 편집 화면(8칸)과 사본 보기(칸별 h5)가 함께 쓴다.
 * React·화면 모듈을 불러오지 않는 순수 함수다. 위치는 C-11 강조 위치와 같은 UTF-16 코드 단위, 글자 수는 api와 같은 코드 포인트다(ADR-001).
 */

/** 칸 제목. 순서가 편집 화면과 발행본의 칸 순서다(BR1.1). 문구를 바꾸면 이미 쓴 글의 옛 칸 제목 줄은 일반 글로 읽힌다(FR1.8). */
export const SECTION_TITLES = [
  "이 작업에서 정한 것", "맡은 부분", "무엇이 문제였나", "고른 것과 버린 것",
  "어떻게 확인했나·결과", "AI가 낸 것 가운데 받아들이지 않았거나 고친 것", "짚어 볼 곳", "더 쓰기",
] as const;
export type SectionTitle = (typeof SECTION_TITLES)[number];
export type SectionTexts = Record<SectionTitle, string>;

/**
 * 글이 있는 칸 하나. `start`는 저장된 글 안에서 이 칸 글이 시작하는 UTF-16 위치다(BR1.3).
 * `joined`는 저장된 글 안에서 한 덩어리가 아닌 이은 칸(같은 칸 제목 줄이 두 번 나온 칸, 첫 칸 제목 줄 앞의 글과
 * 「더 쓰기」 칸 제목 줄 뒤 글을 함께 받은 「더 쓰기」)이고, 그 칸의 `start`는 강조에 쓰지 않는다(BR1.2·BR7.5).
 */
export type Section = { title: SectionTitle; text: string; start: number; joined: boolean };

/** 작성자 설명 상한(api `AUTHOR_DESCRIPTION_MAX_LENGTH`). 칸 제목 줄을 포함한 합친 글을 코드 포인트로 센다(BR1.5). */
export const MAX_DESCRIPTION_LENGTH = 4000;

const FREE_TITLE: SectionTitle = "더 쓰기";
const HEADINGS = new Map<string, SectionTitle>(SECTION_TITLES.map((title) => [`【${title}】`, title]));

/** 줄 하나의 내용 범위 `[start, end)`와 다음 줄 시작 `next`. 줄 끝은 `\n`과 `\r\n`이다. */
type Line = { start: number; end: number; next: number };

function readLines(stored: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (;;) {
    const newline = stored.indexOf("\n", start);
    if (newline < 0) { lines.push({ start, end: stored.length, next: stored.length }); return lines; }
    const end = newline > start && stored[newline - 1] === "\r" ? newline - 1 : newline;
    lines.push({ start, end, next: newline + 1 });
    start = newline + 1;
  }
}

const withoutLineEnd = (text: string) => text.endsWith("\r\n") ? text.slice(0, -2) : text.endsWith("\n") ? text.slice(0, -1) : text;

/** 다음 칸 제목 줄 앞 조각: 마지막 줄 끝과 칸 사이 구분인 빈 줄 하나를 뺀다. 칸 글 안의 줄바꿈 문자는 바꾸지 않는다(BR1.2). */
const beforeHeading = (segment: string) => withoutLineEnd(withoutLineEnd(segment));

/** 저장된 글을 칸 제목 줄로 자른 조각들. 첫 칸 제목 줄 앞의 글(옛 자유 글 포함)은 「더 쓰기」 조각으로 맨 앞에 둔다. */
function readChunks(stored: string): Section[] {
  const headings = readLines(stored).flatMap((line) => {
    // 줄 하나 전체가 칸 제목 줄과 글자까지 같을 때만 칸 제목 줄이다(앞뒤 공백 없음, BR1.1).
    const title = HEADINGS.get(stored.slice(line.start, line.end));
    return title ? [{ title, lineStart: line.start, bodyStart: line.next }] : [];
  });
  if (headings.length === 0) return [{ title: FREE_TITLE, text: stored, start: 0, joined: false }];
  const chunks: Section[] = [{ title: FREE_TITLE, text: beforeHeading(stored.slice(0, headings[0].lineStart)), start: 0, joined: false }];
  headings.forEach((heading, index) => {
    const next = headings[index + 1];
    const segment = stored.slice(heading.bodyStart, next ? next.lineStart : stored.length);
    chunks.push({ title: heading.title, text: next ? beforeHeading(segment) : segment, start: heading.bodyStart, joined: false });
  });
  return chunks;
}

const hasText = (text: string) => text.trim().length > 0;

/**
 * 저장된 글을 칸으로 나눈다(BR1.1~BR1.3). 글이 있는 칸만 칸 제목 순서대로 돌려준다.
 * 같은 칸 조각이 둘 이상이면 빈 줄 하나를 두고 이어 붙이고 `joined`로 표시한다.
 */
export function splitSections(stored: string | null): Section[] {
  if (stored === null || stored.length === 0) return [];
  const chunks = readChunks(stored).filter((chunk) => hasText(chunk.text));
  return SECTION_TITLES.flatMap((title) => {
    const own = chunks.filter((chunk) => chunk.title === title);
    if (own.length === 0) return [];
    return [{ title, text: own.map((chunk) => chunk.text).join("\n\n"), start: own[0].start, joined: own.length > 1 }];
  });
}

/** 편집 화면용 8칸. 글이 없는 칸은 빈 글이다. */
export function sectionTexts(stored: string | null): SectionTexts {
  const texts = Object.fromEntries(SECTION_TITLES.map((title) => [title, ""])) as SectionTexts;
  for (const section of splitSections(stored)) texts[section.title] = section.text;
  return texts;
}

/**
 * 8칸을 저장할 글 하나로 합친다(BR1.4). 앞뒤 공백을 지우면 0자인 칸은 칸 제목째 넣지 않는다.
 * 「더 쓰기」만 있으면 칸 제목 없이 그 글 그대로이고(옛 자유 글 왕복, BR1.6), 모두 비면 빈 글이다(저장하면 api가 설명을 지운다).
 * 칸 글은 친 그대로 두고 앞뒤 공백을 바꾸지 않는다.
 */
export function joinSections(texts: Readonly<SectionTexts>): string {
  const written = SECTION_TITLES.filter((title) => hasText(texts[title]));
  if (written.length === 0) return "";
  if (written.length === 1 && written[0] === FREE_TITLE) return texts[FREE_TITLE];
  return written.map((title) => `【${title}】\n${texts[title]}`).join("\n\n");
}

/** 합계 글자 수. api `author-description-input.ts`와 같은 코드 포인트다(BR1.5). */
export function countCodePoints(text: string): number {
  return Array.from(text).length;
}
