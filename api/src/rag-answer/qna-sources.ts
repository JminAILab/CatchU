// 질의응답 근거 목록 만들기(#559 FR1.1~FR1.5·FR2.1·FR2.2·FR2.4·FR7.1, 계약 C-01 itemContext·C-09 note).
// 순수 함수다. 앱(qna-service.ts)과 평가 스크립트(scripts/rag-eval/rag-eval.cjs)가 같이 불러 같은 검색 결과에서 같은 근거 목록을 만든다.
// 검색으로 맞은 줄은 그대로 보내고, 맞은 Catch의 GitHub 기록 줄을 발행 사본에서 정해진 순서와 상한으로 더 붙인 뒤 근거마다 머리글을 단다.
// 사본 → 근거 바꾸기는 기본 요약과 같은 buildSummarySources를 쓴다. 머리글에 Catch 제목·AI 초안·저장소 이름을 넣지 않는다(12월 FR6.4).
// 머리글의 표 글자(「다」 등)는 받은 사람 화면에 없어서, 게이트를 지난 답 항목 글에서 화면의 자료 종류 표시로 바꾼다(#653, replaceItemTags).
import type { AiSource, GatedItem } from '../ai-generation/ai-generation.types';
import type { PublishedSnapshot, PublishedSnapshotItem } from '../publications/publication-access';
import type { ChunkHit } from '../published-index/published-search';
import { QNA_ATTACH_PER_CATCH_LIMIT, QNA_ITEM_CONTEXT_MAX_LENGTH, QNA_SOURCE_TOTAL_LIMIT } from './rag-answer-config';
import { buildSummarySources, firstCopyItems } from './summary-sources';

export interface QnaSources {
  /** 모델에 보낼 근거. 검색으로 맞은 줄은 늘 들어 있고, 전체는 QNA_SOURCE_TOTAL_LIMIT 이하다. */
  sources: AiSource[];
  /** 상한 때문에 붙이지 못한 줄 수(건너뛴 근거의 줄 포함, FR1.6). 로그·평가 기록에 수로만 남긴다. */
  unattachedLineCount: number;
  /** 보낸 근거의 머리글에 실제로 든 표 글자 → 그 머리글의 꼴(#653). 답 항목 글을 replaceItemTags로 바꿀 때 쓴다. */
  itemTags: ReadonlyMap<string, ItemTagForm>;
}

/**
 * 표 글자를 단 머리글의 꼴(#653). 답에서 그 표 글자를 바꿀 화면 글자를 정한다.
 * TEXT_MATERIAL·PDF_MATERIAL은 자료, CATCH_UNTITLED는 둘째 줄이 없는 Catch, CATCH_SHARED_SECOND는 둘째 줄이 같은 Catch다.
 */
export type ItemTagForm = 'TEXT_MATERIAL' | 'PDF_MATERIAL' | 'CATCH_UNTITLED' | 'CATCH_SHARED_SECOND';

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

/**
 * 발행 항목마다 머리글(itemContext). 표 글자는 position 순서로 매기고, 둘째 줄이 같은 Catch끼리는 표 글자를 붙여 가른다.
 * 앞선 사본만 센다(발행 프리셋 BR4.3): 겹친 사본은 머리글이 없고, 표 글자를 건너뛰지 않으며, 둘째 줄의 같은 작업 수에 들지 않는다.
 * 겹친 사본이 없으면 지금과 글자까지 같다. 프리셋 이름은 넣지 않는다(ADR-007, NFR4.4).
 */
export function buildItemContexts(snapshot: PublishedSnapshot): Map<string, string> {
  return new Map([...itemHeaders(snapshot)].map(([publishedItemId, header]) => [publishedItemId, header.context]));
}

/** 항목 하나의 머리글. tag는 머리글에 넣은 표 글자(괄호 없이)이고, 표 글자가 없는 꼴이면 tag·form 모두 null이다. */
interface ItemHeader {
  context: string;
  tag: string | null;
  form: ItemTagForm | null;
}

