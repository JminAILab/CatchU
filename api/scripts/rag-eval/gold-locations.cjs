// RAG 평가의 정답 위치 찾기와 적중 판정(U5 기능 설계 BR10.2·BR10.3, 비기능 설계 NFR3.2). 순수 함수다.
// 정답 글귀를 발행 사본 필드(C-07 fieldPath 범위, 기본 요약 근거와 같은 필드) 안에서 글자 그대로 찾고, 모든 위치를 정답 위치로 삼는다.
const { buildSummarySources } = require('../../dist/rag-answer/summary-sources');

/** 정답 글귀가 사본 어디에도 없다. 질문 번호(1부터)만 알린다. 글귀 원문은 메시지에 넣지 않는다. */
class GoldQuoteNotFound extends Error {
  constructor(questionNo) {
    super(`${questionNo}번 질문의 정답 글귀가 발행본에 없습니다.`);
    this.name = 'GoldQuoteNotFound';
    this.questionNo = questionNo;
  }
}

/** text 안 quote의 모든 시작 위치(겹치는 것 포함). */
function allIndexes(text, quote) {
  const found = [];
  for (let from = text.indexOf(quote); from !== -1; from = text.indexOf(quote, from + 1)) found.push(from);
  return found;
}

/**
 * 질문마다 정답 위치 목록을 만든다. questions는 [{ question, goldQuotes: string[] }].
 * 어느 글귀가 한 곳도 나오지 않으면 그 질문 번호로 GoldQuoteNotFound(BR10.2).
 */
function findGoldLocations(snapshot, questions) {
  const fields = buildSummarySources(snapshot);
  return questions.map((entry, index) => {
    const questionNo = index + 1;
    if (!Array.isArray(entry.goldQuotes) || entry.goldQuotes.length === 0) throw new GoldQuoteNotFound(questionNo);
    const locations = [];
    for (const quote of entry.goldQuotes) {
      if (typeof quote !== 'string' || quote === '') throw new GoldQuoteNotFound(questionNo);
      const before = locations.length;
      for (const field of fields) {
        for (const start of allIndexes(field.text, quote)) {
          locations.push({ publishedItemId: field.location.publishedItemId, fieldPath: field.location.fieldPath,
            charStart: start, charEnd: start + quote.length });
        }
      }
      if (locations.length === before) throw new GoldQuoteNotFound(questionNo);
    }
    return locations;
  });
}

/** 같은 항목·같은 fieldPath에서 [start, end) 범위가 겹치는가(BR10.3). */
function overlaps(hit, gold) {
  return hit.publishedItemId === gold.publishedItemId && hit.fieldPath === gold.fieldPath
    && hit.charStart < gold.charEnd && gold.charStart < hit.charEnd;
}

/** 검색 결과 앞 k개 가운데 정답 위치와 겹치는 조각이 있는가. */
function isHitAt(hits, goldLocations, k) {
  return hits.slice(0, k).some((hit) => goldLocations.some((gold) => overlaps(hit, gold)));
}

/** 적중률 = 적중 질문 수 / 질문 수(측정은 질문 10개라 BR10.3의 /10과 같다). 질문이 없으면 null. */
function hitRate(perQuestion, k) {
  if (perQuestion.length === 0) return null;
  return perQuestion.filter((entry) => isHitAt(entry.hits, entry.goldLocations, k)).length / perQuestion.length;
}

/** 근거 통과율 = 통과 / (통과 + 버림). 분모가 0이면 null('해당 없음', entities RagEvalReport). */
function evidencePassRate(passedItems, droppedItems) {
  const total = passedItems + droppedItems;
  return total === 0 ? null : passedItems / total;
}

/** 조각 위치만(글 없이) 옮긴다. 비적중 질문의 앞 8개 위치 기록용(BR10.3). */
function locationOf(hit) {
  return { publishedItemId: hit.publishedItemId, fieldPath: hit.fieldPath, charStart: hit.charStart, charEnd: hit.charEnd };
}

module.exports = { GoldQuoteNotFound, evidencePassRate, findGoldLocations, hitRate, isHitAt, locationOf, overlaps };
