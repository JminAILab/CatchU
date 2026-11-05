import type { PublicCatch } from "./recipient-api.ts";
import type { UnlockSnapshot } from "./recipient-store.ts";

/** 링크 불가 공통 문구(API 명세 「P — 수신자 API」). 없음·중단·만료·소유 회원 비활성을 구분하지 않는다. */
export const LINK_UNAVAILABLE_TEXT = "이 링크는 열람할 수 없습니다.";
/** 숨김·타인·없는 Catch 상세 공통 문구(API 명세). */
export const RESOURCE_UNAVAILABLE_TEXT = "현재 열람할 수 없는 자료입니다.";

export function hasGeneratedDraft(item: PublicCatch): boolean {
  return item.draft.status === "GENERATED" && item.draft.content !== null && item.draft.content.trim().length > 0;
}

const TITLE_NOTICE = "제목은 GitHub 기록의 글이거나 CatchU가 만든 글";
const DRAFT_NOTICE = "설명은 CatchU가 GitHub 기록에서 자동으로 만들었습니다";

/**
 * 자동 생성 안내(CR1 BR6.2). 제목은 작성자가 GitHub에 남긴 글(PR 제목·커밋 첫 줄)이거나 CatchU가 만든 글이다.
 * 있는 것만 가리키고, 둘 다 없으면 null이다. 목록처럼 특정 Catch가 없으면 두 절 문장 그대로다.
 * 회원 화면에만 붙는 불일치·공개 안내는 넣지 않는다.
 */
export function generatedNotice(item?: PublicCatch): string | null {
  const hasTitle = !item || item.title !== null;
  const hasDraft = !item || hasGeneratedDraft(item);
  if (hasTitle && hasDraft) return `${TITLE_NOTICE}이고, ${DRAFT_NOTICE}`;
  if (hasTitle) return `${TITLE_NOTICE}입니다`;
  return hasDraft ? DRAFT_NOTICE : null;
}

/** 설명 초안이 없을 때의 문구. 없는 설명을 다른 값으로 채우지 않는다. */
export function missingDraftText(item: PublicCatch): string {
  return item.draft.status === "FAILED"
    ? "설명 초안을 생성하지 못했습니다. 위의 사실과 근거는 확인할 수 있습니다."
    : "생성된 설명 초안이 없습니다.";
}

/** 근거 원문은 GitHub의 https 주소만 새 탭 링크로 연다. 판정은 공용 `lib/github-source-url.ts`로 옮겼고 동작은 같다(U4). */
export { isGithubSourceUrl } from "../../lib/github-source-url.ts";

/**
 * 비밀번호 단계의 안내. 비밀번호 오류는 서버가 불일치를 확인한 경우(`invalid`)에만 쓰고,
 * 통신 실패·시도 제한을 비밀번호 오류로 바꾸지 않는다(NFR6, web 기능 설계 「수신 접근」).
 */
export function unlockMessage(unlock: UnlockSnapshot, waitSeconds: number): { tone: "alert" | "status"; text: string } | null {
  switch (unlock.phase) {
    case "empty":
      return { tone: "alert", text: "비밀번호를 입력해 주세요." };
    case "invalid":
      return { tone: "alert", text: "비밀번호가 맞지 않습니다." };
    case "failed":
      return { tone: "alert", text: "비밀번호 확인을 완료하지 못했습니다. 다시 확인해 주세요." };
    case "limited":
      return waitSeconds > 0
        ? { tone: "alert", text: `비밀번호 확인 시도가 많아 잠시 막혀 있습니다. ${waitSeconds}초 뒤에 다시 시도할 수 있습니다.` }
        : { tone: "status", text: unlock.retryAt === null
          ? "비밀번호 확인 시도가 많아 잠시 막혀 있습니다. 잠시 뒤에 다시 시도해 주세요."
          : "이제 다시 시도할 수 있습니다." };
    case "submitting":
      return { tone: "status", text: "비밀번호를 확인하고 있습니다." };
    default:
      return unlock.reentry ? { tone: "status", text: "비밀번호를 다시 입력해 주세요." } : null;
  }
}
