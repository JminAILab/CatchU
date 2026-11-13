// 발행 사본 workLimits에 고를 「작업 전체 한계」 문장(새 Catch NC2 기능 설계 BR1.3·BR1.6, 계약 C6).
// worker(worker/app/candidates/build.py)가 근거 한계(catch_evidence.coverage_limits)에 적는 문장 가운데 작업 전체에 걸리는 두 종류만 고른다.
// 문장은 worker 원본을 글자 그대로 베낀 것이다. worker 문장을 바꾸면 이 상수도 함께 고쳐야 하며,
// api 시험 test/publications/work-limit-sentences.test.cjs가 build.py 글자와 대조해 어긋나면 실패한다.
// worker에 새 작업 전체 한계 문장을 더하면 이 목록에도 더해야 면접관 화면에 보인다. 순수 함수만 두고 DB를 읽지 않는다.

/** 커밋 목록을 다 받지 못한 PR 한계. 글자까지 같은 문장만 고른다. 키는 worker 상수 이름이다. */
export const WORK_LIMIT_SENTENCES = Object.freeze({
  _LISTS_INCOMPLETE: '커밋 목록을 다 받지 못한 기본 브랜치 대상 PR이 있어, 그 PR에도 담긴 커밋일 수 있다',
  _EARLIER_LIST_INCOMPLETE: '먼저 병합된 PR 가운데 커밋 목록을 다 받지 못한 PR이 있어, 그 PR에도 담긴 변경일 수 있다',
});

/**
 * 같은 작업 경고의 앞부분. 뒤에 PR 번호·커밋 식별값이 붙으므로 이 글자로 시작하는 문장을 고른다.
 * 키는 worker `_limitation`의 NoteKind 이름이다(원본은 f-string 시작).
 */
export const WORK_LIMIT_PREFIXES = Object.freeze({
  RESUBMISSION_UNCONFIRMED: '같은 작업을 다시 낸 것일 수 있다(',
  CHERRY_PICK_UNCONFIRMED: 'cherry-pick으로 옮긴 같은 변경일 수 있다(',
});

const SENTENCES: readonly string[] = Object.values(WORK_LIMIT_SENTENCES);
const PREFIXES: readonly string[] = Object.values(WORK_LIMIT_PREFIXES);

/** 문장 하나가 작업 전체 한계인지. 근거별 조회 상태·본인 커밋 20건 한계 같은 다른 문장은 거짓이다. */
export function isWorkLimit(sentence: string): boolean {
  return SENTENCES.includes(sentence) || PREFIXES.some((prefix) => sentence.startsWith(prefix));
}

/**
 * 근거 한계 목록들(근거 position 순서, 근거마다 적힌 순서)에서 작업 전체 한계만 처음 나온 순서로 고른다. 글자까지 같은 문장은 한 번만 둔다.
 * 개수 상한은 없다(기능 설계 Q2 A). 고른 것이 없으면 빈 배열이다(사본에는 칸을 넣지 않는다).
 */
export function pickWorkLimits(coverageLimits: readonly (readonly string[])[]): string[] {
  const picked = new Set<string>();
  for (const limits of coverageLimits) {
    for (const sentence of limits) if (isWorkLimit(sentence)) picked.add(sentence);
  }
  return [...picked];
}