/** buildItemContexts와 표 글자 표(#653)가 같이 쓰는 머리글 만들기. 두 쪽이 같은 반복에서 나와 표 글자가 어긋나지 않는다. */
function itemHeaders(snapshot: PublishedSnapshot): Map<string, ItemHeader> {
  const items = firstCopyItems(snapshot);
  const seconds = new Map(items.map((item) => [item.publishedItemId, secondWorkFact(item)]));
  const counts = new Map<string, number>();
  for (const second of seconds.values()) if (second !== null) counts.set(second, (counts.get(second) ?? 0) + 1);
  const headers = new Map<string, ItemHeader>();
  items.forEach((item, index) => {
    const tag = itemTag(index);
    const second = seconds.get(item.publishedItemId) ?? null;
    let header: ItemHeader;
    if (item.itemKind === 'TEXT_MATERIAL') header = { context: `이 줄이 속한 자료: 「${tag}」 텍스트 자료`, tag, form: 'TEXT_MATERIAL' };
    else if (item.itemKind === 'PDF_MATERIAL') header = { context: `이 줄이 속한 자료: 「${tag}」 올린 문서`, tag, form: 'PDF_MATERIAL' };
    else if (second === null) header = { context: `이 줄이 속한 작업: 「${tag}」 작업(기록 제목 없음)`, tag, form: 'CATCH_UNTITLED' };
    else if ((counts.get(second) ?? 0) > 1) header = { context: `이 줄이 속한 작업: 「${tag}」 ${second}`, tag, form: 'CATCH_SHARED_SECOND' };
    else header = { context: `이 줄이 속한 작업: ${second}`, tag: null, form: null };
    headers.set(item.publishedItemId, header);
  });
  return headers;
}

/**
 * 표 글자를 바꿀 화면 글자(#653). 받은 사람 화면의 종류 표시(web snapshot-view.tsx KIND_LABELS)와 같은 말이다.
 * 표 글자(가~버)는 모두 받침이 없어 모델이 받침 없는 조사(가·는·를·와)를 붙인다. 그래서 바꾼 글도 받침 없이 끝나야 조사가 맞는다:
 * 「텍스트 자료」·「PDF 자료」·「Catch」(캐치)는 받침이 없다. 「작업(기록 제목 없음)」(받침 꼴 조사)까지 바꿀 때는 받침이 있는 「Catch 작업」이다.
 */
const TAG_SCREEN_NAMES: Record<ItemTagForm, string> = {
  TEXT_MATERIAL: '텍스트 자료', PDF_MATERIAL: 'PDF 자료', CATCH_UNTITLED: 'Catch', CATCH_SHARED_SECOND: 'Catch',
};

/**
 * 표 글자 바로 뒤에 붙어 표 글자와 함께 한 이름으로 바꾸는 머리글 낱말(#653). 자료는 자료를 부르는 말, Catch는 작업을 부르는 말이다.
 * 예: 「다」 텍스트 자료 → 텍스트 자료, 「가」 올린 문서 → PDF 자료, 「나」 작업(기록 제목 없음) → Catch 작업.
 * 표 글자가 어느 항목인지 정하므로, 모델이 붙인 말이 그 항목 종류와 달라도(텍스트 자료를 「문서」라 함) 그 항목의 화면 글자로 바꾼다.
 * 목록에 없는 말이 뒤에 오면 표 글자만 바꾸고 뒤 말은 그대로 둔다.
 */
const MATERIAL_WORDS: ReadonlySet<string> = new Set(['텍스트 자료', '올린 문서', '자료', '문서']);
const CATCH_WORDS: ReadonlySet<string> = new Set(['작업(기록 제목 없음)', '작업']);

