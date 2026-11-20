// 질의응답 근거 목록 만들기(#559 FR1.1~FR1.5·FR2.1·FR2.2·FR2.4·FR7.1, 계약 C-01 itemContext·C-09 note).
// 순수 함수다. 앱(qna-service.ts)과 평가 스크립트(scripts/rag-eval/rag-eval.cjs)가 같이 불러 같은 검색 결과에서 같은 근거 목록을 만든다.
// 검색으로 맞은 줄은 그대로 보내고, 맞은 Catch의 GitHub 기록 줄을 발행 사본에서 정해진 순서와 상한으로 더 붙인 뒤 근거마다 머리글을 단다.
// 사본 → 근거 바꾸기는 기본 요약과 같은 buildSummarySources를 쓴다. 머리글에 Catch 제목·AI 초안·저장소 이름을 넣지 않는다(12월 FR6.4).
import type { AiSource } from '../ai-generation/ai-generation.types';
import type { PublishedSnapshot, PublishedSnapshotItem } from '../publications/publication-access';
import type { ChunkHit } from '../published-index/published-search';
import { QNA_ATTACH_PER_CATCH_LIMIT, QNA_ITEM_CONTEXT_MAX_LENGTH, QNA_SOURCE_TOTAL_LIMIT } from './rag-answer-config';
import { buildSummarySources } from './summary-sources';

export interface QnaSources {
  /** 모델에 보낼 근거. 검색으로 맞은 줄은 늘 들어 있고, 전체는 QNA_SOURCE_TOTAL_LIMIT 이하다. */
  sources: AiSource[];
  /** 상한 때문에 붙이지 못한 줄 수(건너뛴 근거의 줄 포함, FR1.6). 로그·평가 기록에 수로만 남긴다. */
  unattachedLineCount: number;
}

/**
 * 머리글에서 숫자 대신 쓰는 한글 한 글자(발행 순서). 머리글은 인용할 수 없어서 인용 없는 항목에 옮긴 숫자·영문자는
 * AI 해석 대조에서 버려지므로, 고정 글자에 숫자·영문자를 쓰지 않는다(코드 계획 설계 결정 6, 인용 항목은 #581부터 대조 안 함).
 * 발행본 항목은 최대 20개다.
 */
export const QNA_ITEM_TAGS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하',
  '거', '너', '더', '러', '머', '버'] as const;

// 이스케이프는 중괄호 꼴(\u{…})로 쓴다. 줄바꿈 문자와 글 방향 제어 문자가 소스에 그대로 들어가지 않게 하려는 것이다.
/** 줄바꿈: \r\n, \r, \n, U+2028(줄 구분), U+2029(문단 구분). */
const LINE_BREAKS = /\r\n|[\r\n\u{2028}\u{2029}]/gu;
/** 빈칸 구실을 하는 제어 문자: 탭(U+0009)·세로 탭(U+000B)·쪽바꿈(U+000C)·다음 줄(U+0085). 지우지 않고 빈칸으로 바꿔 낱말이 붙지 않게 한다. */
// 제어 문자(Cc)이면서 빈칸인 글자(탭·세로 탭·쪽바꿈)와 U+0085. 제어 문자를 직접 적지 않아 no-control-regex에 걸리지 않는다.
const SPACE_CONTROLS = /(?=\p{Cc})\s|\u{0085}/gu;
/** 줄바꿈·빈칸 구실 문자를 바꾼 뒤 남은 유니코드 제어 문자(Cc). */
const CONTROL_CHARS = /\p{Cc}/gu;
/**
 * 서식 문자(Cf) 전체. 글 방향 제어 문자(U+200E·U+200F·U+202A~U+202E·U+2066~U+2069), 폭 없는 공백·이음(U+200B~U+200D),
 * U+FEFF, U+2060~U+2064, U+061C, 태그 문자(U+E0001·U+E0020~U+E007F)가 모두 여기에 든다. 눈에 안 보이는 글자로 머리글에 지시를 숨기지 못하게 지운다.
 */
const FORMAT_CHARS = /\p{Cf}/gu;
const SPACES = /\s+/gu;

/** 검색 결과 한 칸을 근거로 옮긴다(sourceId = chunkId, 위치는 조각 범위 그대로, C-09 note). */
export function chunkToSource(hit: ChunkHit): AiSource {
  return {
    sourceId: hit.chunkId,
    sourceKind: hit.sourceKind,
    text: hit.text,
    location: { publishedItemId: hit.publishedItemId, fieldPath: hit.fieldPath, charStart: hit.charStart, charEnd: hit.charEnd,
      pdfPage: hit.pdfPage },
    catchEvidenceUrls: [...hit.catchEvidenceUrls],
  };
}

/** 발행 순서 번째(0부터) 표 글자. 20개를 넘는 일은 없지만 넘으면 두 글자로 이어 숫자·영문자 없이 가른다. */
export function itemTag(index: number): string {
  const size = QNA_ITEM_TAGS.length;
  if (index < size) return QNA_ITEM_TAGS[index];
  return `${QNA_ITEM_TAGS[Math.floor(index / size) - 1] ?? QNA_ITEM_TAGS[size - 1]}${QNA_ITEM_TAGS[index % size]}`;
}

