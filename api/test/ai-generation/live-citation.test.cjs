// S8 실제 호출 시험(U1 기능 설계 「S8 실제 호출」, 비기능 NFR6.1). CATCHU_GENERATION_API_KEY가 셸 환경변수로 있을 때만 돈다.
// 근거 글은 공개해도 되는 합성 글이다. 결과 기록에는 근거 글·인용문·키를 넣지 않는다.
// 실행: api/에서 `npm test -- test/ai-generation/live-citation.test.cjs`. 키는 명령줄·파일·로그에 적지 않는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAiGenerationGate } = require('../../dist/ai-generation/ai-generation.gate');
const { buildCitationRequest } = require('../../dist/ai-generation/citation-request');
const { toProviderResponse } = require('../../dist/ai-generation/claude-citation-client');
const { joinResponseLines } = require('../../dist/ai-generation/response-items');

/** 완성 항목이 2개 이상 나오고 마지막 항목이 잘리도록 낮춘 출력 상한. 상한 전에 끝나면 낮추고 시도 번호를 올린다. */
const LIVE_MAX_OUTPUT_TOKENS = 140;
const LIVE_RUN_ATTEMPT = 2;

const GITHUB_RECORD = [
  'PR #41 제목: 로그인 화면의 오류 문구를 정리한다',
  '변경 파일: web/app/login/page.tsx, web/lib/messages.ts',
  '커밋: 빈 비밀번호를 보냈을 때의 안내 문구를 바꿨다',
  '커밋: 네트워크 오류일 때 다시 시도 버튼을 보이게 했다',
  '리뷰 의견: 버튼 문구를 "다시 시도"로 통일하자',
  '리뷰 반영: 버튼 문구를 통일하고 시험을 더했다',
  '시험: web/test/login-messages.test.ts에 경우 4개를 더했다',
  'CI: lint, typecheck, test가 모두 통과했다',
  '병합: 2026-09-14에 dev로 merge commit으로 합쳤다',
  '후속 이슈 #44: 오류 문구를 영어로도 낼지 정한다',
].join('\n');

const AUTHOR_MATERIAL = [
  '회고 메모',
  '',
  '로그인 오류 문구가 화면마다 달라 사용자가 헷갈렸다.',
  '문구 목록을 한 파일로 모아 화면이 같은 문구를 쓰게 했다.',
  '리뷰어와 버튼 문구를 맞추느라 하루가 더 걸렸다.',
  '시험을 먼저 정하고 나서 고치니 빠진 경우를 찾기 쉬웠다.',
  '다음에는 문구 변경을 디자인 담당과 먼저 맞추겠다.',
  '네트워크 오류 처리는 다른 화면에도 같은 방식으로 넣을 계획이다.',
  '이번 작업으로 문구 관련 문의가 줄었다는 의견을 받았다.',
  '남은 일은 영어 문구 여부를 정하는 것이다.',
].join('\r\n');

/** 사본 필드를 흉내 내 근거 글 앞에 다른 글을 두고, location.charStart로 근거 위치를 준다. */
function liveSource(sourceId, sourceKind, text, prefix) {
  return {
    fieldText: prefix + text,
    source: {
      sourceId, sourceKind, text, catchEvidenceUrls: [],
      location: { publishedItemId: '00000000-0000-4000-8000-0000000000aa', fieldPath: `${sourceId}.body`,
        charStart: prefix.length, charEnd: prefix.length + text.length, pdfPage: null },
    },
  };
}

