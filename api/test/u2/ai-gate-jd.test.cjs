// U2 JD 요약 역할·대조·"찾지 못함" 안내(기능 설계 BR4.1~BR4.8, 시나리오 S12·S12b·S12c·S13~S16·S16b~S16d).
// 모양은 계약 C-01 수정 PR #421(GatedItem.jdRole, kind SERVER_NOTICE)과 기능 명세 「계약 변경 제안」을 따른다.
// 리뷰에서 모양이 바뀌면 이 파일과 jd-checks.ts만 고친다. 기록한 응답 JSON을 시험용 fetch로 넘긴다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCheckedAiGenerationGate } = require('../../dist/ai-generation/checked-gate');
const { ITEM_FORMAT_INSTRUCTION } = require('../../dist/ai-generation/citation-request');
const { COMMON_GUARD_INSTRUCTION } = require('../../dist/ai-generation/gate-policy');
const { JD_FORMAT_INSTRUCTION, JD_HEADINGS, serverNotices } = require('../../dist/ai-generation/jd-checks');
const { FAKE_KEY, source, request, blockCitation, fragment, messageBody, jsonResponse, recordingFetch, captureLogs } = require('./gate-fixtures.cjs');

const EVIDENCE_TEXT = 'Docker 이미지 빌드를 3단계로 줄였다\n로그인 시험 12개를 추가했다';
const jd = (overrides = {}) => request({ feature: 'JD_SUMMARY', instruction: 'JD 요구사항 한 줄과 자료를 견준다.',
  userText: 'Docker 이미지 관리 경험', sources: [source({ text: EVIDENCE_TEXT })], ...overrides });

function gateWith(body) {
  const recorder = recordingFetch([jsonResponse(body)]);
  return { gate: createCheckedAiGenerationGate({ apiKey: FAKE_KEY, fetch: recorder.fetch }), requests: recorder.requests };
}
const view = (items) => items.map((item) => [item.jdRole, item.kind, item.text]);
const resultLog = (logs) => logs.find((log) => log.args[0]?.event === 'ai_gate_result').args[0];

test('JD_SUMMARY만 형식 지시를 JD용(머리줄 셋, 면접 질문은 의문문)으로 바꾸고, 기본 요약은 U1 형식 지시 그대로다', async (t) => {
  captureLogs(t);
  assert.deepEqual([...JD_HEADINGS.keys()], ['근거:', '자료로 확인되지 않는 점:', '면접 질문:']);
  for (const heading of JD_HEADINGS.keys()) assert.ok(JD_FORMAT_INSTRUCTION.includes(heading));
  assert.ok(JD_FORMAT_INSTRUCTION.includes('물음표'));
  const jdCall = gateWith(messageBody([fragment('근거:\n- Docker 이미지 빌드를 3단계로 줄였다', [blockCitation(0, 0, 1)])]));
  await jdCall.gate.generate(jd());
  assert.equal(jdCall.requests[0].body.system, `${JD_FORMAT_INSTRUCTION}\n\nJD 요구사항 한 줄과 자료를 견준다.\n\n${COMMON_GUARD_INSTRUCTION}`);
  const baseCall = gateWith(messageBody([fragment('- 요약')]));
  await baseCall.gate.generate(request({ instruction: '요약' }));
  assert.ok(baseCall.requests[0].body.system.startsWith(`${ITEM_FORMAT_INSTRUCTION}\n\n요약`));
});

test('S12b 머리줄 셋 아래 정상 항목에는 그 칸의 역할이 붙고, 머리줄 줄은 항목도 버림도 아니다', async (t) => {
  const logs = captureLogs(t);
  const { gate } = gateWith(messageBody([
    fragment('근거:\n- '), fragment('Docker 이미지 빌드를 3단계로 줄였다', [blockCitation(0, 0, 1)]),
    fragment('\n  자료로 확인되지 않는 점:  \n- 운영 환경에서 쓴 기록은 자료에 없다\n면접 질문:\n- Docker 빌드 단계를 줄인 방법은 무엇인가요？\n'),
  ]));
  const output = await gate.generate(jd());
  assert.deepEqual(view(output.items), [
    ['EVIDENCE', 'CITED', 'Docker 이미지 빌드를 3단계로 줄였다'],
    ['UNCONFIRMED', 'AI_INTERPRETATION', '운영 환경에서 쓴 기록은 자료에 없다'],
    ['INTERVIEW_QUESTION', 'AI_INTERPRETATION', 'Docker 빌드 단계를 줄인 방법은 무엇인가요？'],
  ]);
  assert.equal(output.droppedCount, 0);
  const fields = resultLog(logs);
  assert.equal(fields.nonItemLineCount, 0, '머리줄은 항목 아닌 줄로도 세지 않는다');
});