/**
 * 작업 사실 둘째 줄 다듬기(작성자가 쓴 글이라서). 줄바꿈과 빈칸 구실 제어 문자(탭 등)는 빈칸 하나로 바꾸고,
 * 그 밖의 제어 문자(Cc)와 서식 문자(Cf: 글 방향 제어·폭 없는 공백·태그 문자 등)는 지운다(코드 생성 리뷰 R-01).
 * 겹친 빈칸을 줄이고 앞뒤 빈칸을 뗀 뒤 앞 maxLength자(UTF-16)까지 자르되 서로게이트 쌍을 가운데서 자르지 않는다. 빈 글이면 null.
 */
export function sanitizeItemContextLine(text: string, maxLength: number = QNA_ITEM_CONTEXT_MAX_LENGTH): string | null {
  const cleaned = text.replace(LINE_BREAKS, ' ').replace(SPACE_CONTROLS, ' ').replace(CONTROL_CHARS, '')
    .replace(FORMAT_CHARS, '').replace(SPACES, ' ').trim();
  if (cleaned === '') return null;
  if (cleaned.length <= maxLength) return cleaned;
  const last = cleaned.charCodeAt(maxLength - 1);
  const cut = last >= 0xd800 && last <= 0xdbff ? maxLength - 1 : maxLength;
  return cleaned.slice(0, cut);
}

/** Catch 사본의 workFacts[1]. 칸 위치로만 고르고 worker 문장을 글자로 대조하지 않는다(FR2.2). */
function secondWorkFact(item: PublishedSnapshotItem): string | null {
  if (item.itemKind !== 'CATCH') return null;
  const workFacts = (item.snapshot as { workFacts?: unknown }).workFacts;
  const line = Array.isArray(workFacts) ? workFacts[1] : undefined;
  return typeof line === 'string' ? sanitizeItemContextLine(line) : null;
}

/** 발행 항목마다 머리글(itemContext). 표 글자는 position 순서로 매기고, 둘째 줄이 같은 Catch끼리는 표 글자를 붙여 가른다. */
export function buildItemContexts(snapshot: PublishedSnapshot): Map<string, string> {
  const items = [...snapshot.items].sort((a, b) => a.position - b.position);
  const seconds = new Map(items.map((item) => [item.publishedItemId, secondWorkFact(item)]));
  const counts = new Map<string, number>();
  for (const second of seconds.values()) if (second !== null) counts.set(second, (counts.get(second) ?? 0) + 1);
  const contexts = new Map<string, string>();
  items.forEach((item, index) => {
    const tag = `「${itemTag(index)}」`;
    const second = seconds.get(item.publishedItemId) ?? null;
    let context: string;
    if (item.itemKind === 'TEXT_MATERIAL') context = `이 줄이 속한 자료: ${tag} 텍스트 자료`;
    else if (item.itemKind === 'PDF_MATERIAL') context = `이 줄이 속한 자료: ${tag} 올린 문서`;
    else if (second === null) context = `이 줄이 속한 작업: ${tag} 작업(기록 제목 없음)`;
    else if ((counts.get(second) ?? 0) > 1) context = `이 줄이 속한 작업: ${tag} ${second}`;
    else context = `이 줄이 속한 작업: ${second}`;
    contexts.set(item.publishedItemId, context);
  });
  return contexts;
}

/** 같은 칸을 가르는 열쇠. 항목 ID가 uuid라 '/'가 섞이지 않는다. */
const fieldKey = (publishedItemId: string, fieldPath: string): string => `${publishedItemId}/${fieldPath}`;
const EVIDENCE_FIELD = /^evidence\[(\d+)\]\.representedFacts\[\d+\]$/;

/** 한 번에 함께 붙이거나 함께 건너뛰는 줄 묶음. 근거(evidence[i])는 묶음 하나, 작업 사실·나의 기여는 줄마다 묶음 하나다. */
type AttachGroup = AiSource[];

/** 검색으로 맞은 Catch 하나의 붙일 줄을 FR1.4 순서의 묶음으로. 이미 보낸(맞은) 칸과 작성자 설명은 뺀다. */
function attachGroups(itemSources: AiSource[], hitFields: Set<string>, matchedEvidence: number[]): AttachGroup[] {
  const evidence = new Map<number, AiSource[]>();
  const workLines: AiSource[] = [];
  for (const source of itemSources) {
    if (source.sourceKind !== 'GITHUB_RECORD' || hitFields.has(fieldKey(source.location.publishedItemId, source.location.fieldPath))) continue;
    const match = EVIDENCE_FIELD.exec(source.location.fieldPath);
    if (match === null) workLines.push(source);
    else evidence.set(Number(match[1]), [...(evidence.get(Number(match[1])) ?? []), source]);
  }
  const first = matchedEvidence.map((i) => evidence.get(i) ?? []);
  const rest = [...evidence.keys()].sort((a, b) => a - b).filter((i) => !matchedEvidence.includes(i)).map((i) => evidence.get(i) ?? []);
  return [...first, ...workLines.map((line) => [line]), ...rest].filter((group) => group.length > 0);
}

