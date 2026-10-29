// JD 요약 항목의 역할·대조·"찾지 못함" 서버 안내(U2 기능 설계 BR4.1~BR4.8, 계약 C-01 수정 PR #421의 jdRole·SERVER_NOTICE).
// 전제: 한 호출은 JD 요구사항 한 줄(userText 한 줄)이다(FR6.1). 그래서 "같은 응답"은 "같은 요구사항"이다.
import type { AiGenerationRequest, GatedItem, JdRole } from './ai-generation.types';
import {
  catchPrNumbers, type CheckTokens, citedTarget, englishTermsInOrder, extractCheckTokens, passesCitedCheck,
  passesInterpretationCheck, publicationTokens,
} from './fact-check';

/** JD 머리줄 셋(BR4.1). 이 순서로 쓰게 하고, 앞뒤 공백을 뗀 줄이 이 글과 같을 때만 머리줄로 본다(BR4.2). */
export const JD_HEADINGS: ReadonlyMap<string, JdRole> = new Map([
  ['근거:', 'EVIDENCE'],
  ['자료로 확인되지 않는 점:', 'UNCONFIRMED'],
  ['면접 질문:', 'INTERVIEW_QUESTION'],
]);

/** JD_SUMMARY의 형식 지시(BR4.1). U1 형식 지시 대신 쓴다. BASE_SUMMARY·QNA는 U1 형식 지시 그대로다. */
export const JD_FORMAT_INSTRUCTION = [
  '아래 머리줄 셋을 이 순서로 한 줄씩 쓰고, 각 머리줄 아래에 그 칸의 항목을 쓴다.',
  ...JD_HEADINGS.keys(),
  "항목은 한 줄에 하나만 쓰고 줄 맨 앞은 '- '로 시작한다. 항목마다 사실 하나만 쓴다.",
  '근거 칸의 항목은 문서를 인용한다.',
  "면접 질문은 물음표('?')로 끝나는 의문문으로 쓰고, 자료로 확인되지 않은 일을 이미 한 것처럼 전제하지 않는다.",
  '그 밖의 머리말과 맺음말은 쓰지 않는다.',
].join('\n');

/** 한 줄에 붙이는 "찾지 못함" 안내의 최대 수(BR4.7). */
export const SERVER_NOTICE_LIMIT_PER_LINE = 3;

const QUESTION_END = /[?？]$/;

export type JdDropReason = 'outside_heading' | 'role' | 'fact';

/** BR4.2·BR4.3: 역할이 없거나(머리줄 밖) 역할과 모양이 맞지 않으면 버릴 이유, 맞으면 null. */
export function roleShapeProblem(item: GatedItem): JdDropReason | null {
  const role = item.jdRole ?? null;
  if (role === null) return 'outside_heading';
  const text = item.text.trim();
  if (role === 'EVIDENCE' && item.citations.length === 0) return 'role';
  if (role === 'INTERVIEW_QUESTION' && !QUESTION_END.test(text)) return 'role';
  if (role === 'UNCONFIRMED' && QUESTION_END.test(text)) return 'role';
  return null;
}

/** BR4.4·BR4.6: 근거는 인용 항목 대조, 확인되지 않는 점은 인용이 있으면 인용 대조·없으면 AI 해석 대조(JD 줄 허용 없음). */
function passesEvidenceOrUnconfirmed(item: GatedItem, request: AiGenerationRequest, publication: CheckTokens): boolean {
  const tokens = extractCheckTokens(item.text);
  if (item.citations.length > 0) return passesCitedCheck(tokens, citedTarget(item, request));
  return passesInterpretationCheck(tokens, publication);
}

/**
 * BR4.5: 면접 질문의 숫자·파일 이름은 남은 근거 항목의 인용 원문에서, PR 번호는 그 원문과 그 근거의 Catch PR 번호에서,
 * 영어 표기는 그 원문과 userText(JD 요구사항 줄)에서 찾는다. 면접 질문 자신의 인용은 허용 범위를 넓히지 않는다.
 */
