import type { ApiResult } from "./api-response.ts";

/** 생성 POST의 Idempotency-Key(API 명세 v1 「중복 요청」). */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export type IdempotencyKeyHolder = {
  /** 아직 확정되지 않은 요청의 키. 처음 부를 때 만들고, reset 전까지 같은 값을 돌려준다. */
  current(): string;
  /** 결과가 확정됐거나(isSettledResult) 입력이 바뀌어 새 요청이 될 때 부른다. */
  reset(): void;
};

/**
 * 같은 생성 요청을 다시 보낼 때 같은 키를 쓰게 붙잡아 둔다.
 * API 호출 함수는 자동으로 다시 보내지 않는다. 서버에 저장됐는지 알 수 없는 결과(조회 실패·5xx)에서는 reset하지 않고,
 * 사용자가 다시 누르면 같은 키로 보낸다. 새 키로 자동 재요청하지 않는다.
 */
export function createIdempotencyKeyHolder(generate: () => string = createIdempotencyKey): IdempotencyKeyHolder {
  let key: string | null = null;
  return {
    current() {
      key ??= generate();
      return key;
    },
    reset() {
      key = null;
    },
  };
}

/**
 * 재전송 키를 버려도 되는 결과인지. 성공과, 서버가 판정해 돌려준 4xx 업무 거부만 확정으로 본다.
 * 조회 실패(네트워크·형식 오류)와 5xx는 서버가 저장했는지 알 수 없으므로 키를 유지한다.
 */
export function isSettledResult(result: ApiResult): boolean {
  if (result.kind === "success") return true;
  return result.kind === "api-error" && result.status >= 400 && result.status < 500;
}
