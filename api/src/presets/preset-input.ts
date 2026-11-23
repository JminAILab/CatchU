// 프리셋 경로의 본문 검사(발행 프리셋 U1 규칙 BR1.2·BR1.4·BR2.4, NFR2.6·NFR3.1, 기능 설계 검토 R-06).
// 발행 요청 검사(publish-input.ts)와 같은 방식이다: 정의한 칸만 받고, 칸별 이유를 모두 모아 400 VALIDATION_FAILED로 돌려준다.
// 오류 응답에 입력값(이름·자료 ID)을 담지 않는다. violations의 field는 저장 `name`·`items`, 세기 `items`다(항목 모양은 `items[i]` 아래).
import { ApiError } from '../common/errors';
import { codePointLength } from '../publishable-source/source-content';
import { SOURCE_KINDS, SourceKind, SourceRef } from '../publishable-source/source-reader';
import { PRESET_ITEMS_MAX } from './preset-item.entity';

/** 검사 상한(BR1.2·BR1.3·BR1.4·BR2.4). 길이는 유니코드 코드 포인트로 센다. */
export const PRESET_LIMITS = Object.freeze({
  nameMax: 50, presetsPerMember: 50, itemsMax: PRESET_ITEMS_MAX, measureMin: 1, measureMax: 50,
});

/** 검사를 통과한 저장 명령. items 배열 순서가 position이다(BR1.6). */
export interface PresetSaveInput {
  name: string;
  items: SourceRef[];
}

type Violation = { field: string; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// u 모드는 올바른 서로게이트 쌍을 하나의 코드 포인트로 읽으므로 고립된 코드 단위만 잡는다(발행 제목과 같은 기준).
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

const failed = (violations: Violation[]): ApiError => new ApiError('VALIDATION_FAILED', { details: { violations } });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 이름은 앞뒤 공백을 뺀 1~50자이고 뺀 값으로 저장한다. 같은 이름은 막지 않고 HTML로 해석하지 않는다(BR1.2, NFR3.1). */
function checkName(input: Record<string, unknown>, violations: Violation[]): string | null {
  const value = input.name;
  if (typeof value !== 'string') {
    violations.push({ field: 'name', reason: 'isString' });
    return null;
  }
  // NUL은 PostgreSQL text에 저장할 수 없고, 고립된 서로게이트는 UTF-8로 저장할 수 없다(발행 제목과 같은 거부).
  if (value.includes('\u0000')) violations.push({ field: 'name', reason: 'noNul' });
  if (LONE_SURROGATE.test(value)) violations.push({ field: 'name', reason: 'isWellFormed' });
  const trimmed = value.trim();
  if (trimmed.length === 0) violations.push({ field: 'name', reason: 'isNotEmpty' });
  else if (codePointLength(trimmed) > PRESET_LIMITS.nameMax) violations.push({ field: 'name', reason: 'maxLength' });
  return trimmed;
}

/** 자료 목록 `[{ kind, sourceId }]`. 개수는 min~max, 같은 (종류, ID)는 한 번만(BR1.4·BR2.4). */
function checkItems(input: Record<string, unknown>, violations: Violation[], min: number, max: number): SourceRef[] {
  const value = input.items;
  if (!Array.isArray(value)) {
    violations.push({ field: 'items', reason: 'isArray' });
    return [];
  }
  if (value.length < min) violations.push({ field: 'items', reason: 'arrayMinSize' });
  if (value.length > max) violations.push({ field: 'items', reason: 'maxItems' });
  const items: SourceRef[] = [];
  const seen = new Set<string>();
  let duplicated = false;
  value.forEach((raw, index) => {
    // 항목 안의 임의 필드 이름은 응답에 반사하지 않고 위치만 알린다.
    const field = `items[${index}]`;
    if (!isPlainObject(raw) || Object.keys(raw).some((key) => key !== 'kind' && key !== 'sourceId')) {
      violations.push({ field, reason: 'isObject' });
      return;
    }
    const kindValid = SOURCE_KINDS.includes(raw.kind as SourceKind);
    if (!kindValid) violations.push({ field: `${field}.kind`, reason: 'isIn' });
    if (!isUuid(raw.sourceId)) violations.push({ field: `${field}.sourceId`, reason: 'isUuid' });
    if (!kindValid || !isUuid(raw.sourceId)) return;
    const item: SourceRef = { kind: raw.kind as SourceKind, sourceId: raw.sourceId.toLowerCase() };
    const key = `${item.kind}:${item.sourceId}`;
    if (seen.has(key)) duplicated = true;
    seen.add(key);
    items.push(item);
  });
  if (duplicated) violations.push({ field: 'items', reason: 'arrayUnique' });
  return items;
}

function checkBody(raw: unknown, fields: readonly string[], violations: Violation[]): Record<string, unknown> {
  if (!isPlainObject(raw)) throw failed([{ field: 'body', reason: 'isObject' }]);
  if (Object.keys(raw).some((key) => !fields.includes(key))) violations.push({ field: 'body', reason: 'whitelistValidation' });
  return raw;
}

/** `POST /presets`·`PUT /presets/{id}` 본문 `{ name, items }`. 항목 0~20개(BR1.4). */
export function presetSaveInput(raw: unknown): PresetSaveInput {
  const violations: Violation[] = [];
  const body = checkBody(raw, ['name', 'items'], violations);
  const name = checkName(body, violations);
  const items = checkItems(body, violations, 0, PRESET_LIMITS.itemsMax);
  if (violations.length > 0 || name === null) throw failed(violations);
  return { name, items };
}

/** `POST /presets/measure` 본문 `{ items }`. 1~50개(BR2.4). */
export function presetMeasureInput(raw: unknown): SourceRef[] {
  const violations: Violation[] = [];
  const body = checkBody(raw, ['items'], violations);
  const items = checkItems(body, violations, PRESET_LIMITS.measureMin, PRESET_LIMITS.measureMax);
  if (violations.length > 0) throw failed(violations);
  return items;
}

/** 경로의 프리셋 ID. UUID가 아니면 null이고, 부르는 쪽이 없는 프리셋과 같은 404로 답한다(NFR2.2). */
export function presetIdInput(value: unknown): string | null {
  return isUuid(value) ? value.toLowerCase() : null;
}

/** 프리셋 경로는 쿼리를 받지 않는다. */
export function emptyPresetQuery(raw: unknown): void {
  if (isPlainObject(raw) && Object.keys(raw).length === 0) return;
  throw failed([{ field: 'query', reason: 'whitelistValidation' }]);
}
