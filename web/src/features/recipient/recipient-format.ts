import { formatKst } from "../publications/publication-format.ts";
import type { UnlockSnapshot } from "./recipient-store.ts";

/** 링크 불가 공통 문구(계약 C-12, BR6.1). 없음·삭제·중지·만료·작성자 비활성을 구분하지 않는다(#416 OQ-U4-NFR-6 결정). */
export const LINK_UNAVAILABLE_TEXT = "이 링크는 열람할 수 없습니다.";
/** 비밀번호 입력 화면의 U4 제목. 이 화면과 접근 불가 화면의 안내는 U4가 한다(C-11 slot 0). */
export const PASSWORD_REQUIRED_TITLE = "비밀번호가 필요한 링크입니다";
/** 조회 실패 화면의 숨긴 제목(초점 대상). */
export const LOOKUP_FAILED_TITLE = "발행본";

/**
 * U4 고정 안내(BR7.1)의 축소 문구. 발행 시각 표시만 둔다(보안 요구사항 G5·G6): "발행 당시 자료로 고정했고 원본 변경이 반영되지 않는다"는
 * 설명은 U2 `fixed-copy`가, 링크 기간·중지는 U2 `link-conditions`가 맡으므로 그 뜻을 다시 풀어 쓰는 문장을 두지 않는다. 시각 표기는 작성자
 * 발행본 상세와 같은 `formatKst`다.
 */
export const PUBLISHED_AT_LABEL = "발행 시각";
export function publishedAtText(publishedAt: string): string {
  return `${PUBLISHED_AT_LABEL} ${formatKst(publishedAt)}`;
}

/** 근거 원문은 GitHub의 https 주소만 새 탭 링크로 연다. 판정은 공용 `lib/github-source-url.ts`이며 작성자 발행본 상세와 같은 함수다(NFR1.11). */
export { isGithubSourceUrl } from "../../lib/github-source-url.ts";

/**
 * 비밀번호 단계의 안내. 비밀번호 오류는 서버가 불일치를 확인한 경우(`invalid`)에만 쓰고,
 * 통신 실패·시도 제한을 비밀번호 오류로 바꾸지 않는다(NFR6, 10월 「수신 접근」 그대로).
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
