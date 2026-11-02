import type { GitHubState, Lookup } from "../repository-management/repository-api";
import { routes } from "../../lib/routes.ts";

/**
 * 로그인 홈의 준비 상태 판정(#155). 화면과 분리한 순수 함수다.
 * 입력은 `GET /v1/me`의 GitHub 연동 상태와, 연결됨일 때만 읽는 `GET /v1/me/analysis-summary`의 접수 이력 유무다(`home-api.ts`).
 * - 조회 중·조회 실패는 미연동으로 바꾸지 않는다(홈 흐름 초안 §6.2). 연결됨에서 이력 유무만 조회하지 못해도 조회 실패다.
 * - 연결된 레포 = 분석 요청이 접수된 저장소 1개 이상(초안 §7.1, #155 합의). 이력이 없으면 레포 연결 단계(§5.4)로,
 *   있으면 준비 완료로 본다. 준비 완료는 분석이 끝났거나 지금 분석할 수 있다는 뜻이 아니다.
 */

/** 홈이 판정에 쓰는 사실. 접수 이력 유무는 GitHub 연결됨일 때만 읽는다(#155 합의: 이 값은 연결 상태에서만 쓴다). */
export type HomeStatus =
  | { github: "DISCONNECTED" | "REAUTH_REQUIRED" }
  | { github: "CONNECTED"; hasAcceptedAnalysisRepository: boolean };

export type HomeLookup = { state: "loading" } | Lookup<HomeStatus>;

/** 연결 안내의 두 단계. 현재 단계만 진하게 보인다(9/16 회의 결정, 초안 §5.3·§5.4). */
export type HomeStep = "github" | "repository";

/**
 * 다음 행동.
 * - `link`: 이동한다.
 * - `unavailable`: 지금은 할 수 없어 누를 수 없게 두고 `reason`을 함께 보인다.
 *   GitHub 연결 시작을 막은 환경(통합 시험 전환 꺼짐, #253)의 미연결·재연결 필요가 쓴다.
 */
export type HomeAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "unavailable"; label: string; reason: string };

export type HomeView =
  | { kind: "loading" }
  | { kind: "failed" }
  | {
    kind: "guide";
    /** 표시 컴포넌트·시험에서 상태를 구분하는 값. 화면 문구로 쓰지 않는다. */
    github: GitHubState;
    /** 준비 단계(GitHub 연결·레포 연결·준비 완료). 표시 컴포넌트·시험의 구분 값이며 화면 문구로 쓰지 않는다. */
    readiness: HomeStep | "ready";
    /** 화면에 보이는 연동 상태 이름. 네 상태가 서로 다르다. */
    status: string;
    /** 현재 단계. null이면 단계 표시를 하지 않는다. */
    step: HomeStep | null;
    title: string;
    /** 제목을 보충하는 설명. null이면 두지 않는다(준비 완료는 제목 한 줄로 충분하다). */
    description: string | null;
    action: HomeAction;
  };

export const HOME_STEPS: readonly { step: HomeStep; label: string }[] = [
  { step: "github", label: "GitHub 연결" },
  { step: "repository", label: "레포 연결" },
];

/**
 * `startBlockedReason`은 GitHub 연결 시작을 막는 이유다(#253 `githubStartBlockedReason`, 연동 화면과 같은 기준·문구).
 * null이면 미연결·재연결 필요가 연동 화면으로 보낸다. 막으면 같은 이름의 버튼을 누를 수 없게 두고 이유를 보인다.
 * 연결됨의 내 자산 이동은 그대로다.
 */
export function homeView(lookup: HomeLookup, startBlockedReason: string | null): HomeView {
  if ("state" in lookup) return { kind: "loading" };
  if (lookup.kind !== "success") return { kind: "failed" };
  const toGitHub = (label: string): HomeAction => startBlockedReason === null
    ? { kind: "link", label, href: routes.profileGithub }
    : { kind: "unavailable", label, reason: startBlockedReason };
  const status = lookup.data;
  switch (status.github) {
    case "DISCONNECTED":
      return {
        kind: "guide",
        github: "DISCONNECTED",
        readiness: "github",
        status: "GitHub 미연결",
        step: "github",
        title: "GitHub를 먼저 연결해 주세요",
        description: "분석을 요청하려면 먼저 프로필에서 GitHub를 연결해야 합니다. 연결한 뒤 내 자산에서 레포를 연결합니다.",
        action: toGitHub("프로필에서 GitHub 연결"),
      };
    case "REAUTH_REQUIRED":
      // 재연동 안내 방식은 초안 §6.2에서 [미정]이다. 미연동과 상태·문구를 구분하고 같은 연동 화면을 가리킨다.
      return {
        kind: "guide",
        github: "REAUTH_REQUIRED",
        readiness: "github",
        status: "GitHub 재연결 필요",
        step: "github",
        title: "GitHub 연결을 다시 확인해 주세요",
        description: "연결된 GitHub를 다시 확인해야 저장소를 연결하고 분석을 요청할 수 있습니다.",
        action: toGitHub("GitHub 다시 연결"),
      };
    case "CONNECTED":
      if (!status.hasAcceptedAnalysisRepository) {
        // 레포 연결 단계(초안 §5.4). 저장소 선택·동의·분석 요청은 내 자산에서 하며 홈은 이동만 한다.
        return {
          kind: "guide",
          github: "CONNECTED",
          readiness: "repository",
          status: "GitHub 연결됨",
          step: "repository",
          title: "분석할 레포를 연결해 주세요",
          description: "분석할 레포는 내 자산의 저장소 연결 관리에서 연결합니다. 저장소 선택·동의·분석 요청을 그곳에서 한 번에 진행합니다.",
          action: { kind: "link", label: "내 자산에서 레포 연결", href: routes.assets },
        };
      }
      // 준비 완료. 초안 §5.5의 두 상자 구성은 [제안·미채택]이라 연결 안내 틀에 내 자산 이동 하나만 둔다(문구는 제안).
      // 분석 완료·지금 분석 가능으로 안내하지 않는다(#155 합의).
      return {
        kind: "guide",
        github: "CONNECTED",
        readiness: "ready",
        status: "GitHub 연결됨 · 레포 연결됨",
        step: null,
        title: "분석 요청 내역은 내 자산의 저장소 연결 관리에서 확인해 보세요",
        description: null,
        action: { kind: "link", label: "내 자산으로 가기", href: routes.assets },
      };
  }
}