/** 검색 결과의 순서를 지킨 칸. Catch는 맞은 줄을 모은 묶음 하나, 그 밖의 항목은 맞은 줄 하나가 칸 하나다. */
interface Slot {
  publishedItemId: string;
  isCatch: boolean;
  hits: ChunkHit[];
  attached: AiSource[];
}

function slotsByRank(hits: readonly ChunkHit[], kinds: Map<string, PublishedSnapshotItem['itemKind']>): Slot[] {
  const slots: Slot[] = [];
  const catchSlots = new Map<string, Slot>();
  for (const hit of hits) {
    const isCatch = kinds.get(hit.publishedItemId) === 'CATCH';
    const existing = isCatch ? catchSlots.get(hit.publishedItemId) : undefined;
    if (existing) {
      existing.hits.push(hit);
      continue;
    }
    const slot: Slot = { publishedItemId: hit.publishedItemId, isCatch, hits: [hit], attached: [] };
    slots.push(slot);
    if (isCatch) catchSlots.set(hit.publishedItemId, slot);
  }
  return slots;
}

/** 맞은 줄이 속한 근거 번호(evidence[i]의 i)를 맞은 순위 순서로, 겹치지 않게. */
function matchedEvidenceIndexes(hits: ChunkHit[]): number[] {
  const indexes: number[] = [];
  for (const hit of hits) {
    const match = EVIDENCE_FIELD.exec(hit.fieldPath);
    if (match !== null && !indexes.includes(Number(match[1]))) indexes.push(Number(match[1]));
  }
  return indexes;
}

/**
 * 질의응답 근거 목록. 검색 결과(순위 순)를 늘 보내고, 맞은 Catch마다 그 Catch의 GitHub 기록 줄을 다음 순서로 더 붙인다(FR1.2·FR1.4).
 * ① 맞은 줄과 같은 근거의 다른 줄 ② 작업 사실·나의 기여 ③ 남은 근거(사본 순서). 작성자 설명과 Catch가 아닌 항목은 붙이지 않는다.
 * Catch마다 QNA_ATTACH_PER_CATCH_LIMIT줄, 전체 QNA_SOURCE_TOTAL_LIMIT줄(검색 포함)까지다. 근거 하나가 남은 상한에 다 들어가지 않으면
 * 자르지 않고 건너뛰며, 줄 단위인 ②는 상한까지만 붙인다. 붙이지 못한 줄은 unattachedLineCount에 센다.
 * 보내는 순서: Catch는 그 Catch의 가장 높은 순위 자리에 맞은 줄(순위 순) → 붙인 줄로 이어 두고, 그 밖의 맞은 줄은 자기 순위 자리다.
 * 붙인 줄의 위치는 그 칸 전체 범위다(C-01 그대로). 검색으로 맞은 칸은 다시 붙이지 않는다(맞은 줄이 남는다).
 * 사본에 없는 항목의 맞은 줄은 머리글 없이 그대로 보낸다. 사본 모양이 틀리면 buildSummarySources의 TypeError를 그대로 던진다.
 */
export function buildQnaSources(hits: readonly ChunkHit[], snapshot: PublishedSnapshot): QnaSources {
  const snapshotSources = buildSummarySources(snapshot);
  const contexts = buildItemContexts(snapshot);
  const kinds = new Map(snapshot.items.map((item) => [item.publishedItemId, item.itemKind]));
  const hitFields = new Set(hits.map((hit) => fieldKey(hit.publishedItemId, hit.fieldPath)));
  const slots = slotsByRank(hits, kinds);
  let totalLeft = Math.max(0, QNA_SOURCE_TOTAL_LIMIT - hits.length);
  let unattachedLineCount = 0;
  for (const slot of slots.filter((entry) => entry.isCatch)) {
    const itemSources = snapshotSources.filter((source) => source.location.publishedItemId === slot.publishedItemId);
    let catchLeft = QNA_ATTACH_PER_CATCH_LIMIT;
    for (const group of attachGroups(itemSources, hitFields, matchedEvidenceIndexes(slot.hits))) {
      if (group.length > Math.min(catchLeft, totalLeft)) {
        unattachedLineCount += group.length;
        continue;
      }
      slot.attached.push(...group);
      catchLeft -= group.length;
      totalLeft -= group.length;
    }
  }
  const withContext = (source: AiSource): AiSource => {
    const itemContext = contexts.get(source.location.publishedItemId);
    return itemContext === undefined ? source : { ...source, itemContext };
  };
  const sources = slots.flatMap((slot) => [...slot.hits.map(chunkToSource), ...slot.attached]).map(withContext);
  return { sources, unattachedLineCount };
}
