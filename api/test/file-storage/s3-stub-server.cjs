// S3 요청 시간 제한 시험(#420)이 쓰는 로컬 대역 서버 둘. 실제 AWS가 아니며 127.0.0.1에서만 듣는다.
// - 무응답 대역: 연결과 요청은 받지만 응답을 한 바이트도 보내지 않는다(응답하지 않는 S3 흉내).
// - 응답 대역: 모든 요청에 빈 200을 바로 돌려준다(정상 응답 흉내, 객체는 저장하지 않는다).
// 자격은 시험용 고정 글자이고 실제 계정의 값이 아니다.
const http = require('node:http');
const net = require('node:net');
const { createS3Client } = require('../../dist/file-storage/s3-file-storage');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

/** 연결을 받아 요청을 읽기만 하고 응답하지 않는다. `connections()`는 받은 연결 수다(끊긴 시도마다 새 연결이 온다). */
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
  t.after(() => new Promise((resolve) => {
    for (const socket of sockets) socket.destroy();
    server.close(() => resolve());
  }));
  return { endpoint: `http://127.0.0.1:${port}`, connections: () => count };
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

module.exports = { startSilentServer, startAnsweringServer, stubClient };
