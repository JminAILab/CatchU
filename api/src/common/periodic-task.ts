export interface PeriodicTaskOptions {
  /** 로그에 쓰는 작업 이름. */
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
  /** 한 번의 실행이 예외로 끝났을 때. 원문 메시지 대신 오류 이름만 받는다. */
  failed: (name: string, errorName: string) => void;
}

/**
 * api 안의 주기 실행 장치(#237). 한 번이 끝난 뒤 다음 실행을 예약하므로 실행이 겹치지 않는다.
 * 실행이 실패해도 다음 주기는 계속된다. stop()은 진행 중인 실행이 끝날 때까지 기다린다.
 */
export class PeriodicTask {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopped = true;

  constructor(private readonly options: PeriodicTaskOptions) {
    if (!Number.isInteger(options.intervalMs) || options.intervalMs <= 0) {
      throw new Error(`${options.name} 주기는 양의 정수(ms)여야 합니다.`);
    }
  }

  /** 첫 실행은 한 주기 뒤다. 이미 시작했으면 아무것도 하지 않는다. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.running;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.running = this.runOnce().finally(() => {
        this.running = null;
        this.schedule();
      });
    }, this.options.intervalMs);
    // 이 타이머만으로 프로세스를 붙잡지 않는다. 서버 종료는 HTTP 서버와 종료 훅이 정한다.
    this.timer.unref();
  }

  private async runOnce(): Promise<void> {
    try {
      await this.options.run();
    } catch (error) {
      this.options.failed(this.options.name, error instanceof Error ? error.name : 'UnknownError');
    }
  }
}
