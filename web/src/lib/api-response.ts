/** API 명세 v1 오류 본문. 상태별 화면 이동은 호출 화면에서 결정한다. */
export type ApiFailure = {
  kind: "api-error";
  status: number;
  code: string;
  message: string;
  details?: {
    violations?: { field: string; reason: string }[];
    existingRequestId?: string;
  };
};

export type ApiResult =
  | { kind: "success"; status: number; data: unknown }
  | ApiFailure
  | { kind: "lookup-failed"; status: number | null; code: "LOOKUP_FAILED" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** fetch의 Promise를 그대로 넘겨야 네트워크 실패도 같은 결과로 해석한다. */
export async function readApiResponse(response: Response | Promise<Response>): Promise<ApiResult> {
  let status: number | null = null;
  try {
    const resolved = await response;
    status = resolved.status;
    if (resolved.ok && status === 204) return { kind: "success", status, data: null };
    const body: unknown = await resolved.json();
    if (resolved.ok) return { kind: "success", status, data: body };
    if (!isRecord(body) || typeof body.code !== "string" || !body.code.trim()
      || typeof body.message !== "string" || !body.message.trim()) {
      return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
    }
    const failure: ApiFailure = { kind: "api-error", status, code: body.code, message: body.message };
    if (body.details !== undefined) {
      if (!isRecord(body.details)) return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
      const { violations, existingRequestId } = body.details;
      if (violations !== undefined && (!Array.isArray(violations) || !violations.every((item) =>
        isRecord(item) && typeof item.field === "string" && typeof item.reason === "string"))) {
        return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
      }
      if (existingRequestId !== undefined && (typeof existingRequestId !== "string" || existingRequestId.length === 0)) {
        return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
      }
      failure.details = {};
      if (Array.isArray(violations)) failure.details.violations = violations.map(({ field, reason }) => ({ field, reason }));
      if (typeof existingRequestId === "string") failure.details.existingRequestId = existingRequestId;
    }
    return failure;
  } catch {
    return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
  }
}
