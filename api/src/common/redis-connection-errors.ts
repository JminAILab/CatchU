// Redis 연결 오류 기록. AiRun 큐 연결, U5 질문 횟수, U6 도구 호출 빈도가 함께 쓴다.
// ioredis는 error 수신기가 없으면 오류 원문과 스택을 표준 오류로 내고, 끊긴 동안 다시 붙을 때마다 error를 낸다.

/** on만 쓰므로 ioredis 연결과 시험용 가짜 연결이 함께 맞는다. */
export interface RedisConnectionEvents {
  on(event: 'error' | 'ready', listener: (error: Error) => void): unknown;
}

/** 같은 끊김이 이어지면 첫 오류만 onFirstError로 넘긴다. 다시 붙으면(ready) 다음 끊김의 첫 오류를 다시 넘긴다. */
export function watchRedisErrors<T extends RedisConnectionEvents>(connection: T, onFirstError: (error: Error) => void): T {
  let reported = false;
  connection.on('ready', () => { reported = false; });
  connection.on('error', (error: Error) => {
    if (reported) return;
    reported = true;
    onFirstError(error);
  });
  return connection;
}
