// E 수신 저장소의 실험용 파일 대역. api 테스트의 MemoryReceiverStore와 같은 순서(요청 단위 직렬화 →
// 판정 → 커밋 뒤에만 응답)를 따르되, E 프로세스를 강제 종료·재기동해도 상태가 남도록 파일에 쓴다.
// 실제 DB 저장·반영(#104·#105) 구현이 아니다.
const { existsSync, readFileSync } = require('node:fs');
const { writeJsonDurable } = require('./common.cjs');

class FileReceiverStore {
  constructor(path, acceptedContext) {
    this.path = path;
    if (!existsSync(path)) {
      writeJsonDurable(path, {
        context: acceptedContext, processing: 'QUEUED', application: 'NOT_READY', received: null, observations: [],
      });
    }
    this.tail = Promise.resolve();
  }

  read() {
    return JSON.parse(readFileSync(this.path, 'utf8'));
  }

  async withRequest(requestId, work) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const draft = this.read();
      const found = draft.context.requestId === requestId;
      const response = await work({
        snapshot: found ? structuredClone(draft) : null,
        saveObservation: async (event, processing) => {
          draft.observations.push({ state: event.state, messageId: event.messageId });
          draft.processing = processing;
        },
        saveResult: async (metadata, state) => {
          draft.received = metadata;
          Object.assign(draft, state);
        },
      });
      writeJsonDurable(this.path, draft);
      return response;
    } finally { release(); }
  }
}

module.exports = { FileReceiverStore };