function passesInterviewQuestion(item: GatedItem, evidence: GatedItem[], request: AiGenerationRequest): boolean {
  const quotes = extractCheckTokens(evidence.flatMap((entry) => entry.citations.map((citation) => citation.quote)).join('\n'));
  const citedIds = new Set(evidence.flatMap((entry) => entry.citations.map((citation) => citation.sourceId)));
  const catchPrs = catchPrNumbers(request.sources.filter((source) => citedIds.has(source.sourceId)));
  const jdLine = extractCheckTokens(request.userText ?? '');
  const tokens = extractCheckTokens(item.text);
  return [...tokens.numbers].every((value) => quotes.numbers.has(value))
    && [...tokens.fileNames].every((value) => quotes.fileNames.has(value))
    && [...tokens.prNumbers].every((value) => quotes.prNumbers.has(value) || catchPrs.has(value))
    && [...tokens.englishTerms].every((value) => quotes.englishTerms.has(value) || jdLine.englishTerms.has(value));
}

export interface JdCheckResult {
  items: GatedItem[];
  dropped: Record<JdDropReason, number>;
}

/** JD 항목 판정. 근거·확인되지 않는 점을 먼저 대조한 뒤, 남은 근거로 면접 질문을 대조한다(BR4.5). 순서는 응답 순서 그대로. */
export function checkJdItems(items: readonly GatedItem[], request: AiGenerationRequest): JdCheckResult {
  const dropped: Record<JdDropReason, number> = { outside_heading: 0, role: 0, fact: 0 };
  const publication = publicationTokens(request);
  const verdicts = items.map((item): JdDropReason | null => {
    const problem = roleShapeProblem(item);
    if (problem !== null || item.jdRole === 'INTERVIEW_QUESTION') return problem;
    return passesEvidenceOrUnconfirmed(item, request, publication) ? null : 'fact';
  });
  const evidence = items.filter((item, index) => item.jdRole === 'EVIDENCE' && verdicts[index] === null);
  items.forEach((item, index) => {
    if (item.jdRole === 'INTERVIEW_QUESTION' && verdicts[index] === null && !passesInterviewQuestion(item, evidence, request)) {
      verdicts[index] = 'fact';
    }
  });
  const kept: GatedItem[] = [];
  items.forEach((item, index) => {
    const verdict = verdicts[index];
    if (verdict === null) kept.push(item);
    else dropped[verdict] += 1;
  });
  return { items: kept, dropped };
}

/**
 * BR4.7: JD 요구사항 줄의 영어 표기 중 대문자가 든 것(예외 약어 제외)이 이번 호출의 sources 글 전체에 없으면 "찾지 못함" 안내를 만든다.
 * 줄에 한글이 없으면(영어 문장) 첫 낱말은 뺀다. 같은 표기는 한 번만, 나온 순서대로 최대 3개. 대조·버림 수 대상이 아니다.
 */
export function serverNotices(request: AiGenerationRequest): GatedItem[] {
  const line = request.userText ?? '';
  const { first, terms } = englishTermsInOrder(line);
  const candidates = /[가-힣]/.test(line) ? terms : terms.filter((term, index) => !(index === 0 && term === first));
  const seen = new Set<string>();
  const chosen: string[] = [];
  for (const term of candidates) {
    const key = term.toLowerCase();
    if (!/[A-Z]/.test(term) || seen.has(key)) continue;
    seen.add(key);
    chosen.push(term);
    if (chosen.length === SERVER_NOTICE_LIMIT_PER_LINE) break;
  }
  const found = extractCheckTokens(request.sources.map((source) => source.text).join('\n')).englishTerms;
  return chosen.filter((term) => !found.has(term.toLowerCase())).map((term): GatedItem =>
    ({ kind: 'SERVER_NOTICE', text: `이번에 찾은 자료에서 '${term}' 표기를 찾지 못함`, citations: [], jdRole: 'UNCONFIRMED' }));
}