/** 표 글자와 뒤 낱말을 함께 바꾼 글. 그 꼴이 받는 낱말이 아니면 null. */
function tagWithWordName(form: ItemTagForm, word: string): string | null {
  if (form === 'TEXT_MATERIAL' || form === 'PDF_MATERIAL') return MATERIAL_WORDS.has(word) ? TAG_SCREEN_NAMES[form] : null;
  return CATCH_WORDS.has(word) ? 'Catch 작업' : null;
}

/** 표 글자 뒤 낱말 후보(긴 것 먼저). 고정 상수에서만 만든다(작성자 글·모델 글을 정규식에 넣지 않는다). */
const TAG_SUFFIX_PATTERN = ['텍스트 자료', '올린 문서', '작업(기록 제목 없음)', '자료', '문서', '작업']
  .map((word) => word.replace(/[()]/g, '\\$&')).join('|');
/** 「표 글자」와 뒤에 이어진 머리글 낱말(빈칸 0~1개). 표 글자 자리는 한글 음절만 받고, 보낸 표 글자인지는 바꿀 때 본다. */
const TAG_IN_TEXT = new RegExp(`「([가-힣]{1,2})」(?:( ?)(${TAG_SUFFIX_PATTERN}))?`, 'gu');

/**
 * 답 항목 글에서 그 요청이 모델에 준 표 글자를 화면의 자료 종류 표시로 바꾼다(#653, 팀장 결정 2026-11-28).
 * 표 글자는 머리글에만 있고 받은 사람 화면에는 없어서, 답이 「「다」 텍스트 자료」처럼 가리키면 면접관이 그 자료를 찾지 못한다.
 * 바꾸는 것은 itemTags에 든 표 글자(보낸 근거의 머리글에 실제로 들어간 것)뿐이고, 그 밖의 「…」 글은 그대로 둔다.
 * 글만 바꾸고 kind·citations·jdRole은 그대로다. 인용은 항목 글 안의 위치를 가리키지 않아 어긋나지 않는다.
 * 게이트의 사실 대조를 지난 뒤에 바꾸므로, 바꿔 넣은 영어 표기(PDF·Catch) 때문에 항목이 버려지지 않는다.
 * 같은 종류가 둘 이상이면 같은 화면 글자로 바뀌어 둘을 가르지 못하고, 괄호 없이 쓴 표 글자는 찾지 않는다(알려진 한계).
 */
export function replaceItemTags(item: GatedItem, itemTags: ReadonlyMap<string, ItemTagForm>): GatedItem {
  if (itemTags.size === 0) return item;
  const text = item.text.replace(TAG_IN_TEXT, (match: string, tag: string, space: string | undefined, suffix: string | undefined) => {
    const form = itemTags.get(tag);
    if (form === undefined) return match;
    if (suffix === undefined) return TAG_SCREEN_NAMES[form];
    return tagWithWordName(form, suffix) ?? `${TAG_SCREEN_NAMES[form]}${space ?? ''}${suffix}`;
  });
  return text === item.text ? item : { ...item, text };
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
 * itemTags에는 보낸 근거의 머리글에 실제로 든 표 글자만 넣는다(#653). 보내지 않은 항목의 표 글자는 답에서 바꾸지 않는다.
 */
export function buildQnaSources(hits: readonly ChunkHit[], snapshot: PublishedSnapshot): QnaSources {
  const snapshotSources = buildSummarySources(snapshot);
  const headers = itemHeaders(snapshot);
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
  const itemTags = new Map<string, ItemTagForm>();
  const withContext = (source: AiSource): AiSource => {
    const header = headers.get(source.location.publishedItemId);
    if (header === undefined) return source;
    if (header.tag !== null && header.form !== null) itemTags.set(header.tag, header.form);
    return { ...source, itemContext: header.context };
  };
  const sources = slots.flatMap((slot) => [...slot.hits.map(chunkToSource), ...slot.attached]).map(withContext);
  return { sources, unattachedLineCount, itemTags };
}
