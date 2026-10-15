// 큐 소비자 시험(#121 시험 14)용: api(#233)가 넣을 요청 작업을 Node BullMQ로 넣는다.
// BullMQ·ioredis는 큐 검증 키트(docs/queue-verification)에 고정한 판본을 그대로 쓴다.
// 사용: node node_add_request.cjs <redis URL> <접두사>  (표준 입력으로 Request JSON 한 개)
const { join } = require('node:path');
const kit = join(__dirname, '../../docs/queue-verification');
const { Queue } = require(require.resolve('bullmq', { paths: [kit] }));

async function main() {
  const [url, prefix] = process.argv.slice(2);
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const parsed = new URL(url);
  const queue = new Queue('analysis-requests', {
    prefix,
    connection: { host: parsed.hostname, port: Number(parsed.port || 6379), maxRetriesPerRequest: null },
  });
  // 계획 「큐 규격」의 요청 작업 옵션(#233이 넣는 값).
  await queue.add('Request', request, {
    jobId: request.attemptId,
    attempts: 1,
    removeOnComplete: { age: 7200 },
    removeOnFail: { age: 7200 },
    stackTraceLimit: 0,
  });
  await queue.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
