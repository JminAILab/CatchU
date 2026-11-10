import type { Jd, JdItem, JdGatedItem, JdRequirement, JdRun, JdRunItem, Page, RunStatus, SourceLocation } from "./jd-types.ts";

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const time = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const status = (v: unknown): v is RunStatus => v === "PENDING" || v === "DONE" || v === "FAILED";
const failures = ["SEARCH_FAILED", "GENERATION_FAILED", "INPUT_TOO_LARGE", "CONTRACT_INVALID", "DEADLINE_EXCEEDED", "PROCESSING_FAILED"];

export function isJdItem(v: unknown): v is JdItem {
  return record(v) && uuid(v.jdId) && text(v.title) && time(v.updatedAt) && !("body" in v);
}
export function isJd(v: unknown): v is Jd {
  return record(v) && uuid(v.jdId) && text(v.title) && typeof v.body === "string" && time(v.createdAt) && time(v.updatedAt);
}
export function isPage<T>(v: unknown, item: (value: unknown) => value is T): v is Page<T> {
  return record(v) && Array.isArray(v.items) && v.items.length <= 20 && v.items.every(item)
    && (v.nextCursor === null || text(v.nextCursor));
}
export function isAccepted(v: unknown): v is { runId: string } { return record(v) && uuid(v.runId); }
export function isJdRunItem(v: unknown): v is JdRunItem {
  return record(v) && uuid(v.runId) && text(v.title) && time(v.createdAt) && status(v.status)
    && integer(v.requirementCount) && v.requirementCount >= 1 && v.requirementCount <= 20
    && integer(v.emptyCount) && v.emptyCount >= 0 && integer(v.failedCount) && v.failedCount >= 0
    && v.emptyCount + v.failedCount <= v.requirementCount && !("body" in v) && !("requirements" in v);
}
function isLocation(v: unknown): v is SourceLocation {
  return record(v) && text(v.publishedItemId) && text(v.fieldPath) && integer(v.charStart) && v.charStart >= 0
    && integer(v.charEnd) && v.charEnd > v.charStart && (v.pdfPage === null || (integer(v.pdfPage) && v.pdfPage > 0));
}
/** jdRole와 인용 위치를 버리지 않는다. 받은 위치는 다시 계산하지 않는다. */
export function isJdGatedItem(v: unknown): v is JdGatedItem {
  return record(v) && ["CITED", "AI_INTERPRETATION", "SERVER_NOTICE"].includes(v.kind as string)
    && typeof v.text === "string" && ["EVIDENCE", "UNCONFIRMED", "INTERVIEW_QUESTION"].includes(v.jdRole as string)
    && Array.isArray(v.citations) && v.citations.every((c) => record(c) && text(c.sourceId)
      && typeof c.quote === "string" && text(c.sourceLabel) && isLocation(c.location));
}
function isRequirement(v: unknown): v is JdRequirement {
  if (!record(v) || !integer(v.requirementIndex) || v.requirementIndex < 0 || v.requirementIndex > 19
    || !integer(v.sourceLineNumber) || v.sourceLineNumber < 1 || !text(v.jdLine) || v.jdLine.length > 2000 || !status(v.status)) return false;
  if (v.status === "DONE" ? !["CONTENT", "EMPTY"].includes(v.resultKind as string) || v.failureCode !== null
    : v.resultKind !== null || (v.status === "FAILED" ? !failures.includes(v.failureCode as string) : v.failureCode !== null)) return false;
  return ([['evidenceItems', 'EVIDENCE'], ['unconfirmedPoints', 'UNCONFIRMED'], ['interviewQuestions', 'INTERVIEW_QUESTION']] as const)
    .every(([key, role]) => Array.isArray(v[key]) && v[key].every((item) => isJdGatedItem(item) && item.jdRole === role));
}
export function isJdRun(v: unknown): v is JdRun {
  if (!record(v) || !status(v.status) || !Array.isArray(v.requirements) || v.requirements.length < 1 || v.requirements.length > 20) return false;
  if (v.status === "FAILED" ? !["DEADLINE_EXCEEDED", "ALL_REQUIREMENTS_FAILED", "PROCESSING_FAILED"].includes(v.failureCode as string)
    : v.failureCode !== null) return false;
  return v.requirements.every((r, index, rows) => isRequirement(r) && r.requirementIndex === index
    && (index === 0 || r.sourceLineNumber > rows[index - 1].sourceLineNumber));
}
