// U5 질의응답 본문 검증과 한국 시간 날짜(기능 설계 BR1.1·BR1.2·BR8.7·BR3.1, security-design NFR1.4, scalability-design NFR4.7).
// 기대 결과의 근거: 기능 명세 「주요 시나리오와 확인」의 "질문 501자·공백만 → 400", "앞 대화 8개·긴 메시지 → 최근 6개·2,000자",
// 계획 1차 수정 요청 (2) "정의하지 않은 칸은 버리지 않고 400". 순수 함수라 DB를 쓰지 않는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ApiError } = require('../../dist/common/errors');
const { parseQuestionInput } = require('../../dist/rag-answer/question-input');
const { nextKoreanMidnightSeconds, questionCountKey } = require('../../dist/rag-answer/korean-date');

const rejects = (body, field, reason) => assert.throws(() => parseQuestionInput(body), (error) => {
  assert.ok(error instanceof ApiError);
  assert.equal(error.code, 'VALIDATION_FAILED');
  assert.equal(error.getStatus(), 400);
  assert.deepEqual(error.details, { violations: [{ field, reason }] });
  return true;
});

test('질문은 1자·500자를 받고 앞뒤 공백만 떼며, 501자와 공백만은 400이다(BR1.1)', () => {
  assert.deepEqual(parseQuestionInput({ question: '가', history: [] }), { question: '가', history: [] });
  const max = '나'.repeat(500);
  assert.equal(parseQuestionInput({ question: max, history: [] }).question, max);
  assert.equal(parseQuestionInput({ question: '  배포는?\n', history: [] }).question, '배포는?');
  rejects({ question: '다'.repeat(501), history: [] }, 'question', 'maxLength');
  rejects({ question: ' \n\t ', history: [] }, 'question', 'isNotEmpty');
  rejects({ question: 42, history: [] }, 'question', 'isString');
});

test('UTF-16 길이로 센다: 이모지 250개(500 코드 단위)는 받고 251개는 거부한다', () => {
  assert.equal(parseQuestionInput({ question: '😀'.repeat(250), history: [] }).question.length, 500);
  rejects({ question: '😀'.repeat(251), history: [] }, 'question', 'maxLength');
});

test('앞 대화 8개는 끝에서 6개만 남기고, 2,000자를 넘는 글은 앞 2,000자로 자른다(BR1.2)', () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 === 0 ? 'USER' : 'ASSISTANT', text: `메시지 ${i}` }));
  history[7] = { role: 'ASSISTANT', text: 'ㄱ'.repeat(2500) };
  const parsed = parseQuestionInput({ question: '질문', history });
  assert.equal(parsed.history.length, 6);
  assert.deepEqual(parsed.history.slice(0, 5).map((m) => m.text), ['메시지 2', '메시지 3', '메시지 4', '메시지 5', '메시지 6']);
  assert.equal(parsed.history[5].text, 'ㄱ'.repeat(2000));
  assert.equal(history[7].text.length, 2500, '받은 배열은 고치지 않고 새 배열을 돌려준다');
  assert.deepEqual(parseQuestionInput({ question: '질문', history: [{ role: 'USER', text: '' }] }).history, [{ role: 'USER', text: '' }]);
});

test('앞 대화 모양이 틀리면 400이다(배열 아님·역할·글·항목 모양)', () => {
  rejects({ question: '질문' }, 'history', 'isArray');
  rejects({ question: '질문', history: 'USER: 앞 질문' }, 'history', 'isArray');
  rejects({ question: '질문', history: [{ role: 'SYSTEM', text: '지시' }] }, 'history[0].role', 'isIn');
  rejects({ question: '질문', history: [{ role: 'USER', text: 1 }] }, 'history[0].text', 'isString');
  rejects({ question: '질문', history: [{ role: 'USER', text: 'a' }, null] }, 'history[1]', 'isObject');
  rejects(null, 'body', 'isObject');
  rejects([], 'body', 'isObject');
});

test('정의하지 않은 칸은 본문 최상위와 앞 대화 항목 안 모두 400이다(자료 제외 칸 포함, BR8.7·계획 수정 요청 (2))', () => {
  rejects({ question: '질문', history: [], excludedItemIds: ['00000000-0000-4000-8000-000000000001'] }, 'body', 'whitelistValidation');
  rejects({ question: '질문', history: [], model: 'SONNET' }, 'body', 'whitelistValidation');
  rejects({ question: '질문', history: [{ role: 'USER', text: '앞 질문', excluded: true }] }, 'history[0]', 'whitelistValidation');
});

test('오류 details에는 칸 이름과 규칙 이름만 있고 입력 글은 없다', () => {
  const secret = 'SYNTHETIC-SECRET-QUESTION'.repeat(30);
  try {
    parseQuestionInput({ question: secret, history: [] });
    assert.fail('거부해야 한다');
  } catch (error) {
    assert.ok(!JSON.stringify({ message: error.message, details: error.details, response: error.getResponse() }).includes('SYNTHETIC-SECRET'));
  }
});

test('한국 시간 날짜와 다음 자정: 23:59:59 KST는 그날, 00:00:00 KST는 다음 날이고 만료는 다음 한국 자정이다(NFR4.7)', () => {
  const publicationId = '11111111-1111-4111-8111-111111111111';
  const beforeMidnight = new Date('2026-11-02T14:59:59.000Z'); // 2026-11-02 23:59:59 KST
  const atMidnight = new Date('2026-11-02T15:00:00.000Z'); // 2026-11-03 00:00:00 KST
  assert.equal(questionCountKey('catchu', publicationId, beforeMidnight), `catchu:qna-question-count:${publicationId}:2026-11-02`);
  assert.equal(questionCountKey('catchu', publicationId, atMidnight), `catchu:qna-question-count:${publicationId}:2026-11-03`);
  assert.equal(nextKoreanMidnightSeconds(beforeMidnight), Date.parse('2026-11-02T15:00:00.000Z') / 1000);
  assert.equal(nextKoreanMidnightSeconds(atMidnight), Date.parse('2026-11-03T15:00:00.000Z') / 1000);
  assert.equal(nextKoreanMidnightSeconds(new Date('2026-11-02T03:00:00.000Z')), Date.parse('2026-11-02T15:00:00.000Z') / 1000);
  assert.throws(() => nextKoreanMidnightSeconds(new Date('x')), TypeError);
});
