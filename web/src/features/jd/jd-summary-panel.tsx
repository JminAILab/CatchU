"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AiNoticeLine } from "../../components/ai-consent/ai-notice-line";
import { useAiConsent } from "../../components/ai-consent/use-ai-consent";
import { routes } from "../../lib/routes";
import type { JdApi } from "./jd-api";
import { JdRunResult } from "./jd-result-view";
import { jdSessionDeps, useJdSession } from "./jd-session";
import { createJdSummaryModel, type JdSummaryModel, type JdSummaryState } from "./jd-summary-model";
import type { JdRecipientContext, SourceLocation } from "./jd-types";
import styles from "./jd.module.css";

export function JdPicker({ state, model }: { state: JdSummaryState; model: JdSummaryModel }) {
  return <section aria-label="요약에 사용할 JD">
    <label className={styles.field}>저장한 JD
      <select data-testid="jd-picker" value={state.selectedJd ?? ""} disabled={state.accepting} onChange={(e) => model.selectJd(e.target.value)}>
        <option value="">JD를 선택해 주세요</option>{state.jds.map((jd) => <option key={jd.jdId} value={jd.jdId}>{jd.title}</option>)}
      </select>
    </label>
    {state.jdState === "loading" && <p role="status">JD를 불러오고 있습니다.</p>}
    {state.jdState === "ready" && state.jds.length === 0 && <p>저장한 JD가 없습니다.</p>}
    <div className={styles.actions}>
      <a data-testid="jd-manage-link" href={routes.jds}>JD 관리</a>
      <button data-testid="jd-picker-refresh" type="button" disabled={state.jdState === "loading"} onClick={() => void model.loadJds()}>JD 새로고침</button>
      {state.jdCursor && <button data-testid="jd-picker-more" type="button" disabled={state.jdState === "loading"} onClick={() => void model.loadJds(true)}>다음 JD 보기</button>}
    </div>
  </section>;
}
export function JdRunList({ state, model }: { state: JdSummaryState; model: JdSummaryModel }) {
  return <section aria-label="내 요약 실행 기록">
    <h3>내 요약 실행 기록</h3>
    <button data-testid="jd-runs-refresh" type="button" disabled={state.runState === "loading"} onClick={() => void model.loadRuns()}>실행 목록 새로고침</button>
    {state.runState === "loading" && <p role="status">실행 목록을 불러오고 있습니다.</p>}
    {state.runState === "ready" && !state.runs.length && <p>이 링크에서 실행한 요약이 없습니다.</p>}
    <ul className={styles.list}>{state.runs.map((run) => <li key={run.runId}>
      <button data-testid="jd-run-select" type="button" aria-pressed={state.selectedRun === run.runId} onClick={() => void model.selectRun(run.runId)}>{run.title} · {run.createdAt}</button>
      <small>{run.status === "PENDING" ? "처리 중" : run.status === "DONE" ? "처리 완료" : "처리 실패"} · 요구사항 {run.requirementCount} · 결과 없음 {run.emptyCount} · 실패 {run.failedCount}</small>
    </li>)}</ul>
    {state.runCursor && <button data-testid="jd-runs-more" type="button" disabled={state.runState === "loading"} onClick={() => void model.loadRuns(true)}>다음 실행 보기</button>}
  </section>;
}

/** C-11 슬롯의 props와 주입한 U10 API를 소비한다. 실제 슬롯/동시 인증 transport 연결은 U4·공용 제공 후 수행한다. */
export function JdSummaryPanel({ client, showEvidence, ...context }: JdRecipientContext & {
  client: JdApi; showEvidence: (location: SourceLocation) => void;
}) {
  const session = useJdSession();
  const { token, isLoggedIn, getGrant, onAccessLost } = context;
  const model = useMemo(() => {
    void session.identity;
    void session.loggedIn;
    return createJdSummaryModel(client, { token, isLoggedIn, getGrant, onAccessLost }, jdSessionDeps);
  }, [client, token, isLoggedIn, getGrant, onAccessLost, session.identity, session.loggedIn]);
  const state = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  useEffect(() => {
    model.activate();
    if (isLoggedIn && session.loggedIn) { void model.loadJds(); void model.loadRuns(); }
    else model.clear();
    return () => model.dispose();
  }, [model, isLoggedIn, session.loggedIn]);
  if (!isLoggedIn || !session.loggedIn) return <section className={styles.card}><h2>JD 요약</h2><p>로그인 후 내 JD로 요약을 실행하고 기록을 볼 수 있습니다.</p><a data-testid="jd-summary-login" href={routes.login}>로그인</a></section>;
  if (state.accessLost) return <section className={styles.card}><h2>JD 요약</h2><p role="alert">{state.error ?? "접근 상태가 바뀌었습니다. 링크 또는 로그인을 다시 확인해 주세요."}</p></section>;
  return <JdSummaryContents key={model.viewId} model={model} state={state} showEvidence={showEvidence} />;
}

/** 계정·링크가 바뀌면 동의 창도 함께 해제한다. 이전 창의 답은 새 실행을 보내지 않는다. */
function JdSummaryContents({ model, state, showEvidence }: {
  model: JdSummaryModel; state: JdSummaryState; showEvidence: (location: SourceLocation) => void;
}) {
  const consent = useAiConsent();
  return <section className={styles.card} aria-label="JD 요약">
    <h2>JD 요약</h2><JdPicker state={state} model={model} />
    <p>최대 20개의 비어 있지 않은 줄·줄당 2,000자까지 사용할 수 있습니다. 한 줄이 요구사항 하나입니다.</p>
    <AiNoticeLine /><p>같은 JD로 다시 실행해도 새 실행으로 접수되며 하루 횟수를 사용합니다.</p>
    <button data-testid="jd-summary-start" type="button" disabled={!state.selectedJd || state.accepting} onClick={() => void model.accept(consent.run)}>{state.accepting ? "접수 중…" : "새 요약 실행"}</button>
    {state.error && <p role="alert">{state.error}</p>}{state.notice && <p role="status">{state.notice}</p>}
    <JdRunList state={state} model={model} />
    {state.selectedRun && <button data-testid="jd-result-refresh" type="button" disabled={state.resultLoading} onClick={() => void model.selectRun(state.selectedRun!)}>상태 새로고침</button>}
    {state.resultLoading && <p role="status">결과를 불러오고 있습니다.</p>}
    {state.result && state.selectedRun && <JdRunResult run={state.result} runId={state.selectedRun} showEvidence={showEvidence} />}
    {consent.dialog}
  </section>;
}
