// 합성 Claude의 돌아갈 주소(loopback 콜백). 승인 화면에서 승인·취소하면 브라우저가 이 주소로 온다.
// 받은 주소에는 code·state가 실리므로 시험 안에서 비교에만 쓰고 출력하지 않는다. 브라우저에 보이는 글에도 값을 싣지 않는다.
import { createServer } from 'node:http';

export async function listenForCallback(port) {
  let settle;
  const arrived = new Promise((resolve) => { settle = resolve; });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (request.method !== 'GET' || url.pathname !== '/oauth/callback') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('없는 주소입니다.');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      .end('합성 Claude가 승인 결과를 받았습니다.');
    settle(url.href);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    /** 브라우저가 돌아올 때까지 기다려 받은 주소를 돌려준다. */
    async received(timeoutMs = 30_000) {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('승인 화면에서 돌아갈 주소로 돌아오지 않았습니다.')), timeoutMs);
      });
      try {
        return await Promise.race([arrived, timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
