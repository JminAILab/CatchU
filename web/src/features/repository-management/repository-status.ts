import type { AnalysisSummary, Application, EligibleRepository } from "./repository-api.ts";

/**
 * 연결된 저장소의 상태 표시 규칙(#153). web 기능 설계 「내 자산 화면 구조」·「화면 상태 전이」와
 * #153 입출력 제안의 아이콘 표를 따른다. 재요청 가능 여부는 화면이 판단하지 않고 서버의 retry.allowed만 따른다.
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

export function statusIcon(status: Pick<AnalysisSummary, "processing" | "application">): StatusIcon {
  const { processing, application } = status;
  if (processing === "FAILED") return "failed";
  if (processing === "QUEUED" || processing === "RUNNING" || processing === "UNCERTAIN") return "analyzing";
  // 처리가 끝나도 서비스 반영(APPLIED) 전에는 결과를 볼 수 없으므로 분석 중으로 묶는다(반영 실패·복구 포함).
  if (application !== "APPLIED") return "analyzing";
  return processing === "PARTIAL_FAILED" ? "partial" : "success";
}

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

/** 아코디언을 펼쳤을 때의 설명 문장. 실행 불명·반영 실패·복구를 분석 실패나 재요청 가능 상태로 쓰지 않는다. */
export function statusDetails(status: AnalysisSummary): string[] {
  const lines: string[] = [];
  const catchCount = status.ownerResultsReady ? status.registeredCatchIds.length : 0;
  switch (status.processing) {
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
  if ((status.processing === "FAILED" || status.processing === "PARTIAL_FAILED") && status.failures.length > 0) {
    lines.push(...status.failures.map((failure) => `실패한 부분: ${failure.message}`));
  }
  if (status.retryAllowed) lines.push("새로 동의하고 다시 요청할 수 있습니다.");
  return lines;
}
