import type { ReactNode } from "react";
import { githubLinkName } from "@/lib/github-link-name";
import styles from "./publications.module.css";

/**
 * 작성자 설명 속 GitHub 링크 하나(새 Catch NC1, BR2.5·BR2.7, 보안 설계 1.2). 사본 보기와 편집 화면의 「발행하면 면접관에게 열릴 링크」가 함께 쓴다.
 * 보이는 글자는 링크 이름이고 `href`·`title`은 원래 주소 그대로다. 마우스를 올리면 주소 전체가 보이고, 화면 낭독기에는 숨은 「(새 탭)」이 이어 읽힌다.
 * `url`은 `splitGithubLinks`가 링크로 고른 조각만 받는다(판별 규칙은 `github-source-url.ts`). `children`을 주면 이름 대신 그것을 그린다.
 */
export function GithubLink({ url, evidenceRepository, children }: { url: string; evidenceRepository: string | null; children?: ReactNode }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={url} className={styles.githubLink} data-testid="github-link">
      {children ?? githubLinkName(url, evidenceRepository)}<span className="visually-hidden"> (새 탭)</span></a>
  );
}
