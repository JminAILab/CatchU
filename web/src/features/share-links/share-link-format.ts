import type { ShareLink, ShareLinkState } from "./share-link-api.ts";

/** 상태는 아이콘만 쓰지 않고 글자로 함께 전달한다(공유링크 초안 §4.3). */
export const STATE_LABELS: Record<ShareLinkState, string> = {
  ACTIVE: "유효",
  STOPPED: "중단됨",
  EXPIRED: "만료됨",
};

const pad = (value: number) => String(value).padStart(2, "0");
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 서버 기준 시각을 `YYYY-MM-DD HH:mm:ss (KST)`로 표시한다(초안 §4.3.1 제안 형식).
 * 한국 표준시는 일광 절약 시간이 없어 UTC+09:00 고정으로 계산한다.
 */
export function formatKst(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "시각 정보 없음";
  const d = new Date(time + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} (KST)`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 유효 링크의 남은 기간 보조 표시. 24시간 이상은 일 단위 내림 ‘약 N일’, 미만은 ‘24시간 미만’.
 * 표시용일 뿐 접근 허용 판정을 대신하지 않는다. 유효가 아니거나 시각이 이미 지났으면 표시하지 않는다(null).
 */
export function remainingText(link: Pick<ShareLink, "state" | "expiresAt">, now: number): string | null {
  if (link.state !== "ACTIVE") return null;
  const left = Date.parse(link.expiresAt) - now;
  if (Number.isNaN(left) || left <= 0) return null;
  return left >= DAY_MS ? `약 ${Math.floor(left / DAY_MS)}일` : "24시간 미만";
}

/** 중단된 링크의 만료 시각도 지났으면 두 사실을 함께 보여 준다(초안 §4.3.1). */
export function alsoExpired(link: Pick<ShareLink, "state" | "expiresAt">, now: number): boolean {
  return link.state === "STOPPED" && Date.parse(link.expiresAt) <= now;
}
