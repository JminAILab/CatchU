// 지키는 fetch: Claude SDK에 넘기는 fetch를 늘 감싸 redirect와 큰 응답 본문을 막는다(U1 비기능 NFR2.2 ②③).
// 받은 fetch(기본은 전역 fetch)가 실제 전송을 하고, 이 함수는 결과만 검사한다.

/** 응답 본문 상한. 압축을 푼 뒤의 바이트 수로 센다(fetch가 돌려주는 본문은 이미 압축이 풀려 있다). */
export const MAX_RESPONSE_BODY_BYTES = 256 * 1024;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type GuardedFetchFailure = 'REDIRECT_REJECTED' | 'RESPONSE_TOO_LARGE';

/** 지키는 fetch가 낸 실패. 메시지에 주소·본문을 넣지 않는다. */
export class GuardedFetchError extends Error {
  override readonly name = 'GuardedFetchError';

  constructor(readonly failure: GuardedFetchFailure) {
    super(failure === 'REDIRECT_REJECTED' ? 'redirect 응답을 따라가지 않습니다.' : '응답 본문이 상한을 넘었습니다.');
  }
}

/**
 * redirect를 따라가지 않게 요청하고(redirect: 'manual'), 3xx 응답이면 실패로 끝낸다.
 * 본문은 조각마다 세면서 넘기고, 합이 상한을 넘는 순간 원래 본문 읽기를 멈추고 실패로 끝낸다.
 */
export function createGuardedFetch(baseFetch: FetchLike = globalThis.fetch, maxBodyBytes = MAX_RESPONSE_BODY_BYTES): FetchLike {
  return async (input, init) => {
    const response = await baseFetch(input, { ...init, redirect: 'manual' });
    if (isRedirect(response)) {
      await response.body?.cancel();
      throw new GuardedFetchError('REDIRECT_REJECTED');
    }
    if (response.body === null) return response;
    return new Response(limitBody(response.body, maxBodyBytes), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function isRedirect(response: Response): boolean {
  return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
}

function limitBody(body: ReadableStream<Uint8Array>, maxBodyBytes: number): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let receivedBytes = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      receivedBytes += value.byteLength;
      if (receivedBytes > maxBodyBytes) {
        // 실패를 먼저 확정하고 원래 본문을 닫는다. 닫기 실패는 이미 낸 실패를 바꾸지 않는다.
        controller.error(new GuardedFetchError('RESPONSE_TOO_LARGE'));
        await reader.cancel();
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
