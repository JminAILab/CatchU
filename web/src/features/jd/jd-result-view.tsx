import { DEADLINE_TEXT, EMPTY_TEXT, NO_SOURCES_TEXT, REQUIREMENT_FAILED_TEXT, type JdGatedItem, type JdRequirement, type JdRun, type SourceLocation } from "./jd-types";
import styles from "./jd.module.css";

export function JdItemView({ item, showEvidence }: { item: JdGatedItem; showEvidence: (location: SourceLocation) => void }) {
  return <li className={styles.resultItem}>
    <span className={styles.label}>{item.kind === "SERVER_NOTICE" ? "서버 안내" : item.kind === "AI_INTERPRETATION" ? "AI 해석" : "근거에 따른 내용"}</span>
    <p>{item.text}</p>
    {item.citations.map((citation, index) => <div key={`${citation.sourceId}-${index}`} className={styles.citation}>
      <span>{citation.sourceLabel}</span><blockquote>{citation.quote}</blockquote>
      <button data-testid="jd-evidence" type="button" onClick={() => showEvidence(citation.location)}>원문에서 확인</button>
    </div>)}
  </li>;
}

export function JdRequirementResult({ requirement: row, showEvidence }: { requirement: JdRequirement; showEvidence: (location: SourceLocation) => void }) {
  // 검색 조각 0개의 고정 안내만 원문 옆으로 옮긴다. U2의 다른 서버 안내는 해당 칸에 보존한다.
  const isNoSourcesNotice = (item: JdGatedItem) => item.kind === "SERVER_NOTICE" && item.jdRole === "UNCONFIRMED" && item.text === NO_SOURCES_TEXT;
  const noSourcesNotice = row.unconfirmedPoints.find(isNoSourcesNotice);
  const columns = [ ["근거", row.evidenceItems], ["자료로 확인되지 않는 점", row.unconfirmedPoints.filter((item) => !isNoSourcesNotice(item))], ["면접 질문", row.interviewQuestions] ] as const;
  return <section className={styles.requirement} aria-label={`요구사항 ${row.requirementIndex + 1}`}>
    <h4>요구사항 {row.requirementIndex + 1} · 원문 {row.sourceLineNumber}줄</h4>
    <div className={styles.originalRow}>
      <p className={styles.original}>{row.jdLine}</p>
      {noSourcesNotice && <p className={styles.help}><span className={styles.label}>서버 안내</span> {noSourcesNotice.text}</p>}
    </div>
    {row.status === "PENDING" && <p role="status">처리 중입니다.</p>}
    {row.status === "FAILED" && <p>{row.failureCode === "DEADLINE_EXCEEDED" ? DEADLINE_TEXT : REQUIREMENT_FAILED_TEXT}</p>}
    {row.status === "DONE" && row.resultKind === "EMPTY" && <p>{EMPTY_TEXT}</p>}
    <div className={styles.columns}>{columns.map(([label, items]) => <section key={label} className={styles.column}>
      <h5>{label}</h5>
      {items.length ? <ul className={styles.list}>{items.map((item, index) => <JdItemView key={index} item={item} showEvidence={showEvidence} />)}</ul>
        : <p className={styles.help}>{row.status === "PENDING" ? "처리 중" : "표시할 내용이 없습니다."}</p>}
    </section>)}</div>
  </section>;
}

export function JdRunResult({ run, runId, showEvidence }: { run: JdRun; runId: string; showEvidence: (location: SourceLocation) => void }) {
  const hasFailed = run.requirements.some((row) => row.status === "FAILED");
  const hasDone = run.requirements.some((row) => row.status === "DONE");
  return <section aria-label="JD 요약 결과">
    <h3>요약 결과</h3><p className={styles.help}>실행 ID: {runId}</p>
    {run.status === "PENDING" && <p role="status">처리 중입니다. 상태 새로고침으로 확인해 주세요.</p>}
    {run.failureCode === "DEADLINE_EXCEEDED" && <p>{DEADLINE_TEXT}</p>}
    {run.status === "FAILED" && run.failureCode !== "DEADLINE_EXCEEDED" && <p>요약 처리를 완료하지 못했습니다.</p>}
    {hasFailed && hasDone && <p>일부 요구사항을 처리하지 못했습니다.</p>}
    {run.status === "DONE" && !run.requirements.some((row) => row.resultKind === "CONTENT") && <p>{EMPTY_TEXT}</p>}
    {run.requirements.map((row) => <JdRequirementResult key={row.requirementIndex} requirement={row} showEvidence={showEvidence} />)}
  </section>;
}
