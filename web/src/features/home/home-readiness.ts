import type { GitHubState, Lookup } from "../repository-management/repository-api";
import { routes } from "../../lib/routes.ts";

/**
 * 로그인 홈의 준비 상태 판정(#155). 화면과 분리한 순수 함수다.
 * 입력은 `GET /v1/me`의 GitHub 연동 상태 조회 결과이며, 조회는 저장소 연결 관리(#153)의 `githubState()`를 그대로 쓴다.
 * - 조회 중·조회 실패는 미연동으로 바꾸지 않는다(홈 흐름 초안 §6.2).
 * - '저장소 연결 전'·'준비 완료'는 홈에 전달할 최소 데이터가 아직 정해지지 않아 판정하지 않는다.
 *   GitHub 연결됨은 저장소 연결 여부를 단정하지 않는 안내로만 보인다.
 */

export type HomeLookup = { state: "loading" } | Lookup<GitHubState>;

/** 연결 안내의 두 단계. 현재 단계만 진하게 보인다(9/16 회의 결정, 초안 §5.3·§5.4). */
export type HomeStep = "github" | "repository";

/**
 * 다음 행동.
 * - `link`: 이동한다.
 * - `unavailable`: 이동할 화면이 아직 없어 누를 수 없게 두고 `reason`을 함께 보인다.
 *   GitHub 연동 화면(`/profile/github`)은 #253 범위다. 그 전에는 이동하지 않는다(web README 「페이지 주소」).
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
    /** 화면에 보이는 연동 상태 이름. 세 상태가 서로 다르다. */
    status: string;
    /** 현재 단계. null이면 단계 표시를 하지 않는다. */
    step: HomeStep | null;
    title: string;
    description: string;
    action: HomeAction;
  };

export const HOME_STEPS: readonly { step: HomeStep; label: string }[] = [
  { step: "github", label: "GitHub 연결" },
  { step: "repository", label: "레포 연결" },
];

/** #253 GitHub 연동 화면이 연결되기 전 비활성 버튼의 이유. */
export const GITHUB_SCREEN_NOT_READY = "GitHub 연결 화면은 준비 중이라 아직 이동할 수 없습니다.";

export function homeView(lookup: HomeLookup): HomeView {
  if ("state" in lookup) return { kind: "loading" };
  if (lookup.kind !== "success") return { kind: "failed" };
  switch (lookup.data) {
    case "DISCONNECTED":
      return {
        kind: "guide",
        github: "DISCONNECTED",
        status: "GitHub 미연결",
        step: "github",
        title: "GitHub를 먼저 연결해 주세요",
        description: "분석을 요청하려면 먼저 프로필에서 GitHub를 연결해야 합니다. 연결한 뒤 내 자산에서 레포를 연결합니다.",
        action: { kind: "unavailable", label: "프로필에서 GitHub 연결", reason: GITHUB_SCREEN_NOT_READY },
      };
    case "REAUTH_REQUIRED":
      // 재연동 안내 방식은 초안 §6.2에서 [미정]이다. 미연동과 상태·문구를 구분하고 같은 연동 화면을 가리킨다.
      return {
        kind: "guide",
        github: "REAUTH_REQUIRED",
        status: "GitHub 재연결 필요",
        step: "github",
        title: "GitHub 연결을 다시 확인해 주세요",
        description: "연결된 GitHub를 다시 확인해야 저장소를 연결하고 분석을 요청할 수 있습니다.",
        action: { kind: "unavailable", label: "GitHub 다시 연결", reason: GITHUB_SCREEN_NOT_READY },
      };
    case "CONNECTED":
      // 연결된 repo(분석 접수 저장소) 유무는 아직 받지 않으므로 단계를 표시하지 않는다.
      return {
        kind: "guide",
        github: "CONNECTED",
        status: "GitHub 연결됨",
        step: null,
        title: "내 자산에서 분석할 레포를 관리해 보세요",
        description: "분석할 레포의 연결과 요청 상태는 내 자산의 저장소 연결 관리에서 확인합니다.",
        action: { kind: "link", label: "내 자산에서 저장소 연결 관리", href: routes.assets },
      };
  }
}