test('S12 머리줄 전 항목·물음표 없는 면접 질문·물음표로 끝난 확인되지 않는 점·인용 없는 근거는 모두 버리고 droppedCount에 4를 더한다', async (t) => {
  const logs = captureLogs(t);
  const { gate } = gateWith(messageBody([
    fragment('- 머리줄 전 항목\n근거:\n- 인용 없는 근거\n- '), fragment('로그인 시험 12개를 추가했다', [blockCitation(0, 1, 2)]),
    fragment('\n자료로 확인되지 않는 점:\n- 운영 경험이 있었나?\n면접 질문:\n- 로그인 시험을 설명해 주세요.\n'),
  ]));
  const output = await gate.generate(jd());
  assert.deepEqual(view(output.items), [['EVIDENCE', 'CITED', '로그인 시험 12개를 추가했다']]);
  assert.equal(output.droppedCount, 4);
  assert.deepEqual(resultLog(logs).dropReasons, { truncated: 0, location: 0, fact: 0, role: 3, outside_heading: 1 });
});

test('S12c 기본 요약·질의응답은 머리줄을 쓰지 않고 역할 칸이 null이며 U1 동작 그대로다(머리줄 같은 줄도 항목 아닌 줄)', async (t) => {
  const logs = captureLogs(t);
  for (const feature of ['BASE_SUMMARY', 'QNA']) {
    const { gate } = gateWith(messageBody([fragment('근거:\n- '), fragment('로그인 시험 12개를 추가했다', [blockCitation(0, 1, 2)]), fragment('\n- 꾸준히 협업했다')]));
    const output = await gate.generate(request({ feature, sources: [source({ text: EVIDENCE_TEXT })] }));
    assert.deepEqual(view(output.items), [[null, 'CITED', '로그인 시험 12개를 추가했다'], [null, 'AI_INTERPRETATION', '꾸준히 협업했다']]);
    assert.ok(output.items.every((item) => item.kind !== 'SERVER_NOTICE'));
  }
  assert.ok(logs.filter((log) => log.args[0]?.event === 'ai_gate_result').every((log) => log.args[0].nonItemLineCount === 1));
});

test('S13 면접 질문의 숫자가 남은 근거 항목의 인용 원문에 없으면 버린다. 질문 자신의 인용은 허용 범위를 넓히지 않는다', async (t) => {
  captureLogs(t);
  const { gate } = gateWith(messageBody([
    fragment('근거:\n- '), fragment('Docker 이미지 빌드를 3단계로 줄였다', [blockCitation(0, 0, 1)]),
    fragment('\n면접 질문:\n- 빌드를 3단계로 줄인 이유는 무엇인가요?\n- '),
    fragment('시험 12개는 어떻게 골랐나요?', [blockCitation(0, 1, 2)]),
  ]));
  const output = await gate.generate(jd());
  assert.deepEqual(output.items.map((item) => item.text), ['Docker 이미지 빌드를 3단계로 줄였다', '빌드를 3단계로 줄인 이유는 무엇인가요?']);
  assert.equal(output.droppedCount, 1);
});

