"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type SyntheticEvent } from "react";
import { EmptyState, LoadingState, LookupFailedState } from "@/components/status/status";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { copyText } from "./copy-text";
import { createShareLinkApi, type ShareLink } from "./share-link-api";
import { alsoExpired, formatKst, remainingText, STATE_LABELS } from "./share-link-format";
import { createMemberSessionScope } from "./member-session-scope";
import { ACTIVE_LINK_LIMIT, createShareLinksStore, type ShareLinksStore } from "./share-links-store";
import styles from "./share-links.module.css";

const serverSnapshot = () => null;

/**
 * 회원이 바뀔 때마다(토큰 변경) 화면과 상태를 새로 만든다. 이전 회원의 목록·발급 요청·비밀번호 입력과
 * 늦게 도착한 응답이 다음 회원 화면에 이어지지 않게 한다. 토큰은 React key나 DOM에 넣지 않는다.
 */
export function ShareLinksPage() {
  const scope = useMemo(() => createMemberSessionScope(accessTokenStore), []);
  const generation = useSyncExternalStore(scope.subscribe, scope.getSnapshot, serverSnapshot);
  if (generation === null) return null;
  return <Fragment key={generation}><ShareLinksScreen /></Fragment>;
}

/**
 * W6 공유 링크(#149): L03 관리 목록 → [새 링크 발행] L01 → 발행 완료 L02 → [URL 복사]·[링크 중단].
 * 근거: 공유링크 흐름 초안 §4.1~§4.3·§4.8, API 명세 v1 share-links·stop.
 */
function ShareLinksScreen() {
  const store = useMemo(() => createShareLinksStore(createShareLinkApi(api.member)), []);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const { list, form, notice } = snapshot;
  const listBusy = list.status === "loading" || list.refreshing;

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>공유 링크</h1>
        <div className={styles.headingActions}>
          <button type="button" className={styles.primary} onClick={store.openForm} disabled={form.open}>
            새 링크 발행
          </button>
          <button type="button" className={styles.secondary} onClick={() => void store.load()} disabled={listBusy}>
            목록 새로고침
          </button>
        </div>
      </div>

      {notice && (
        <div className={notice.tone === "error" ? styles.noticeError : styles.notice} role="status" aria-live="polite">
          <span>{notice.text}</span>
          <button type="button" className={styles.linkButton} onClick={store.dismissNotice}>닫기</button>
        </div>
      )}

      {form.open && <IssuePanel store={store} />}

      <LinkList store={store} />
      <StopDialog store={store} />
    </main>
  );
}

