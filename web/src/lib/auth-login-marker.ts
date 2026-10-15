/**
 * 로그인 표식(#286 4-2, #251 T3). 같은 브라우저의 다른 탭에서 새 로그인이 있었는지 알아내기 위한 무작위 값이다.
 *
 * 합의(T3)
 * - 로그인에 성공한 탭이 무작위 표식(회원 정보·토큰 아님)을 `localStorage`에 쓴다. 각 탭은 자기가 아는 표식과 비교한다.
 * - 비교 시점은 갱신·회원 조회 요청 전과 응답 반영 직전, 탭이 다시 보일 때다. 표식이 다르면 새 로그인으로 처리한다.
 * - 표식을 읽을 수 없으면 같은 회원이어도 새 로그인으로 처리한다. `localStorage`를 쓸 수 없는 환경은 T4처럼 다중 탭 보장 범위 밖이다.
 * - JWT의 `sid`는 읽지 않는다. 이 값에는 토큰·회원 ID·세션 ID를 넣지 않는다.
 *
 * 기본 동작(합의만 적용)
 * - 읽기 실패는 언제든 `unreadable`(새 로그인으로 처리)이다. 비교할 때마다 다시 읽으므로 저장소가 복구되면 비교가 재개된다.
 * - 이 탭이 세션을 확인할 때(복원 성공) 표식을 읽지 못했거나, 로그인 성공 뒤 표식을 쓰지 못하면 기준값이 없다.
 *   이후 비교는 `unconfirmed`(같은 로그인인지 확인할 수 없음 → 새 로그인으로 처리)이다. 기준값은 다음 세션 확인(복원 성공·이 탭 로그인)에서만 다시 잡는다.
 * - 기준값은 불일치를 감지해도 지우지 않는다. 그래서 감지 뒤에도 비교 결과(`same`·`changed`)를 계속 알 수 있다.
 * - 표식 불일치는 감지 기록과 이전 세대 무효화일 뿐이다. 새 세션 확인·재전송 허용·상태 전환은 하지 않는다(auth-state.ts `invalidateByLoginMarker`).
 * - 이 표식은 다른 탭의 로그인을 알아차리는 수단일 뿐이다. 쿠키 경쟁·탭 종료 뒤 재전송(W4)은 이 표식으로 해결되지 않는다.
 */

/** 같은 출처의 모든 탭이 함께 쓰는 `localStorage` 키. 값은 무작위 32자리 16진수다. */
export const LOGIN_MARKER_KEY = "catchu.auth.login-marker";

/** `localStorage`에서 쓰는 부분. 시험에서는 대역을 넣는다. 접근이 예외를 던질 수 있다. */
export type MarkerStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * 비교 결과.
 * - `no-session`: 이 탭이 아직 세션을 확인한 적이 없다(첫 복원·로그인 전). 비교할 것이 없다.
 * - `same`: 같은 로그인.
 * - `changed`: 다른 로그인이 표식을 바꿨거나 표식이 사라졌다. 새 로그인으로 처리한다.
 * - `unreadable`: 지금 읽을 수 없다. 새 로그인으로 처리한다(T3).
 * - `unconfirmed`: 이 탭이 세션을 확인할 때 기준값을 얻지 못해 같은 로그인인지 확인할 수 없다. 새 로그인으로 처리한다(T3).
 */
export type MarkerComparison = "no-session" | "same" | "changed" | "unreadable" | "unconfirmed";

/** 잠금 안에서 읽어 둔 값. 복원 성공 때 이 값을 이 탭의 표식으로 삼는다. */
export type MarkerReading = { readonly ok: true; readonly value: string | null } | { readonly ok: false };

export type LoginMarker = {
  /** 이 탭의 로그인 성공 직후(잠금 안): 새 표식을 쓰고 기억한다. 쓰기에 실패하면 false이며 기준값이 없다(`unconfirmed`). */
  issue(): boolean;
  /** 지금 저장된 값을 읽는다(비교·복원용). 읽기 실패면 `{ ok: false }`. */
  read(): MarkerReading;
  /** 복원 성공: 잠금 안에서 읽어 둔 값을 이 탭의 표식으로 삼는다. 읽기 실패였으면 기준값이 없다(`unconfirmed`). */
  adopt(reading: MarkerReading): void;
  /** 비교한다. 상태는 바꾸지 않는다. 기준값이 있으면 매번 저장소를 다시 읽는다. */
  compare(): MarkerComparison;
  /** 이 탭이 아는 표식 값. 기준값이 없거나 값이 없으면 null. 다른 탭 로그아웃이 같은 로그인인지 확인할 때만 쓴다(5단계). */
  known(): string | null;
};

export type LoginMarkerOptions = {
  /** 기본값은 `browserMarkerStorage()`. null이면 접근할 수 없는 환경이며, 읽기·쓰기는 항상 실패로 본다. */
  storage?: MarkerStorage | null;
  /** 시험용. 기본값은 `crypto.getRandomValues`로 만든 32자리 16진수. */
  random?: () => string;
};

/** 이 브라우저의 `localStorage`. 서버 렌더링이거나 접근 자체가 예외면 null. */
export function browserMarkerStorage(): MarkerStorage | null {
  try {
    const storage = (globalThis as { localStorage?: unknown }).localStorage;
    if (typeof storage !== "object" || storage === null) return null;
    const candidate = storage as Partial<MarkerStorage>;
    return typeof candidate.getItem === "function" && typeof candidate.setItem === "function" ? (storage as MarkerStorage) : null;
  } catch {
    return null;
  }
}

function randomMarker(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Known = { kind: "none" } | { kind: "value"; value: string | null } | { kind: "unconfirmed" };

export function createLoginMarker(options: LoginMarkerOptions = {}): LoginMarker {
  const storage = options.storage === undefined ? browserMarkerStorage() : options.storage;
  const random = options.random ?? randomMarker;
  let known: Known = { kind: "none" };

  const read = (): MarkerReading => {
    if (!storage) return { ok: false };
    try {
      return { ok: true, value: storage.getItem(LOGIN_MARKER_KEY) };
    } catch {
      return { ok: false };
    }
  };

  return {
    issue() {
      const value = random();
      try {
        if (!storage) throw new Error("storage unavailable");
        storage.setItem(LOGIN_MARKER_KEY, value);
        known = { kind: "value", value };
        return true;
      } catch {
        known = { kind: "unconfirmed" }; // 쓰지 못했으므로 저장소의 값은 이 로그인의 것이 아니다.
        return false;
      }
    },
    read,
    adopt(reading) {
      known = reading.ok ? { kind: "value", value: reading.value } : { kind: "unconfirmed" };
    },
    compare() {
      if (known.kind === "none") return "no-session";
      const now = read(); // 매번 다시 읽는다. 저장소가 복구되면 비교가 재개된다.
      if (!now.ok) return "unreadable";
      if (known.kind === "unconfirmed") return "unconfirmed";
      return now.value === known.value ? "same" : "changed";
    },
    known: () => (known.kind === "value" ? known.value : null),
  };
}
