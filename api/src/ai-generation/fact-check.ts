// 기계 대조(U2 기능 설계 BR3.3~BR3.5, 계약 C-01 check-scope, 비기능 NFR2.3).
// 대조 낱말은 항목 글과 대조 대상 글에 같은 나누기를 써서 게이트 안에서만 뽑는다. 대조는 낱말 단위 일치다.
import type { AiGenerationRequest, AiSource, GatedItem } from './ai-generation.types';

/** 영어 표기 대조에서 빼는 약어(BR3.3). 소문자로 비교한다. */
export const ENGLISH_TERM_EXCEPTIONS: ReadonlySet<string> = new Set([
  'ai', 'api', 'pr', 'ci', 'cd', 'llm', 'jd', 'db', 'id', 'url', 'ui', 'sdk', 'mvp', 'http', 'json',
]);

/** 한 글에서 뽑은 대조 낱말 묶음(U2 entities CheckTokens). */
export interface CheckTokens {
  numbers: Set<string>;
  prNumbers: Set<string>;
  fileNames: Set<string>;
  /** 소문자, 예외 약어 제외, 한 글자 포함. */
  englishTerms: Set<string>;
}

// "#123", "PR 123", "PR#123", "PR #123". 영문 낱말 안의 PR(예: "APR 3")은 PR 번호가 아니다.
const PR_NUMBER = /(?<![A-Za-z0-9])(?:PR\s?#?\s?|#)(\d+)/gi;
// 영문·숫자로 시작하는 ASCII 덩어리. 안쪽의 . - _ + # / 를 포함한다.
const ASCII_CHUNK = /[A-Za-z0-9][A-Za-z0-9._\-+#/]*/g;
const NUMBER = /\d+(?:\.\d+)?/g;
// 영문자로 시작하고 점 뒤에 영문·숫자 확장자가 붙은 덩어리(main.ts, Node.js).
const FILE_WITH_EXTENSION = /^[A-Za-z][A-Za-z0-9_\-+#]*(?:\.[A-Za-z0-9_\-+#]+)*\.[A-Za-z0-9]+$/;
const LETTER = /[A-Za-z]/;

type Chunk = { kind: 'NUMBER' | 'FILE' | 'ENGLISH'; raw: string };

/** PR 번호를 뗀 글의 ASCII 덩어리를 차례로 숫자·파일 이름·영어 표기로 나눈다(BR3.3). */
function classifyChunks(text: string, prNumbers?: Set<string>): Chunk[] {
  const withoutPr = text.replace(PR_NUMBER, (_, digits: string) => {
    prNumbers?.add(normalizeNumber(digits));
    return ' ';
  });
  const chunks: Chunk[] = [];
  for (const raw of withoutPr.match(ASCII_CHUNK) ?? []) {
    const chunk = raw.replace(/[.-]+$/, '');
    if (chunk === '') continue;
    if (/^[0-9]/.test(chunk)) chunks.push({ kind: 'NUMBER', raw: chunk });
    else if ((chunk.includes('/') && LETTER.test(chunk)) || FILE_WITH_EXTENSION.test(chunk)) chunks.push({ kind: 'FILE', raw: chunk });
    else chunks.push({ kind: 'ENGLISH', raw: chunk });
  }
  return chunks;
}

/** BR3.3: 글에서 숫자·PR 번호·파일 이름·영어 표기를 뽑는다. */
export function extractCheckTokens(text: string): CheckTokens {
  const tokens: CheckTokens = { numbers: new Set(), prNumbers: new Set(), fileNames: new Set(), englishTerms: new Set() };
  for (const { kind, raw } of classifyChunks(text, tokens.prNumbers)) {
    if (kind === 'NUMBER') {
      for (const number of raw.match(NUMBER) ?? []) tokens.numbers.add(normalizeNumber(number));
    } else if (kind === 'FILE') {
      tokens.fileNames.add(raw.toLowerCase());
    } else if (!ENGLISH_TERM_EXCEPTIONS.has(raw.toLowerCase())) {
      tokens.englishTerms.add(raw.toLowerCase());
    }
  }
  return tokens;
}

/** 글의 첫 ASCII 덩어리와, 영어 표기(예외 약어 제외)를 나온 순서·원문 표기 그대로(U2 BR4.7 후보용). */
export function englishTermsInOrder(text: string): { first: string | null; terms: string[] } {
  const chunks = classifyChunks(text);
  const terms = chunks.filter((chunk) => chunk.kind === 'ENGLISH' && !ENGLISH_TERM_EXCEPTIONS.has(chunk.raw.toLowerCase()))
    .map((chunk) => chunk.raw);
  return { first: chunks[0]?.raw ?? null, terms };
}

/** 앞자리 0을 뗀다(007과 7을 같은 낱말로 본다). 소수점 아래는 그대로 둔다. */
function normalizeNumber(value: string): string {
  const [whole, fraction] = value.split('.');
  const trimmed = whole.replace(/^0+(?=\d)/, '');
  return fraction === undefined ? trimmed : `${trimmed}.${fraction}`;
}

/** catchEvidenceUrls의 "/pull/{n}"에서 뽑은 Catch PR 번호. */
export function catchPrNumbers(sources: readonly AiSource[]): Set<string> {
  const numbers = new Set<string>();
  for (const source of sources) {
    for (const url of source.catchEvidenceUrls) {
      for (const match of url.matchAll(/\/pull\/(\d+)(?![0-9])/g)) numbers.add(normalizeNumber(match[1]));
    }
  }
  return numbers;
}

const isSubset = (values: Set<string>, allowed: Set<string>): boolean => [...values].every((value) => allowed.has(value));

/** 대조 대상: 그 글의 낱말과, PR 번호로 더 허용할 Catch PR 번호. */
export interface CheckTarget {
  tokens: CheckTokens;
  extraPrNumbers: Set<string>;
}

/** BR3.4: 항목의 숫자·PR 번호·파일 이름·영어 표기가 모두 대상 글(+Catch PR 번호)에 있어야 한다. */
export function passesCitedCheck(item: CheckTokens, target: CheckTarget): boolean {
  return isSubset(item.numbers, target.tokens.numbers)
    && [...item.prNumbers].every((pr) => target.tokens.prNumbers.has(pr) || target.extraPrNumbers.has(pr))
    && isSubset(item.fileNames, target.tokens.fileNames)
    && isSubset(item.englishTerms, target.tokens.englishTerms);
}

/**
 * BR3.5: 숫자·PR 번호가 하나라도 있으면 버린다. 영어 표기는 발행본 글에 있어야 한다.
 * 파일 이름도 원문 표기라 영어 표기와 같이 발행본 글에 있어야 남긴다.
 */
export function passesInterpretationCheck(item: CheckTokens, publication: CheckTokens): boolean {
  if (item.numbers.size > 0 || item.prNumbers.size > 0) return false;
  return isSubset(item.englishTerms, publication.englishTerms) && isSubset(item.fileNames, publication.fileNames);
}

/** 인용 항목의 대조 대상: 그 항목 citations[].quote를 합친 글과, 인용한 근거의 Catch PR 번호. */
export function citedTarget(item: GatedItem, request: AiGenerationRequest): CheckTarget {
  const quotes = item.citations.map((citation) => citation.quote).join('\n');
  const citedIds = new Set(item.citations.map((citation) => citation.sourceId));
  return {
    tokens: extractCheckTokens(quotes),
    extraPrNumbers: catchPrNumbers(request.sources.filter((source) => citedIds.has(source.sourceId))),
  };
}

/** 발행본 글. 넘기지 않았으면 넘긴 근거 글 전체를 발행본 글로 본다(C-01, BR3.5). */
export function publicationTokens(request: AiGenerationRequest): CheckTokens {
  const text = request.publicationText ?? request.sources.map((source) => source.text).join('\n');
  return extractCheckTokens(text);
}

/** BR3.4·BR3.5로 항목 하나를 판정한다(JD 역할이 없는 기본 요약·질의응답). */
export function passesFactCheck(item: GatedItem, request: AiGenerationRequest, publication: CheckTokens): boolean {
  const tokens = extractCheckTokens(item.text);
  if (item.citations.length > 0) return passesCitedCheck(tokens, citedTarget(item, request));
  return passesInterpretationCheck(tokens, publication);
}
