import type { PublicationState } from "./publications-api.ts";

/** 상태는 아이콘 없이 글자로 전달한다(10월 공유 링크 표기와 같은 말). */
export const PUBLICATION_STATE_LABELS: Record<PublicationState, string> = {
  ACTIVE: "유효",
  STOPPED: "중지됨",
  EXPIRED: "만료됨",
};

export const PASSWORD_TEXT = { protected: "설정됨", none: "없음" } as const;

export function passwordText(passwordProtected: boolean): string {
  return passwordProtected ? PASSWORD_TEXT.protected : PASSWORD_TEXT.none;
}

const pad = (value: number) => String(value).padStart(2, "0");
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 서버 기준 시각을 `YYYY-MM-DD HH:mm:ss (KST)`로 표시한다(10월 공유 링크 화면과 같은 형식). 한국 표준시는 일광 절약 시간이 없어
 * UTC+09:00 고정으로 계산한다. 10월 `share-links/share-link-format.ts`는 제출 3(W6)에서 지워지므로 여기에 따로 둔다.
 */
export function formatKst(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "시각 정보 없음";
  const d = new Date(time + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} (KST)`;
}

/** 고정 안내(BR7.2). 작성자 발행본 상세에 항상 보인다. */
export const FIXED_COPY_NOTICE = "이 발행본은 발행 시각의 자료를 고정한 사본이라 원본을 고쳐도 반영되지 않습니다. 고친 내용을 전달하려면 새로 발행하고, 제공을 끝내려면 링크를 중지하세요.";
/** 저장소 비공개 전환 안내(BR7.3). */
export const SOURCE_PRIVATE_NOTICE = "원본 저장소를 비공개로 바꿔도 이 발행본은 남습니다. 제공을 끝내려면 링크를 중지하거나 발행본을 삭제하세요.";
/** 비공개 Catch를 고를 때의 안내(BR4.4). 실제 전환은 발행 트랜잭션 안에서만 일어난다. */
export const PRIVATE_CATCH_NOTICE = "발행하면 이 Catch는 공개로 바뀝니다";
/** 확인 단계의 만료 안내(BR4.6). */
export const EXPIRY_NOTICE = "링크는 발행 시각부터 90일 뒤 만료되며 연장할 수 없습니다.";