test('S8 실제 Claude 인용 호출: 합격 기준 ①~⑤', async (t) => {
  const apiKey = process.env.CATCHU_GENERATION_API_KEY;
  if (!apiKey) {
    console.log(JSON.stringify({ test: 'S8', status: '미실행', reason: 'CATCHU_GENERATION_API_KEY 없음' }));
    t.skip('미실행: CATCHU_GENERATION_API_KEY가 없어 실제 호출 시험을 건너뜀(통과 아님)');
    return;
  }
  const fixtures = [
    liveSource('live-github', 'GITHUB_RECORD', GITHUB_RECORD, '머리 글 한 줄\n'),
    liveSource('live-material', 'AUTHOR_MATERIAL', AUTHOR_MATERIAL, '앞 문단\r\n\r\n'),
  ];
  const fieldTexts = new Map(fixtures.map(({ source, fieldText }) => [source.sourceId, fieldText]));
  const request = {
    feature: 'BASE_SUMMARY',
    instruction: '두 자료에서 확인되는 사실을 빠짐없이 모두 항목으로 정리한다. 각 항목은 근거 자료를 인용한다.',
    sources: fixtures.map(({ source }) => source),
    userText: null, publicationText: null, model: 'HAIKU',
  };

  // 기본(전역) fetch를 그대로 쓰고, 합격 기준 ③ 대조를 위해 응답 사본만 남긴다. 지키는 fetch는 게이트가 이 fetch를 감싼다.
  const tap = { copy: null };
  const fetch = async (input, init) => {
    const response = await globalThis.fetch(input, init);
    tap.copy = response.clone();
    return response;
  };

  const record = { test: 'S8', status: '실행', maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS, attempt: LIVE_RUN_ATTEMPT, criteria: {} };
  let output = null;
  let thrown = null;
  try {
    output = await createAiGenerationGate({ apiKey, maxOutputTokens: LIVE_MAX_OUTPUT_TOKENS, fetch }).generate(request);
  } catch (error) {
    thrown = error;
  }
  record.criteria['⑤ 예외 없음'] = thrown === null ? '통과' : `실패(${thrown.name}${thrown.reason ? `:${thrown.reason}` : ''})`;
  if (thrown !== null || tap.copy === null) {
    console.log(JSON.stringify(record));
    assert.fail(`⑤ 예외가 났다: ${record.criteria['⑤ 예외 없음']}`);
  }

  const rawBody = await tap.copy.text();
  record.responseBodyBytes = Buffer.byteLength(rawBody);
  const provider = toProviderResponse(JSON.parse(rawBody));
  const documents = buildCitationRequest(request).documents;
  const lines = joinResponseLines(provider);
  record.stopReason = provider.rawStopReason;
  record.itemCount = output.items.length;
  record.droppedCount = output.droppedCount;

  const reachedLimit = provider.stopReason === 'MAX_TOKENS';
  record.criteria['① 중단 이유 출력 상한'] = reachedLimit ? '통과' : '재실행 필요';

  const cited = output.items.filter((item) => item.kind === 'CITED');
  record.criteria['② CITED 1개 이상'] = cited.length > 0 ? '통과' : '실패';

  const mismatches = checkCitations(output, lines, documents, fieldTexts);
  record.citationChecks = mismatches.checked;
  record.criteria['③ 인용 글·원문 위치 대조'] = mismatches.failures === 0 && mismatches.checked > 0 ? '통과' : `실패(${mismatches.failures}건)`;

  const lastLine = lines[lines.length - 1].text;
  const lastIsItem = lastLine.startsWith('- ') && lastLine.slice(2).trim() !== '';
  const lastDropped = lastIsItem && output.droppedCount >= 1 && !output.items.some((item) => item.text === lastLine.slice(2));
  record.criteria['④ 끝나지 않은 마지막 항목 버림'] = !reachedLimit || !lastIsItem ? '재실행 필요' : lastDropped ? '통과' : '실패';

  console.log(JSON.stringify(record));
  assert.equal(record.criteria['② CITED 1개 이상'], '통과');
  assert.equal(record.criteria['③ 인용 글·원문 위치 대조'], '통과');
  assert.notEqual(record.criteria['④ 끝나지 않은 마지막 항목 버림'], '실패');
  if (!reachedLimit || !lastIsItem) {
    t.skip(`재실행 필요: 응답이 항목 중간에서 잘리지 않았다. LIVE_MAX_OUTPUT_TOKENS(${LIVE_MAX_OUTPUT_TOKENS})를 낮추고 LIVE_RUN_ATTEMPT를 올려 다시 돌린다`);
  }
});

/**
 * ③ 모든 CITED 인용에서: Claude가 돌려준 인용 글 = 블록 범위 줄을 이어 붙인 글,
 * 사본 필드를 location으로 잘라 낸 글 = quote. 응답 줄과 결과 항목은 글자로 순서대로 맞춘다.
 */
function checkCitations(output, lines, documents, fieldTexts) {
  let checked = 0;
  let failures = 0;
  let cursor = 0;
  for (const item of output.items) {
    while (cursor < lines.length && lines[cursor].text !== `- ${item.text}`) cursor += 1;
    if (cursor >= lines.length) return { checked, failures: failures + 1 };
    if (item.kind !== 'CITED') { cursor += 1; continue; }
    for (const citation of lines[cursor].citations) {
      const document = documents.find((entry) => entry.documentIndex === citation.documentIndex);
      const joined = document.lines.slice(citation.startBlockIndex, citation.endBlockIndex).map((line) => line.text).join('');
      checked += 1;
      if (citation.citedText !== joined) failures += 1;
    }
    for (const itemCitation of item.citations) {
      const fieldText = fieldTexts.get(itemCitation.sourceId);
      if (fieldText.slice(itemCitation.location.charStart, itemCitation.location.charEnd) !== itemCitation.quote) failures += 1;
    }
    cursor += 1;
  }
  return { checked, failures };
}
