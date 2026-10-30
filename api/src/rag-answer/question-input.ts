// 질의응답 요청 본문 검증과 줄이기(기능 설계 BR1.1·BR1.2·BR8.7, security-design NFR1.4, 보안 점검 「요청·메시지 입력」).
// 순수 함수다. 정의하지 않은 칸(본문 최상위·앞 대화 항목 안)은 버리지 않고 400으로 거부한다(계획 1차 수정 요청 (2)).
// 오류 details에는 칸 이름과 규칙 이름만 넣고 입력값은 넣지 않는다.
import { ApiError } from '../common/errors';
import { HISTORY_MAX_MESSAGES, HISTORY_MESSAGE_MAX_LENGTH, QUESTION_MAX_LENGTH } from './rag-answer-config';

export const HISTORY_ROLES = ['USER', 'ASSISTANT'] as const;
export type HistoryRole = (typeof HISTORY_ROLES)[number];

export interface HistoryMessage {
  role: HistoryRole;
  text: string;
}

/** 검증·줄이기를 마친 질문. history는 최근 6개·메시지마다 앞 2,000자다. */
export interface QuestionInput {
  question: string;
  history: HistoryMessage[];
}

const BODY_KEYS = ['question', 'history'];
const MESSAGE_KEYS = ['role', 'text'];

const invalid = (field: string, reason: string) =>
  new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(field, 'isObject');
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: string[], field: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw invalid(field, 'whitelistValidation');
}

/** BR1.1: 문자열, 앞뒤 공백을 뺀 길이 1 이상, UTF-16 길이 500 이하. 글은 앞뒤 공백만 뗀다. */
function parseQuestion(value: unknown): string {
  if (typeof value !== 'string') throw invalid('question', 'isString');
  if (value.length > QUESTION_MAX_LENGTH) throw invalid('question', 'maxLength');
  const trimmed = value.trim();
  if (trimmed.length === 0) throw invalid('question', 'isNotEmpty');
  return trimmed;
}

function parseMessage(value: unknown, index: number): HistoryMessage {
  const field = `history[${index}]`;
  const message = asObject(value, field);
  rejectUnknownKeys(message, MESSAGE_KEYS, field);
  if (!HISTORY_ROLES.includes(message.role as HistoryRole)) throw invalid(`${field}.role`, 'isIn');
  if (typeof message.text !== 'string') throw invalid(`${field}.text`, 'isString');
  return { role: message.role as HistoryRole, text: message.text };
}

/** BR1.2: 배열 모양을 모두 본 뒤 끝에서 6개를 남기고, 남긴 메시지마다 앞 2,000자만 쓴다(넘는 부분은 거부하지 않고 버림). */
function parseHistory(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) throw invalid('history', 'isArray');
  const messages = value.map(parseMessage);
  return messages.slice(-HISTORY_MAX_MESSAGES)
    .map((message) => ({ role: message.role, text: message.text.slice(0, HISTORY_MESSAGE_MAX_LENGTH) }));
}

/** 요청 본문 → 검증·줄이기를 마친 새 값. 틀리면 ApiError('VALIDATION_FAILED')(질문 횟수를 세기 전, BR1.1). */
export function parseQuestionInput(raw: unknown): QuestionInput {
  const body = asObject(raw, 'body');
  rejectUnknownKeys(body, BODY_KEYS, 'body');
  const question = parseQuestion(body.question);
  const history = parseHistory(body.history);
  return { question, history };
}
