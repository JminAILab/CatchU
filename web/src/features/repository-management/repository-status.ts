import type { AnalysisFailure, AnalysisSummary, Application, EligibleRepository } from "./repository-api.ts";

/**
 * 연결된 저장소의 상태 표시 규칙(#153). web 기능 설계 「내 자산 화면 구조」·「화면 상태 전이」와
 * #153 입출력 제안의 아이콘 표를 따른다. 닫힌 반영 실패의 실패 표시·종료 사유는 #288. 재요청 가능 여부는 화면이 판단하지 않고 서버의 retry.allowed만 따른다.
 */

export type StatusIcon = "analyzing" | "success" | "partial" | "failed";

export const STATUS_LABEL: Record<StatusIcon, string> = {
  analyzing: "분석 중",
  success: "성공",
  partial: "부분 실패",
  failed: "실패",
};

export type ConnectedRepository = {
  repositoryId: string;
  /** 선정 목록에서 찾은 표시 이름. 못 찾으면 null(식별자로 대신 표시). */
  displayName: string | null;
  latest: AnalysisSummary;
};

const time = (value: string) => Date.parse(value);

/**
 * 저장소별 최신 요청 하나를 고른다. submittedAt이 가장 늦은 요청, 같으면 updatedAt이 늦은 요청, 둘 다 같으면 먼저 받은 요청을 유지한다.
 * 기준은 E 담당 확인(#187 리뷰, 2026-10-06).
 */
export function latestByRepository(analyses: readonly AnalysisSummary[]): Map<string, AnalysisSummary> {
  const latest = new Map<string, AnalysisSummary>();
  for (const item of analyses) {
    const current = latest.get(item.repositoryId);
    if (!current) { latest.set(item.repositoryId, item); continue; }
    const bySubmit = time(item.submittedAt) - time(current.submittedAt);
    if (bySubmit > 0 || (bySubmit === 0 && time(item.updatedAt) > time(current.updatedAt))) latest.set(item.repositoryId, item);
  }
  return latest;
}

export function repositoryDisplayName(repository: EligibleRepository): string {
  return repository.ownerLogin ? `${repository.ownerLogin}/${repository.name}` : repository.name;
}

/** 분석 접수 이력이 있는 저장소 = 연결된 저장소. 최근 요청 순으로 정렬한다. 이름은 선정 목록과 식별자로 합친다. */
export function connectedRepositories(
  repositories: readonly EligibleRepository[],
  analyses: readonly AnalysisSummary[],
): ConnectedRepository[] {
  const names = new Map(repositories.map((repository) => [repository.repositoryId, repositoryDisplayName(repository)]));
  return [...latestByRepository(analyses).values()]
    .sort((a, b) => time(b.submittedAt) - time(a.submittedAt))
    .map((latest) => ({ repositoryId: latest.repositoryId, displayName: names.get(latest.repositoryId) ?? null, latest }));
}

/**
 * 요청이 닫혔는데(CLOSED) 반영 완료(APPLIED)가 아니다 = 반영 실패로 닫힌 요청(#288). 서버가 더 반영하지 않으므로 분석 중에 두지 않는다.
 * 처리 결과(processing)는 바꾸지 않고, 처리 실패(FAILED)와 다른 반영 실패 문구로 구분한다.
 */
export function isClosedUnapplied(status: Pick<AnalysisSummary, "lifecycle" | "application">): boolean {
  return status.lifecycle === "CLOSED" && status.application !== "APPLIED";
}

export function statusIcon(status: Pick<AnalysisSummary, "lifecycle" | "processing" | "application">): StatusIcon {
  const { processing, application } = status;
  if (processing === "FAILED") return "failed";
  if (isClosedUnapplied(status)) return "failed";
  if (processing === "QUEUED" || processing === "RUNNING" || processing === "UNCERTAIN") return "analyzing";
  // 닫히기 전(ACTIVE)에는 처리가 끝나도 서비스 반영(APPLIED) 전까지 결과를 볼 수 없으므로 분석 중으로 묶는다(반영 실패·복구 포함).
  if (application !== "APPLIED") return "analyzing";
  return processing === "PARTIAL_FAILED" ? "partial" : "success";
}

/**
 * 반영 대기 중 처리 시한을 넘겨 닫혔다는 서버 기록(계약: failures의 stage APPLICATION, code PROCESSING_DEADLINE_EXCEEDED).
 * 다른 단계의 실패(수집·생성·전달 단계의 시한 초과 포함)나 업무 거부 같은 다른 반영 실패 code는 종료 사유로 쓰지 않는다.
 */
const isApplicationDeadline = (failure: AnalysisFailure) =>
  failure.stage === "APPLICATION" && failure.code === "PROCESSING_DEADLINE_EXCEEDED";

const CLOSED_UNAPPLIED_TEXT = "결과를 서비스에 반영하지 못하고 요청이 종료되었습니다. 분석 실패와는 다른 상태입니다.";
const APPLICATION_DEADLINE_TEXT = "종료 사유: 정해진 처리 시간 안에 결과를 반영하지 못했습니다.";

