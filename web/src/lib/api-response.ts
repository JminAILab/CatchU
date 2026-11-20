/** 발행 막힘 응답이 가리키는 자료 종류(발행 프리셋 계약 P-2). */
export type BlockedSourceKind = "CATCH" | "TEXT_MATERIAL" | "PDF_MATERIAL";
/** 막힌 자료 한 줄: 그 자료가 든 프리셋, 자료 종류, 자료 ID. 이름·내용은 오지 않는다(발행 프리셋 U2 BR5.2). */
export type BlockedSource = { presetId: string; kind: BlockedSourceKind; sourceId: string };

/** API 명세 v1 오류 본문. 상태별 화면 이동은 호출 화면에서 결정한다. */
export type ApiFailure = {
  kind: "api-error";
  status: number;
  code: string;
  message: string;
  details?: {
    violations?: { field: string; reason: string }[];
    existingRequestId?: string;
    /**
     * 발행 거부(409 `CONFIRMATION_REQUIRED`·`SOURCE_RESTRICTED`·`CATCH_PRIVATE`, 400 추출 미완료)가 가리키는 자료(계약 P-2).
     * 12월 U4의 `catchIds`는 api가 더는 보내지 않아 옮기지 않는다(발행 프리셋 U2 NFR4.3).
     */
    blockedSources?: BlockedSource[];
  };
};

export type ApiResult =
  | { kind: "success"; status: number; data: unknown }
  | ApiFailure
  | { kind: "lookup-failed"; status: number | null; code: "LOOKUP_FAILED" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const BLOCKED_KINDS: readonly string[] = ["CATCH", "TEXT_MATERIAL", "PDF_MATERIAL"];
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** 막힘 줄 하나: 두 ID는 빈 글자가 아닌 글자, 종류는 정해진 셋 가운데 하나(발행 프리셋 U2 NFR4.2). */
function isBlockedSource(value: unknown): value is BlockedSource {
  return isRecord(value) && nonEmpty(value.presetId) && nonEmpty(value.sourceId)
    && typeof value.kind === "string" && BLOCKED_KINDS.includes(value.kind);
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
      const { violations, existingRequestId, blockedSources } = body.details;
      if (violations !== undefined && (!Array.isArray(violations) || !violations.every((item) =>
        isRecord(item) && typeof item.field === "string" && typeof item.reason === "string"))) {
        return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
      }
      if (existingRequestId !== undefined && (typeof existingRequestId !== "string" || existingRequestId.length === 0)) {
        return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
      }
      if (blockedSources !== undefined && (!Array.isArray(blockedSources) || !blockedSources.every(isBlockedSource))) {
        return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
      }
      failure.details = {};
      if (Array.isArray(violations)) failure.details.violations = violations.map(({ field, reason }) => ({ field, reason }));
      if (typeof existingRequestId === "string") failure.details.existingRequestId = existingRequestId;
      // 세 칸만 옮기고 남는 속성은 버린다(NFR4.2).
      if (Array.isArray(blockedSources)) {
        failure.details.blockedSources = blockedSources.map(({ presetId, kind, sourceId }: BlockedSource) => ({ presetId, kind, sourceId }));
      }
    }
    return failure;
  } catch {
    return { kind: "lookup-failed", status, code: "LOOKUP_FAILED" };
  }
}
