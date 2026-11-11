// RAG 평가 결과 쓰기(U5 기능 설계 BR10.5·BR10.7, 비기능 설계 NFR3.3, 계획 1차 수정 요청 (4)).
// 원문(질문·정답 글귀·답 항목·인용 원문·JD 결과)은 로컬 결과 파일(api/.rag-eval/, .gitignore)에만 쓴다.
// 저장소에 남기는 기록은 건수·위치·빈 사람 판정 칸만 담고, measure 모드에서만 api/docs/rag-evaluation/에 쓴다.
// synthetic 모드는 그 기록도 로컬 폴더에만 쓴다(저장소에 남는 파일을 만들지 않음).
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const MODE_LABEL = { synthetic: 'SYNTHETIC_CHECK', measure: 'MEASUREMENT' };

const percent = (value) => (value === null ? '해당 없음' : `${(value * 100).toFixed(1)}%`);
const locationText = (location) => `${location.publishedItemId} ${location.fieldPath} [${location.charStart}, ${location.charEnd})`;

/**
 * 저장소 기록(Markdown) 본문. 받은 결과에서 건수·비율·위치만 꺼내 쓰고 글 칸은 읽지 않는다.
 * summary: { date, targetVersion, mode, questionCount, hitRateAt5, hitRateAt8, hitRateAt12, passedItems, droppedItems,
 *   evidencePassRate, missedHitLocations: [{ questionNo, locations }], jd: { splitter, rows: [{ requirementNo, searchBased, fullInput }] } | null }
 */
function buildRepositoryRecord(summary) {
  const lines = [
    `# RAG 품질 평가 기록 — ${summary.date}`,
    '',
    `- 모드: ${MODE_LABEL[summary.mode]}${summary.mode === 'synthetic' ? ' (NFR3 측정이 아니다. 합성 자료로 끝까지 도는지만 확인)' : ''}`,
    `- 대상 버전: ${summary.targetVersion}`,
    `- 질문 수: ${summary.questionCount}`,
    '',
    '## 검색 적중률',
    '',
    '| 앞 5개 | 앞 8개 | 앞 12개 |',
    '|---|---|---|',
    `| ${percent(summary.hitRateAt5)} | ${percent(summary.hitRateAt8)} | ${percent(summary.hitRateAt12)} |`,
    '',
    '## 근거 통과',
    '',
    `- 통과 항목: ${summary.passedItems}`,
    `- 버린 항목: ${summary.droppedItems}("맞는데 버려진 항목"의 상한값)`,
    `- 근거 통과율: ${percent(summary.evidencePassRate)}`,
    '',
    '## 8개 기준 비적중 질문의 조각 위치',
    '',
  ];
  if (summary.missedHitLocations.length === 0) lines.push('- 없음');
  for (const missed of summary.missedHitLocations) {
    lines.push(`- ${missed.questionNo}번 질문`);
    for (const location of missed.locations) lines.push(`  - ${locationText(location)}`);
  }
  lines.push('', '## JD 두 방식 비교', '');
  if (summary.jd === null) {
    lines.push('- JD 없음');
  } else {
    lines.push(`- 요구사항 나누기: ${summary.jd.splitter === 'U10' ? 'U10' : '스크립트'} / 지시문: U10 운영 상수`, '',
      '| 요구사항 | 검색 기반 항목 | 검색 기반 버림 | 전체 넣기 항목 | 전체 넣기 버림 |', '|---|---|---|---|---|');
    for (const row of summary.jd.rows) {
      const full = row.fullInput === 'INPUT_TOO_LARGE' ? ['INPUT_TOO_LARGE', '-'] : [row.fullInput.items, row.fullInput.dropped];
      lines.push(`| ${row.requirementNo} | ${row.searchBased.items} | ${row.searchBased.dropped} | ${full[0]} | ${full[1]} |`);
    }
  }
  lines.push('', '## 사람 판정(직접 채운다, BR10.6)', '',
    '- 남의 기여 오귀속 건수: ',
    '- 근거 비뒷받침 건수: ',
    '- 다른 곳의 맞는 근거 n건(비적중 질문별): ',
    '- 통과 여부(오귀속 0건이고 비뒷받침 1건 이하): ',
    '- 조정 내용(지시문 한 번 수정 또는 질의응답 모델만 SONNET 전환)과 재측정 여부: ',
    '');
  return lines.join('\n');
}

function writeFile(dir, name, text) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, text, 'utf8');
  return path;
}

/**
 * 결과를 쓴다. 로컬 원문 결과 `{date}-{mode}.json`은 늘 outDir에, 기록은 synthetic이면 outDir, measure면 docsDir에 쓴다.
 * 쓴 경로를 돌려준다.
 */
function writeEvaluation({ mode, outDir, docsDir, summary, raw }) {
  const stamp = `${summary.date}-${mode}`;
  const rawPath = writeFile(outDir, `${stamp}.json`, `${JSON.stringify({ mode: MODE_LABEL[mode], ...raw }, null, 2)}\n`);
  const recordDir = mode === 'measure' ? docsDir : outDir;
  const recordName = mode === 'measure' ? `${summary.date}.md` : `${stamp}-record.md`;
  const recordPath = writeFile(recordDir, recordName, buildRepositoryRecord(summary));
  return { rawPath, recordPath };
}

module.exports = { MODE_LABEL, buildRepositoryRecord, writeEvaluation };