test('S14 면접 질문은 JD 줄에만 있는 영어 표기를 써도 남는다', async (t) => {
  captureLogs(t);
  const { gate } = gateWith(messageBody([
    fragment('근거:\n- '), fragment('Docker 이미지 빌드를 3단계로 줄였다', [blockCitation(0, 0, 1)]),
    fragment('\n면접 질문:\n- Kubernetes 환경에서도 Docker 빌드를 줄일 수 있을까요?\n- Terraform은 써 봤나요?'),
  ]));
  const output = await gate.generate(jd({ userText: 'Kubernetes·Docker 운영 경험' }));
  const questions = output.items.filter((item) => item.jdRole === 'INTERVIEW_QUESTION').map((item) => item.text);
  assert.deepEqual(questions, ['Kubernetes 환경에서도 Docker 빌드를 줄일 수 있을까요?'], 'JD 줄에도 근거에도 없는 Terraform은 버린다');
});

test('S15 인용 없는 확인되지 않는 점이 JD 줄의 숫자를 되풀이하면 버린다(한계), JD 줄의 영어 표기도 허용 근거가 아니다', async (t) => {
  captureLogs(t);
  const { gate } = gateWith(messageBody([
    fragment('근거:\n- '), fragment('Docker 이미지 빌드를 3단계로 줄였다', [blockCitation(0, 0, 1)]),
    fragment('\n자료로 확인되지 않는 점:\n- 3년 이상의 경험은 자료로 확인되지 않는다\n- Kubernetes 운영 기록은 자료에 없다\n- 운영 환경 기록은 자료에 없다'),
  ]));
  const output = await gate.generate(jd({ userText: 'Kubernetes 운영 경험 3년 이상' }));
  const unconfirmed = output.items.filter((item) => item.jdRole === 'UNCONFIRMED' && item.kind !== 'SERVER_NOTICE').map((item) => item.text);
  assert.deepEqual(unconfirmed, ['운영 환경 기록은 자료에 없다']);
});

test('S16 JD 줄의 기술 이름이 이번 근거 글에 없으면 "찾지 못함" 서버 안내가 끝에 붙고 droppedCount는 그대로다', async (t) => {
  captureLogs(t);
  const { gate } = gateWith(messageBody([fragment('근거:\n- '), fragment('Docker 이미지 빌드를 3단계로 줄였다', [blockCitation(0, 0, 1)])]));
  const output = await gate.generate(jd({ userText: 'Kubernetes 운영 경험' }));
  assert.deepEqual(output.items.at(-1), { kind: 'SERVER_NOTICE', text: "이번에 찾은 자료에서 'Kubernetes' 표기를 찾지 못함", citations: [], jdRole: 'UNCONFIRMED' });
  assert.equal(output.items.length, 2);
  assert.equal(output.droppedCount, 0);
  assert.ok(!output.items.at(-1).text.includes('경험 없'), '"경험 없음"으로 쓰지 않는다');
});

test('S16b·S16c·S16d 영어 문장의 첫 낱말·소문자 낱말은 빼고, 한 줄에 앞 3개까지, 대조 대상은 발행본 글이 아니라 이번 근거 글이다', () => {
  const notices = (userText, overrides = {}) => serverNotices(jd({ userText, sources: [source({ text: '로그인 시험을 추가했다' })], ...overrides }))
    .map((item) => item.text.match(/'(.+)'/)[1]);
  assert.deepEqual(notices('Experience with Docker and Kubernetes in production'), ['Docker', 'Kubernetes']);
  assert.deepEqual(notices('Go, Rust, Kafka, Redis, Terraform 경험'), ['Go', 'Rust', 'Kafka']);
  assert.deepEqual(notices('Kubernetes 운영 경험', { publicationText: 'Kubernetes 클러스터를 운영했다' }), ['Kubernetes']);
  // 앞 3개 후보 중 근거 글에 있는 것은 안내하지 않고, 넷째 후보를 끌어오지 않는다.
  assert.deepEqual(serverNotices(jd({ userText: 'Docker, Go, Rust, Kafka 경험' })).map((item) => item.text),
    ["이번에 찾은 자료에서 'Go' 표기를 찾지 못함", "이번에 찾은 자료에서 'Rust' 표기를 찾지 못함"]);
  assert.deepEqual(notices('API·JSON·SQL 경험'), ['SQL'], '예외 약어는 후보가 아니다');
  assert.deepEqual(notices('docker kubernetes 경험'), [], '소문자 표기는 안내하지 않는다(한계)');
  assert.deepEqual(serverNotices(jd({ userText: null })), []);
});
