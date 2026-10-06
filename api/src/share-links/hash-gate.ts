/**
 * unlock 경로 전체의 비밀번호 해시 자원 상한(#150 10/4 보안 의견에 따른 메모리·대기열 상한).
 *
 * - **실행 중 해시(`maxRunning`):** 동시에 계산하는 scrypt 수. scrypt는 Node의 libuv 스레드 풀(기본 4개)에서 돌고
 *   1회에 약 32 MiB를 쓴다. 같은 풀을 쓰는 파일·DNS 작업을 막지 않도록 일부만 쓴다. 발급 API의 해시는 세지 않는다.
 * - **대기(`maxWaiting`):** 처리 중이지만 해시를 계산하지 않는 unlock 요청 수(같은 링크·주소 차례 대기와 해시 차례 대기의 합).
 *   진행 중 요청은 `maxRunning + maxWaiting`개를 넘지 않고, 넘치면 검사 없이 거절한다(`UnlockSaturatedError`).
 * - 이 상한은 링크 구분 없이 걸린다. 한 링크에 몰린 요청이 다른 링크의 unlock도 잠시 거절하게 만들 수 있다.
 * - 처리 시간은 해시 시간에 따라 달라지는 추정이다. 로컬 측정(2026-09-30)에서 해시 1회는 약 90ms였다.
 */

export interface HashGateOptions {
  maxRunning: number;
  maxWaiting: number;
}

/** 진행 중 unlock이 상한에 닿았다. 검사하지 않고 거절한다. */
export class UnlockSaturatedError extends Error {
  constructor() {
    super('too many unlock attempts in progress');
  }
}

export interface HashTicket {
  /** 해시 차례를 기다렸다가 `work`를 실행하고, 끝나면(예외 포함) 차례를 넘긴다. */
  runHash<T>(work: () => Promise<T>): Promise<T>;
  /** 진행 중 자리를 돌려준다. 여러 번 불러도 한 번만 돌려준다. */
  leave(): void;
}

export class HashGate {
  private active = 0;
  private running = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly options: HashGateOptions) {}

  /** 요청을 받을 때 진행 중 자리를 잡는다. 자리가 없으면 UnlockSaturatedError. */
  enter(): HashTicket {
    if (this.active >= this.options.maxRunning + this.options.maxWaiting) throw new UnlockSaturatedError();
    this.active += 1;
    let left = false;
    return {
      runHash: (work) => this.run(work),
      leave: () => {
        if (left) return;
        left = true;
        this.active -= 1;
      },
    };
  }

  /** 시험·진단용. */
  get stats(): { active: number; running: number; waiting: number } {
    return { active: this.active, running: this.running, waiting: this.waiters.length };
  }

  private async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running < this.options.maxRunning) this.running += 1;
    else await new Promise<void>((resolve) => this.waiters.push(resolve)); // 넘겨받은 차례는 running에 이미 포함돼 있다
    try {
      return await work();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.running -= 1;
    }
  }
}
