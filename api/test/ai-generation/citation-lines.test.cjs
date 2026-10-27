// S1: 근거 글을 줄로 나누고 줄마다 UTF-16 위치를 기록한다(U1 기능 설계 BR1.1~BR1.3).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { splitCitationLines } = require('../../dist/ai-generation/citation-lines');

/** 줄 위치로 원문을 잘라 낸 글이 줄 글자와 같은지 본다(한 글자라도 어긋나면 실패). */
function assertPositionsMatch(text, lines) {
  for (const line of lines) assert.equal(text.slice(line.lineStart, line.lineEnd), line.text);
}

test('S1 \\r\\n·빈 줄·공백만 있는 줄: 빈 줄은 블록이 없고 남은 줄의 위치는 원문 기준', () => {
  const text = '첫 줄\r\n\r\n   \t\r\n셋째 줄\n\n마지막';
  const lines = splitCitationLines(text);
  assert.deepEqual(lines, [
    { blockIndex: 0, lineStart: 0, lineEnd: 3, text: '첫 줄' },
    { blockIndex: 1, lineStart: 13, lineEnd: 17, text: '셋째 줄' },
    { blockIndex: 2, lineStart: 19, lineEnd: 22, text: '마지막' },
  ]);
  assertPositionsMatch(text, lines);
});

test('S1 기능 설계의 위치 계산 예와 같다', () => {
  const lines = splitCitationLines('첫 줄\r\n\r\n셋째 줄');
  assert.deepEqual(lines.map(({ blockIndex, lineStart, lineEnd }) => [blockIndex, lineStart, lineEnd]), [[0, 0, 3], [1, 7, 11]]);
});

test('S1 한글·이모지(서로게이트 쌍)가 섞여도 UTF-16 코드 단위로 센다', () => {
  const text = '🎉 배포 완료\n👩‍💻 리뷰 반영 😀\r\n끝';
  const lines = splitCitationLines(text);
  assert.deepEqual(lines.map((line) => line.text), ['🎉 배포 완료', '👩‍💻 리뷰 반영 😀', '끝']);
  assert.equal(lines[1].lineStart, '🎉 배포 완료\n'.length);
  assert.equal(lines[1].lineEnd, lines[1].lineStart + '👩‍💻 리뷰 반영 😀'.length);
  assertPositionsMatch(text, lines);
});

test('S1 줄바꿈 없는 한 줄은 블록 하나이고 앞뒤 공백을 정리하지 않는다', () => {
  assert.deepEqual(splitCitationLines('  앞 공백 그대로  '), [{ blockIndex: 0, lineStart: 0, lineEnd: 12, text: '  앞 공백 그대로  ' }]);
});

test('S1 끝 줄바꿈은 빈 줄을 만들지 않는다', () => {
  const text = '하나\r\n둘\n';
  const lines = splitCitationLines(text);
  assert.deepEqual(lines.map((line) => line.text), ['하나', '둘']);
  assertPositionsMatch(text, lines);
});

test('S1 빈 글과 공백·줄바꿈뿐인 글은 블록이 없다', () => {
  assert.deepEqual(splitCitationLines(''), []);
  assert.deepEqual(splitCitationLines(' \r\n\n\t　\n'), []);
});

test('줄 중간의 \\r은 줄바꿈 바로 앞이 아니므로 그대로 둔다', () => {
  const lines = splitCitationLines('가\r나\n다');
  assert.deepEqual(lines.map((line) => line.text), ['가\r나', '다']);
});
