import { isGithubSourceUrl, splitGithubLinks } from "./github-source-url.ts";

/**
 * 작성자 설명 속 GitHub 링크의 이름(새 Catch NC1 GithubLinkName, BR2.1~BR2.8, 계약 C7).
 * 링크 찾기는 `splitGithubLinks` 그대로이고, 이름은 원래 주소 글자만으로 화면에서 계산한다. 네트워크를 쓰지 않고 저장된 글·API 응답을 바꾸지 않는다(BR2.8).
 * React·화면 모듈을 불러오지 않는 순수 함수다. NC2는 이 파일에 본인 커밋 표지 판정을 더한다.
 */

/** 이름에서 지울 글자: 제어(Cc)와 보이지 않는 서식(Cf). 줄바꿈·탭·영폭 공백·방향 바꿈·BOM을 포함한다(보안 설계 1.3, NFR5.2). */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;
const COMMIT_ID = /^[0-9a-f]{7,40}$/i;
const LINE_RANGE = /^#L(\d+)-L(\d+)$/;
const SINGLE_LINE = /^#L(\d+)$/;
/** 커밋 화면의 바뀐 줄 주소 조각. 파일 자리는 경로의 SHA-256(64자)이고, 범위는 한쪽(L 또는 R)만 받는다. */
const DIFF_LINES = /^#diff-[0-9a-f]{64}(?:([LR])(\d+)|([LR])(\d+)-([LR])(\d+))$/;

const clean = (text: string) => text.replace(INVISIBLE, "");

/** 경로 마디 하나를 이름에만 풀어 쓴다. 풀리지 않는 마디는 원문 그대로다(BR2.5). */
function decoded(segment: string): string {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

/** 판본 자리: 16진수 7~40자면 앞 7자를 소문자로, 그 밖은 브랜치 이름이다(BR2.3). */
function revisionLabel(revision: string, commitWord: "판본" | "커밋"): string {
  return COMMIT_ID.test(revision) ? `${commitWord} ${revision.slice(0, 7).toLowerCase()}` : `브랜치 ${clean(decoded(revision))}`;
}

type Parsed = { owner: string; repository: string; kind: string; rest: string[]; hash: string };

/** 포트가 없고 경로가 `소유자/저장소/종류/…`인 주소만 읽는다. 그 밖은 null(주소 전체로 보임, 보안 설계 1.3의 1단계). */
function parse(url: string): Parsed | null {
  if (!isGithubSourceUrl(url) || /^https:\/\/github\.com:/i.test(url)) return null;
  const parsed = new URL(url);
  if (parsed.port !== "") return null;
  const segments = parsed.pathname.slice(1).split("/");
  // 한글 앞에서 끊긴 주소(`…/src/`)처럼 끝의 빗금 하나는 마디로 치지 않는다(AC2.3.2).
  if (segments.length > 1 && segments.at(-1) === "") segments.pop();
  if (segments.length < 3 || segments.some((segment) => segment.length === 0)) return null;
  const [owner, repository, kind, ...rest] = segments;
  return { owner, repository, kind, rest, hash: parsed.hash };
}

/**
 * 커밋 화면 바뀐 줄 조각의 이름 꼬리(「 · 바뀐 줄 16–23」·「 · 이전 줄 16」). 조각이 없으면 "", 표 밖 꼴(L·R 섞임, 줄 번호 없는 `#diff-…`)이면 null.
 * Step 15 확인 중 팀장 발견(2026-11-10): 줄 고정 주소보다 커밋 화면 주소가 얻기 쉽다. 이 주소에는 파일 이름이 없다.
 */
function commitLinesTail(hash: string): string | null {
  if (hash === "") return "";
  const match = DIFF_LINES.exec(hash);
  if (!match) return null;
  const [side, from, to] = match[1] ? [match[1], match[2], null] : match[3] === match[5] ? [match[3], match[4], match[6]] : [null, null, null];
  if (side === null) return null;
  return ` · ${side === "R" ? "바뀐 줄" : "이전 줄"} ${to === null ? from : `${from}–${to}`}`;
}

/** 표의 꼴과 정확히 맞는 주소의 이름 본체(BR2.2). 질의는 보지 않는다. 맞지 않으면 null. */
function nameBody({ kind, rest, hash }: Parsed): string | null {
  if (kind === "commit") {
    // NC2의 본인 커밋 표지는 「커밋 xxxxxxx」 바로 뒤, 줄 꼬리 앞에 붙는다.
    const tail = rest.length === 1 ? commitLinesTail(hash) : null;
    return tail === null ? null : `${revisionLabel(rest[0], "커밋")}${tail}`;
  }
  if (kind === "pull") return rest.length === 1 && /^\d+$/.test(rest[0]) && hash === "" ? `PR #${rest[0]}` : null;
  if ((kind !== "blob" && kind !== "tree") || rest.length < 2) return null;
  const leaf = clean(decoded(rest[rest.length - 1]));
  if (leaf.length === 0) return null;
  const revision = revisionLabel(rest[0], "판본");
  if (hash === "") return `${leaf} · ${revision}`;
  if (kind === "tree") return null;
  const range = LINE_RANGE.exec(hash);
  if (range) return `${leaf} · L${range[1]}–${range[2]} · ${revision}`;
  const line = SINGLE_LINE.exec(hash);
  return line ? `${leaf} · L${line[1]} · ${revision}` : null;
}

/**
 * 링크 이름(BR2.2~BR2.5). 표의 꼴과 맞지 않는 주소(포트·다른 조각·뒤 경로·경로 없는 `/tree/main` 등)는 주소 전체다.
 * 링크의 저장소가 근거 저장소와 대소문자 무시로 다르면 앞에 「소유자/저장소 · 」를 붙인다. 근거 저장소를 모르면 붙이지 않는다(BR2.4).
 * 이름은 보이는 글자일 뿐이고 링크 대상(`href`)은 늘 원래 주소다.
 */
export function githubLinkName(url: string, evidenceRepository: string | null): string {
  const parsed = parse(url);
  const body = parsed === null ? null : nameBody(parsed);
  if (parsed === null || body === null) return url;
  const repository = `${parsed.owner}/${parsed.repository}`;
  if (evidenceRepository === null || repository.toLowerCase() === evidenceRepository.toLowerCase()) return body;
  const prefix = clean(`${decoded(parsed.owner)}/${decoded(parsed.repository)}`);
  return `${prefix} · ${body}`;
}

/** 근거 저장소: Catch 근거 가운데 GitHub 주소인 첫 근거 주소의 `소유자/저장소`. 그런 근거가 없거나 저장소를 읽을 수 없으면 null(BR2.4). */
export function evidenceRepositoryOf(sourceUrls: readonly string[]): string | null {
  const first = sourceUrls.find(isGithubSourceUrl);
  if (first === undefined) return null;
  const [owner, repository] = new URL(first).pathname.slice(1).split("/");
  return owner && repository ? `${owner}/${repository}` : null;
}

/** 글 여러 개에서 GitHub 링크를 글 순서대로 모은다. 주소 글자가 같은 링크는 처음 것 하나만 둔다(BR3.1). */
export function collectLinks(texts: readonly string[]): string[] {
  const links = new Set<string>();
  for (const text of texts) {
    for (const segment of splitGithubLinks(text)) if (segment.kind === "link") links.add(segment.url);
  }
  return [...links];
}
