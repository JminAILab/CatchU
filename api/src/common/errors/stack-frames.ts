import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 500 오류 로그에 남길 코드 위치를 오류 메시지와 분리해 수집한다(#88, 9/28 팀장 결정: 예외 이름 + 코드 위치).
 *
 * V8은 `.stack`에 처음 접근할 때 `Error.prepareStackTrace(error, callSites)`를 부른다. 이때 받은 구조화된
 * 호출 위치(CallSite)에서 파일·줄·칸만 뽑아 오류별 WeakMap에 둔다. 필터는 수집을 위해 `.stack` 접근을
 * 유도하지만, 반환된 문자열을 파싱하거나 로그로 쓰지 않는다.
 *
 * 기록 범위(나머지는 자리표시자로 바꾼다):
 * - 함수·메서드·타입 이름은 기록하지 않는다. `name` 속성 변경이나 계산된 메서드 이름으로 실행 중에 바뀔 수 있다.
 * - 파일은 앱 루트(api/) 안의 파일과 `node:` 내부 모듈만 상대 경로로 기록한다. 그 밖의 경로는 `<external>`.
 * - eval·new Function 등 동적으로 만든 코드는 `<eval>`, 네이티브 호출은 `<native>`, 파일 정보가 없으면 `<unknown>`.
 */

const FRAMES = new WeakMap<object, readonly string[]>();
const COLLECTOR = Symbol.for('catchu.stackFrameCollector');
const APP_ROOT = resolve(__dirname, '..', '..', '..');

type Formatter = (error: Error, callSites: NodeJS.CallSite[]) => unknown;

/**
 * 수집 훅을 설치한다. 여러 번 불러도 한 번만 감싼다.
 * 기존 formatter의 반환값을 그대로 돌려주므로 `.stack` 문자열의 형식은 바뀌지 않는다.
 * 기존 formatter가 없는 실행 환경에서는 설치하지 않는다(기본 형식을 흉내 내지 않고, 위치 기록만 생략된다).
 */
export function installStackFrameCollector(): void {
  const previous = Error.prepareStackTrace as (Formatter & { [COLLECTOR]?: true }) | undefined;
  if (typeof previous !== 'function' || previous[COLLECTOR]) return;

  const collector = function (this: unknown, error: Error, callSites: NodeJS.CallSite[]): unknown {
    try {
      if (typeof error === 'object' && error !== null) FRAMES.set(error, callSites.map(describeCallSite));
    } catch {
      // 수집 실패는 위치 생략으로 처리하고 기존 형식 생성은 계속한다.
    }
    return previous.call(this, error, callSites);
  };
  Object.defineProperty(collector, COLLECTOR, { value: true });
  Error.prepareStackTrace = collector as typeof Error.prepareStackTrace;
}

/**
 * 오류의 코드 위치를 `    at 파일:줄:칸` 줄로 돌려준다. 수집 기록이 없으면(스택을 먼저 덮어쓴 경우,
 * 설치 전에 스택이 만들어진 경우, 수집 실패) 문자열 파싱으로 돌아가지 않고 undefined를 돌려준다.
 */
export function collectedFrames(error: Error): string | undefined {
  try {
    void error.stack; // 수집 훅 호출을 유도한다. 반환된 문자열은 읽지 않는다.
  } catch {
    return undefined;
  }
  const frames = FRAMES.get(error);
  return frames && frames.length > 0 ? frames.map((frame) => `    at ${frame}`).join('\n') : undefined;
}

function describeCallSite(site: NodeJS.CallSite): string {
  if (site.isEval()) return '<eval>';
  if (site.isNative()) return '<native>';
  const file = safeFile(site.getFileName());
  const line = site.getLineNumber();
  const column = site.getColumnNumber();
  if (file.startsWith('<') || line === null || column === null) return file;
  return `${file}:${line}:${column}`;
}

function safeFile(fileName: string | undefined | null): string {
  if (!fileName) return '<unknown>';
  if (/^node:[\w/.-]+$/.test(fileName)) return fileName;

  let path = fileName;
  if (path.startsWith('file://')) {
    try {
      path = fileURLToPath(path);
    } catch {
      return '<external>';
    }
  }
  if (!isAbsolute(path)) return '<external>';
  const inside = relative(APP_ROOT, path);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return '<external>';
  return inside.split('\\').join('/');
}