function useSnapshot(store: ShareLinksStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** L01 발행 준비와 L02 발행 완료. */
function IssuePanel({ store }: { store: ShareLinksStore }) {
  const { form } = useSnapshot(store);
  const [showPassword, setShowPassword] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const activeCount = store.activeCount();

  useEffect(() => { titleRef.current?.focus(); }, []);

  if (form.phase === "issued" && form.issued) return <IssuedPanel store={store} link={form.issued} />;

  const locked = form.phase !== "editing";
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void store.submit();
  };

  return (
    <section className={styles.panel} aria-labelledby="issue-title">
      <h2 id="issue-title" className={styles.panelTitle}>새 링크 발행</h2>
      <p className={styles.help}>
        링크는 수신자가 열 때의 공개 프로필과 공개한 Catch 전체를 보여 줍니다. 공개 자료를 바꾸면 이미 발행한 링크에서도 다음 조회부터 바뀐 내용이 보입니다.{" "}
        <Link href={routes.assets}>공개 자료 확인으로</Link>
      </p>
      <form onSubmit={onSubmit} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>링크 제목(필수)</span>
          <input
            ref={titleRef}
            className={styles.input}
            value={form.title}
            onChange={(event) => store.setTitle(event.target.value)}
            disabled={locked}
            placeholder="예: A사 지원"
            aria-invalid={form.fieldErrors.title ? true : undefined}
            aria-describedby="issue-title-help issue-title-error"
          />
          <span id="issue-title-help" className={styles.help}>나에게만 보이며 발행 후 제목을 수정할 수 없습니다.</span>
          {form.fieldErrors.title && <span id="issue-title-error" className={styles.error}>{form.fieldErrors.title}</span>}
        </label>

        <p className={styles.help}>
          {activeCount === null
            ? `유효 링크는 ${ACTIVE_LINK_LIMIT}개까지입니다. 중단·만료 링크는 세지 않습니다.`
            : `현재 유효 링크: ${activeCount}/${ACTIVE_LINK_LIMIT}개 — 중단·만료 링크 제외`}
          {activeCount !== null && activeCount >= ACTIVE_LINK_LIMIT && " 사용하지 않는 링크를 중단한 뒤 발행해 주세요."}
        </p>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.usePassword}
            onChange={(event) => { store.setUsePassword(event.target.checked); setShowPassword(false); }}
            disabled={locked}
          />
          비밀번호 사용
        </label>
        {form.usePassword && (
          <div className={styles.field}>
            <span className={styles.passwordRow}>
              <input
                className={styles.input}
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) => store.setPassword(event.target.value)}
                disabled={locked}
                autoComplete="new-password"
                aria-label="링크 비밀번호"
                aria-invalid={form.fieldErrors.password ? true : undefined}
              />
              <button type="button" className={styles.secondary} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              </button>
            </span>
            {form.fieldErrors.password && <span className={styles.error}>{form.fieldErrors.password}</span>}
          </div>
        )}
        <p className={styles.help}>비밀번호는 발행 후 변경·해제할 수 없습니다. 유효기간은 발행 시점부터 30일로 고정입니다.</p>

        {form.phase === "submitting" && <p className={styles.progress} role="status">링크를 발행하는 중입니다.</p>}
        {form.message && (
          <div className={form.message.tone === "error" ? styles.messageError : styles.message} role="alert">
            <span>{form.message.text}</span>
            {form.message.action === "to-list" && (
              <button type="button" className={styles.linkButton} onClick={store.closeForm}>공유 링크로</button>
            )}
          </div>
        )}

        <div className={styles.actions}>
          {form.phase === "unknown" && form.discardAsked ? (
            <>
              <button type="button" className={styles.secondary} onClick={store.closeForm}>목록에서 확인</button>
              <button type="button" className={styles.secondary} onClick={store.cancelDiscard}>취소</button>
              <button type="button" className={styles.primary} onClick={store.discardPending}>새로 작성 계속</button>
            </>
          ) : form.phase === "unknown" ? (
            <>
              <button type="button" className={styles.secondary} onClick={store.closeForm}>목록에서 확인</button>
              <button type="button" className={styles.secondary} onClick={store.askDiscard}>새로 작성</button>
              <button type="button" className={styles.primary} onClick={() => void store.resend()}>다시 발행</button>
            </>
          ) : (
            <>
              <button type="button" className={styles.secondary} onClick={store.closeForm} disabled={form.phase === "submitting"}>
                돌아가기
              </button>
              <button type="submit" className={styles.primary} disabled={form.phase === "submitting"}>
                링크 발행
              </button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}

function IssuedPanel({ store, link }: { store: ShareLinksStore; link: ShareLink }) {
  return (
    <section className={styles.panel} aria-labelledby="issued-title">
      <h2 id="issued-title" className={styles.panelTitle}>링크가 발행되었습니다.</h2>
      <dl className={styles.details}>
        <dt>제목</dt><dd>{link.title} <span className={styles.muted}>— 나에게만 표시</span></dd>
        <dt>URL</dt><dd><span className={styles.url}>{link.url}</span> <CopyButton url={link.url} disabled={link.state !== "ACTIVE"} /></dd>
        <dt>발행 시각</dt><dd>{formatKst(link.createdAt)}</dd>
        <dt>만료 시각</dt><dd>{formatKst(link.expiresAt)}</dd>
        <dt>비밀번호</dt><dd>{link.passwordRequired ? "설정됨" : "없음"}</dd>
      </dl>
      {link.state !== "ACTIVE" ? (
        // 같은 요청을 다시 보내면 서버는 그 링크를 현재 상태로 돌려준다. 그사이 중단·만료됐으면 그대로 알린다.
        <p className={styles.messageError} role="alert">
          이 요청으로 발행된 링크이지만 현재 상태는 ‘{STATE_LABELS[link.state]}’입니다. 이 URL로는 열람할 수 없습니다.
        </p>
      ) : (
        <p className={styles.help}>
          URL을 수신자에게 전달하세요.{link.passwordRequired && " 비밀번호를 설정했으므로 비밀번호도 따로 전달해야 합니다."}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={store.closeForm}>공유 링크로</button>
      </div>
    </section>
  );
}

/** L03 목록. 조회 중·조회 실패·정상 0건을 서로 바꿔 쓰지 않는다. */
function LinkList({ store }: { store: ShareLinksStore }) {
  const { list, pendingIssue, form } = useSnapshot(store);
  const now = store.now();
  const candidates = store.issueCandidates();
  const pending = pendingIssue && !form.open && (
    <div className={styles.noticeError} role="status">
      <span>
        확인하지 못한 발급 요청이 있습니다: ‘{pendingIssue.title}’.{" "}
        {list.status === "ready" && candidates.length > 0 && `목록에 같은 제목의 링크가 ${candidates.length}개 있지만, 이번 요청의 결과인지는 아직 알 수 없습니다. `}
        [요청 다시 보기]에서 같은 요청을 다시 보내면 결과를 확인할 수 있습니다. 이미 처리된 요청이면 새 링크를 만들지 않고 그 결과를 돌려받습니다.
      </span>
      <button type="button" className={styles.linkButton} onClick={store.openForm}>요청 다시 보기</button>
    </div>
  );

  if (list.status === "loading") return <>{pending}<LoadingState>공유 링크 목록을 불러오는 중입니다.</LoadingState></>;
  if (list.status === "error") {
    return (
      <>
        {pending}
        <LookupFailedState title="공유 링크 목록을 불러오지 못했습니다." onRetry={() => void store.load()}>잠시 후 다시 불러와 주세요.</LookupFailedState>
      </>
    );
  }
  if (list.items.length === 0 && !list.stale) {
    return (
      <>
        {pending}
        <EmptyState
          title="발행한 링크가 없습니다."
          action={<button type="button" className={styles.primary} onClick={store.openForm}>새 링크 발행</button>}
        />
      </>
    );
  }
  const activeCount = store.activeCount();
  return (
    <section aria-labelledby="links-heading">
      <h2 id="links-heading" className="visually-hidden">공유 링크 목록</h2>
      {pending}
      <p className={styles.muted}>
        발행 시각 최신순{activeCount !== null && ` · 현재 유효 링크 ${activeCount}/${ACTIVE_LINK_LIMIT}개`}
      </p>
      {list.refreshing && <p className={styles.notice} role="status">최신 상태를 확인하는 중입니다. 확인이 끝날 때까지 복사·중단을 잠시 막습니다.</p>}
      {list.stale && !list.refreshing && (
        <div className={styles.noticeError} role="alert">
          <span>마지막으로 확인한 목록입니다. 최신 상태를 확인하지 못해 복사·중단을 막았습니다.</span>
          <button type="button" className={styles.linkButton} onClick={() => void store.load()}>목록 다시 불러오기</button>
        </div>
      )}
      <ul className={styles.list}>
        {list.items.map((link) => (
          <LinkRow key={link.linkId} store={store} link={link} now={now} candidate={candidates.includes(link.linkId)} />
        ))}
      </ul>
      {list.nextCursor !== null && (
        <div className={styles.more}>
          {list.more === "error" && <span className={styles.error}>목록을 더 불러오지 못했습니다.</span>}
          <button type="button" className={styles.secondary} onClick={() => void store.loadMore()} disabled={list.more === "loading" || list.refreshing}>
            {list.more === "loading" ? "불러오는 중" : list.more === "error" ? "다시 불러오기" : "더 보기"}
          </button>
        </div>
      )}
    </section>
  );
}

function LinkRow({ store, link, now, candidate }: { store: ShareLinksStore; link: ShareLink; now: number; candidate: boolean }) {
  const snapshot = useSnapshot(store);
  const actionable = snapshot.list.status === "ready" && !snapshot.list.refreshing && !snapshot.list.stale;
  const remaining = remainingText(link, now);
  const unresolved = snapshot.unresolvedStops.includes(link.linkId);
  return (
    <li className={styles.row}>
      <div className={styles.rowHead}>
        <strong className={styles.rowTitle}>{link.title}</strong>
        <span className={styles[`state${link.state}`]}>{STATE_LABELS[link.state]}</span>
      </div>
      <p className={styles.url}>{link.url}</p>
      {candidate && <p className={styles.muted}>확인하지 못한 발급 요청과 제목이 같습니다. 이 요청의 결과인지는 아직 알 수 없습니다.</p>}
      <p className={styles.meta}>
        비밀번호: {link.passwordRequired ? "설정됨" : "없음"} · 발행: {formatKst(link.createdAt)} · 만료: {formatKst(link.expiresAt)}
        {remaining && ` · 남은 기간: ${remaining}`}
      </p>
      {link.state === "STOPPED" && (
        <p className={styles.muted}>
          이 URL은 다시 활성화할 수 없습니다.{alsoExpired(link, now) && " 만료 시각도 지났습니다."}
        </p>
      )}
      {link.state === "EXPIRED" && <p className={styles.muted}>새 링크가 필요하면 위의 [새 링크 발행]을 누르세요.</p>}
      {unresolved && <p className={styles.error}>중단 여부를 확인하지 못했습니다. 목록을 다시 불러와 상태를 확인해 주세요.</p>}
      {link.state === "ACTIVE" && (
        <div className={styles.rowActions}>
          <CopyButton url={link.url} disabled={!actionable} />
          <button
            type="button"
            className={styles.danger}
            onClick={() => store.openStop(link.linkId)}
            disabled={!store.canStop(link)}
          >
            링크 중단
          </button>
        </div>
      )}
    </li>
  );
}

/** [URL 복사]. 실제 클립보드 쓰기에 성공했을 때만 완료를 표시하고, 실패하면 직접 복사할 수 있게 주소를 보여 준다. */
function CopyButton({ url, disabled }: { url: string; disabled: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const manual = useRef<HTMLInputElement>(null);
  const copy = async () => {
    const ok = await copyText(typeof navigator === "undefined" ? undefined : navigator.clipboard, url);
    setStatus(ok ? "copied" : "failed");
  };
  useEffect(() => { if (status === "failed") manual.current?.select(); }, [status]);
  return (
    <span className={styles.copy}>
      <button type="button" className={styles.secondary} onClick={() => void copy()} disabled={disabled}>
        {status === "failed" ? "다시 복사" : "URL 복사"}
      </button>
      {status === "copied" && <span className={styles.ok} role="status">URL을 복사했습니다.</span>}
      {status === "failed" && (
        <span className={styles.manual} role="alert">
          URL을 복사하지 못했습니다. 아래 주소를 직접 복사해 주세요.
          <input ref={manual} className={styles.input} value={url} readOnly aria-label="복사할 URL" onFocus={(event) => event.target.select()} />
        </span>
      )}
    </span>
  );
}

/** 중단 확인 상자와 결과 4분기(요청 중·성공·실패 확정·응답 불명, 초안 §4.3.2). 성공은 상자를 닫고 목록·안내로 알린다. */
function StopDialog({ store }: { store: ShareLinksStore }) {
  const { stop } = useSnapshot(store);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (stop && !element.open) element.showModal();
    if (!stop && element.open) element.close();
  }, [stop]);

  const onCancel = (event: SyntheticEvent) => {
    event.preventDefault();
    if (stop?.phase === "confirm") store.cancelStop();
    else if (stop?.phase === "failed" || stop?.phase === "unknown") store.recheckStop();
    // 요청 중에는 닫지 않는다(전송 후 취소를 제공하지 않음).
  };

  return (
    <dialog ref={dialog} className={styles.dialog} onCancel={onCancel} aria-labelledby="stop-title">
      {stop && (
        <>
          <h2 id="stop-title" className={styles.panelTitle}>이 링크를 중단할까요?</h2>
          <p>대상: <strong>{stop.title}</strong></p>
          <p className={styles.url}>{stop.url}</p>
          {stop.phase === "confirm" && (
            <>
              <ul className={styles.dialogList}>
                <li>중단하면 이 URL로 자료를 열람할 수 없습니다.</li>
                <li>이미 열린 화면에는 다음 이동·새로고침부터 반영됩니다.</li>
                <li>중단한 URL은 다시 활성화할 수 없습니다.</li>
                <li>자료 자체를 삭제하거나 숨기지는 않습니다.</li>
              </ul>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={store.cancelStop}>취소</button>
                <button type="button" className={styles.danger} onClick={() => void store.confirmStop()}>링크 중단</button>
              </div>
            </>
          )}
          {stop.phase === "requesting" && <p className={styles.progress} role="status">중단을 요청하고 있습니다.</p>}
          {(stop.phase === "failed" || stop.phase === "unknown") && (
            <>
              <p className={styles.messageError} role="alert">{stop.message}</p>
              <div className={styles.actions}>
                <button type="button" className={styles.primary} onClick={store.recheckStop}>상태 다시 확인</button>
              </div>
            </>
          )}
        </>
      )}
    </dialog>
  );
}
