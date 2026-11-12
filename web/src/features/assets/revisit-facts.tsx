import { Fragment, type ReactNode } from "react";
import type { CatchAsset, RevisitFact } from "./types";
import styles from "./assets.module.css";

// 새 Catch NC3 「다시 볼 곳」 칸(BR9.1~BR9.3, 다듬은 화면 interaction-spec 6절). 지원자 본인 상세에만 그린다.
// 경로와 커밋 식별값은 React 글자로만 그린다. 응답 검사(catch-api.ts isRevisitFact)가 모양·종류별 개수·식별값 꼴을 먼저 본다.

const GITHUB_REPOSITORY = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/**
 * 커밋 링크 주소. 저장소 이름이 `소유자/저장소` GitHub 꼴(저장소 부분이 `.`·`..`가 아님)이고 식별값이 40자일 때만
 * 고정 호스트 `https://github.com/`으로 만든다. 그 밖에는 null이다(NFR5.2).
 */
export function revisitCommitHref(repositoryName: string | null | undefined, sha: string): string | null {
  if (typeof repositoryName !== "string" || !GITHUB_REPOSITORY.test(repositoryName) || !COMMIT_SHA.test(sha)) return null;
  const repository = repositoryName.slice(repositoryName.indexOf("/") + 1);
  if (repository === "." || repository === "..") return null;
  return `https://github.com/${repositoryName}/commit/${sha}`;
}

type CommitView = (sha: string) => ReactNode;

/** 커밋이 여럿이면 「, 」로 잇는다. */
function commitList(commits: readonly string[], commit: CommitView): ReactNode[] {
  return commits.flatMap((sha, index) => index === 0 ? [<Fragment key={sha}>{commit(sha)}</Fragment>]
    : [", ", <Fragment key={sha}>{commit(sha)}</Fragment>]);
}

/**
 * 종류별 문장(BR9.2). 식별값 바로 뒤에는 받침과 상관없는 「에서」「의」만 붙인다(이/가·을/를을 붙이면 「커밋 1a2b3c4이」처럼 틀린다).
 * 되돌림의 commits는 [되돌린 커밋, 되돌려진 커밋]이라 「commits[1]의 변경을 commits[0]에서」다.
 */
export function revisitSentence(fact: RevisitFact, commit: CommitView): ReactNode[] {
  const [first, second] = fact.commits;
  switch (fact.kind) {
    case "REWORKED_LINES":
      return ["커밋 ", <Fragment key="a">{commit(first)}</Fragment>, "에서 넣은 줄을 커밋 ", <Fragment key="b">{commit(second)}</Fragment>,
        "에서 다시 고침: ", fact.paths[0]];
    case "MOVED_FILE":
      return ["새 파일로 옮김: ", fact.paths[0], " → ", fact.paths[1], " (커밋 ", ...commitList(fact.commits, commit), ")"];
    case "EXTENSION_CHANGED":
      return ["확장자 바꿈: ", fact.paths[0], " → ", fact.paths[1], " (커밋 ", ...commitList(fact.commits, commit), ")"];
    case "REVERTED":
      return ["커밋 ", <Fragment key="b">{commit(second)}</Fragment>, "의 변경을 커밋 ", <Fragment key="a">{commit(first)}</Fragment>, "에서 되돌림"];
    case "TEST_FILES_PRESENT":
      return ["시험 파일 있음: ", fact.paths.join(", "), " (커밋 ", ...commitList(fact.commits, commit), ")"];
  }
}

function CommitText({ sha, href }: { sha: string; href: string | null }) {
  const short = sha.slice(0, 7);
  if (href === null) return <>{short}</>;
  // 발행본 링크와 같은 꼴: 보이는 글자는 식별값 7자, 화면 낭독기에는 숨은 「(새 탭)」이 이어 읽힌다.
  return <a href={href} target="_blank" rel="noopener noreferrer" data-testid="revisit-facts-commit-link">
    {short}<span className="visually-hidden"> (새 탭)</span></a>;
}

/**
 * 근거 바로 아래, Catch 설명 초안 위에 두는 칸. 사실이 없으면 제목도 칸도 그리지 않는다(화면 낭독기에도 없다, BR9.1).
 * 커밋 링크는 실제 자료 화면(dataMode api)이고 LIVE Catch이며 저장소 이름이 GitHub 꼴일 때만 만든다(BR9.3). 그 밖에는 7자 글자다.
 */
export function RevisitFacts({ item, dataMode, repositoryName }: {
  item: CatchAsset;
  dataMode: "preview" | "api";
  repositoryName?: string;
}) {
  if (item.revisitFacts.length === 0) return null;
  const linkable = dataMode === "api" && item.sourceMode === "LIVE";
  const commit: CommitView = (sha) => <CommitText sha={sha} href={linkable ? revisitCommitHref(repositoryName, sha) : null} />;
  return (
    <section className={styles.detailSection} data-testid="revisit-facts">
      <h3>다시 볼 곳 <span className={styles.small}>본인만 확인</span></h3>
      <ul>
        {item.revisitFacts.map((fact, index) => (
          <li key={index} data-testid="revisit-facts-item">{revisitSentence(fact, commit)}</li>
        ))}
      </ul>
    </section>
  );
}