/** [이 저장소 Catch 보기]는 서버가 본인 열람 준비를 알리고 등록된 Catch가 있을 때만 보인다(W3). */
export function canShowCatches(status: Pick<AnalysisSummary, "ownerResultsReady" | "registeredCatchIds">): boolean {
  return status.ownerResultsReady && status.registeredCatchIds.length > 0;
}

const APPLICATION_TEXT: Partial<Record<Application, string>> = {
  NOT_READY: "분석이 끝나 결과를 반영할 준비를 하고 있습니다.",
  PENDING: "분석이 끝나 결과 반영을 기다리고 있습니다.",
  APPLYING: "분석 결과를 서비스에 반영하고 있습니다.",
  APPLY_FAILED: "분석은 끝났지만 결과를 서비스에 반영하지 못했습니다. 분석 실패와는 다른 상태입니다.",
  RECOVERING: "분석 결과 반영을 복구하고 있습니다.",
};

const FAILED_APPLICATION_TEXT: Partial<Record<Application, string>> = {
  PENDING: "실패 결과의 반영을 기다리고 있습니다.",
  APPLYING: "실패 결과를 반영하고 있습니다.",
  APPLY_FAILED: "실패 결과를 서비스에 반영하지 못했습니다.",
  RECOVERING: "실패 결과 반영을 복구하고 있습니다.",
};

/**
 * 아코디언을 펼쳤을 때의 설명 문장. 실행 불명·반영 실패·복구를 분석 실패나 재요청 가능 상태로 쓰지 않는다.
 * 재요청 안내는 서버의 retry.allowed만 따른다(상태 필드나 retry.reason으로 다시 계산하지 않는다).
 */
export function statusDetails(status: AnalysisSummary): string[] {
  const lines: string[] = [];
  const catchCount = status.ownerResultsReady ? status.registeredCatchIds.length : 0;
  const closedUnapplied = isClosedUnapplied(status);
  // 종료 사유는 닫힌 반영 실패에서만 보인다. 닫히기 전에는 시한 판정이 없으므로 이 항목도 없다.
  const deadline = closedUnapplied && status.failures.some(isApplicationDeadline);
  // 닫힌 반영 실패: 처리 결과(성공·0건·부분 실패 등)와 관계없이 같은 반영 실패 안내와 종료 사유를 보인다.
  // 처리 실패(FAILED)는 아래의 처리 실패 문구를 그대로 쓰고 종료 사유만 덧붙인다.
  const processingText = closedUnapplied && status.processing !== "FAILED" ? "CLOSED_UNAPPLIED" : status.processing;
  switch (processingText) {
    case "CLOSED_UNAPPLIED":
      lines.push(CLOSED_UNAPPLIED_TEXT);
      if (deadline) lines.push(APPLICATION_DEADLINE_TEXT);
      break;
    case "QUEUED":
      lines.push("분석 요청이 접수되어 순서를 기다리고 있습니다.");
      break;
    case "RUNNING":
      lines.push("저장소를 분석하고 있습니다.");
      break;
    case "UNCERTAIN":
      lines.push("분석 실행이 아직 확인되지 않았습니다. 실패로 정해진 것은 아니며, 잠시 후 상태를 다시 확인해 주세요.");
      break;
    case "FAILED": {
      lines.push("분석에 실패했습니다.");
      const applied = FAILED_APPLICATION_TEXT[status.application];
      if (applied) lines.push(applied);
      if (deadline) lines.push(APPLICATION_DEADLINE_TEXT);
      break;
    }
    default: {
      if (status.application !== "APPLIED") {
        lines.push(APPLICATION_TEXT[status.application] ?? "분석 결과를 확인하고 있습니다.");
        break;
      }
      if (status.processing === "PARTIAL_FAILED") {
        lines.push(catchCount > 0
          ? `일부 결과만 제공되었습니다. 준비된 Catch ${catchCount}개를 볼 수 있습니다.`
          : "일부 결과만 제공되었고, 볼 수 있는 Catch는 없습니다.");
      } else {
        lines.push(catchCount > 0 ? `분석을 마쳤습니다. Catch ${catchCount}개가 준비되었습니다.` : "분석을 마쳤습니다. 검토할 Catch가 없습니다.");
      }
    }
  }
  if (status.processing === "FAILED" || status.processing === "PARTIAL_FAILED") {
    // 종료 사유로 따로 보인 반영 시한 항목은 처리 단계의 실패 목록에 다시 넣지 않는다.
    const parts = deadline ? status.failures.filter((failure) => !isApplicationDeadline(failure)) : status.failures;
    lines.push(...parts.map((failure) => `실패한 부분: ${failure.message}`));
  }
  if (status.retryAllowed) lines.push("새로 동의하고 다시 요청할 수 있습니다.");
  return lines;
}
