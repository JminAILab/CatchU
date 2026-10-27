// C-01 AI 생성 공통(AiGenerationGate)의 입력·출력·오류 모양.
// 계약 원본: aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md 「C-01」.
// U1은 generate() 최소 경로만 만든다. generateStream·숨긴 지시 방어·입력 상한·기계 대조는 U2가 더한다.

export type AiSourceKind = 'GITHUB_RECORD' | 'AUTHOR_MATERIAL';
export type AiFeature = 'BASE_SUMMARY' | 'QNA' | 'JD_SUMMARY';
export type AiModel = 'HAIKU' | 'SONNET';

/** 사본 필드 안의 원문 범위. charStart·charEnd는 그 필드 문자열의 UTF-16 코드 단위 [start, end). */
export interface SourceLocation {
  publishedItemId: string;
  fieldPath: string;
  charStart: number;
  charEnd: number;
  pdfPage: number | null;
}

/** 근거 글 하나. text는 location 범위의 원문 그대로다(호출 Unit이 보장). */
export interface AiSource {
  sourceId: string;
  sourceKind: AiSourceKind;
  text: string;
  location: SourceLocation;
  /** U1은 쓰지 않는다(PR 번호 허용은 U2 검사). */
  catchEvidenceUrls: string[];
}

export interface AiGenerationRequest {
  feature: AiFeature;
  /** 기능별 지시문. 시스템 지시에 들어간다. */
  instruction: string;
  /** 비면 Claude를 부르지 않고 빈 결과를 돌려준다. */
  sources: AiSource[];
  /** 질문·JD 요구사항 줄. 신뢰하지 않는 입력이라 문서 뒤 사용자 메시지로만 보낸다. */
  userText: string | null;
  /** U2 검사 전용. U1은 쓰지 않고 모델에 보내지 않는다. */
  publicationText: string | null;
  /** 호출하는 쪽의 기본값은 HAIKU다(C-01). */
  model: AiModel;
}

export const SOURCE_LABELS = {
  GITHUB_RECORD: 'GitHub 기록 원문',
  AUTHOR_MATERIAL: '작성자 자료 원문',
} as const satisfies Record<AiSourceKind, string>;

export type SourceLabel = (typeof SOURCE_LABELS)[AiSourceKind];

export interface ItemCitation {
  sourceId: string;
  /** location 범위의 원문 그대로(인용 기능이 이어 붙인 글이 아님). */
  quote: string;
  /** quote 자체의 범위로 좁힌 값. */
  location: SourceLocation;
  sourceLabel: SourceLabel;
}

export interface GatedItem {
  kind: 'CITED' | 'AI_INTERPRETATION';
  text: string;
  /** CITED는 1개 이상, AI_INTERPRETATION은 빈 목록. */
  citations: ItemCitation[];
}

export interface GatedOutput {
  items: GatedItem[];
  /** 로그용, 화면에 보이지 않는다. U1에서는 잘린 마지막 항목과 위치로 연결되지 않는 인용의 항목 수. */
  droppedCount: number;
}

/** C-01 인터페이스 중 U1 범위. generateStream(QNA)은 U2가 더한다. */
export interface AiGenerationGate {
  generate(request: AiGenerationRequest): Promise<GatedOutput>;
}

/** 실패 원인. 호출자는 오류 이름만으로 실패를 기록할 수 있고, reason은 로그 구분용이다. */
export type AiProviderErrorReason = 'CALL_FAILED' | 'REFUSED' | 'NO_ITEMS' | 'UNEXPECTED_STOP';

/** CALL_FAILED의 세부 원인. SDK 오류의 원문 메시지 대신 고정 이름만 남긴다. */
export type AiCallFailure =
  | 'CONNECTION_TIMEOUT'
  | 'CONNECTION_FAILED'
  | 'API_STATUS'
  | 'REDIRECT_REJECTED'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

export interface AiProviderErrorDetail {
  failure?: AiCallFailure;
  status?: number | null;
  requestId?: string | null;
}

/** Claude 호출 실패(C-01). 자동 재시도 없이 호출자가 실패로 기록한다. 메시지에 근거 글·키·제공자 원문을 넣지 않는다. */
export class AiProviderError extends Error {
  override readonly name = 'AiProviderError';
  readonly failure: AiCallFailure | null;
  readonly status: number | null;
  readonly requestId: string | null;

  constructor(readonly reason: AiProviderErrorReason, detail: AiProviderErrorDetail = {}) {
    super(`AI 생성에 실패했습니다(${reason}${detail.failure ? `/${detail.failure}` : ''}).`);
    this.failure = detail.failure ?? null;
    this.status = detail.status ?? null;
    this.requestId = detail.requestId ?? null;
  }
}

/** 입력 상한 초과(C-01). 판정과 던지기는 U2가 넣는다. U1은 던지지 않는다. */
export class AiInputTooLarge extends Error {
  override readonly name = 'AiInputTooLarge';

  constructor() {
    super('AI 생성 입력이 상한을 넘었습니다.');
  }
}
