// S3 요청 시간 제한 시험(#420)이 쓰는 로컬 대역 서버 둘. 실제 AWS가 아니며 127.0.0.1에서만 듣는다.
// - 무응답 대역: 연결과 요청은 받지만 응답을 한 바이트도 보내지 않는다(응답하지 않는 S3 흉내).
// - 응답 대역: 모든 요청에 빈 200을 바로 돌려준다(정상 응답 흉내, 객체는 저장하지 않는다).
// 자격은 시험용 고정 글자이고 실제 계정의 값이 아니다.
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { S3_REQUEST_LIMITS, createS3Client } = require('../../dist/file-storage/s3-file-storage');

/**
 * 응답하지 않는 대역 시험이 쓰는 줄인 제한. 실제 값에서 연결 제한 5초 → 1초, 유휴 제한 15초 → 300 ms로 줄이고 총 시도 2회는 그대로 둔다.
 * 실제 값으로는 호출 하나가 30초를 넘게 걸려 시험마다 기다릴 수 없어서다.
 */
const SHORT_LIMITS = Object.freeze({ connectionTimeoutMs: 1_000, socketTimeoutMs: 300, maxAttempts: S3_REQUEST_LIMITS.maxAttempts });
/** 줄인 제한에서 호출 하나가 끝나야 하는 시간. 유휴 제한 × 시도 횟수에 시도 사이 대기와 느린 CI의 여유를 더했다. */
const SHORT_BOUND_MS = 8_000;

/**
 * promise가 ms 안에 끝나지 않으면 기다리기를 그만두고 시험을 실패시킨다(시험 자체의 시간 제한이며 제품 동작이 아니다).
 * 끝나지 않은 요청 자체는 호출한 시험이 대역과 클라이언트를 닫아 끊는다.
 */
function settleWithin(promise, ms, label) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new assert.AssertionError({ message: `${label}: ${ms}ms 안에 끝나지 않았다` })), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

/**
 * 연결을 받아 요청을 읽기만 하고 응답하지 않는다. `connections()`는 받은 연결 수, `openSockets()`는 지금 열린 소켓 수다
 * (끊긴 시도마다 새 연결이 온다). `close()`는 열린 소켓을 모두 끊고 듣기를 멈춘다(여러 번 불러도 된다). 시험이 끝나면 불린다.
 */
async function startSilentServer(t) {
  const sockets = new Set();
  let count = 0;
  const server = net.createServer((socket) => {
    count += 1;
    sockets.add(socket);
    socket.on('data', () => {});
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  const port = await listen(server);
  let closed = null;
  const close = () => {
    // 듣기를 멈추고, 열린 소켓마다 닫힘 이벤트까지 기다린다(서버의 닫힘 콜백은 소켓의 닫힘 이벤트보다 먼저 올 수 있다).
    closed ??= Promise.all([
      new Promise((resolve) => { server.close(() => resolve()); }),
      ...[...sockets].map((socket) => new Promise((resolve) => {
        socket.once('close', () => resolve());
        socket.destroy();
      })),
    ]);
    return closed;
  };
  t.after(close);
  return { endpoint: `http://127.0.0.1:${port}`, connections: () => count, openSockets: () => sockets.size, close };
}

/** 모든 요청에 빈 200을 돌려준다. `requests()`는 받은 요청의 메서드와 경로다. */
async function startAnsweringServer(t) {
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push({ method: request.method, path: request.url.split('?')[0] });
    request.resume();
    request.on('end', () => response.writeHead(200, { 'Content-Length': '0' }).end());
  });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  }));
  return { endpoint: `http://127.0.0.1:${port}`, requests: () => seen };
}

/** 대역 주소를 보는 S3 클라이언트. `limits`를 주지 않으면 실제 실행과 같은 S3_REQUEST_LIMITS다. */
function stubClient(t, endpoint, limits) {
  const client = createS3Client({
    endpoint,
    region: 'ap-northeast-2',
    forcePathStyle: true,
    credentials: { accessKeyId: 'catchu-test-access', secretAccessKey: 'catchu-test-secret' },
  }, limits);
  t.after(() => client.destroy());
  return client;
}

module.exports = { SHORT_BOUND_MS, SHORT_LIMITS, settleWithin, startSilentServer, startAnsweringServer, stubClient };
