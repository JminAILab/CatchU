"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type RefObject } from "react";
import { EmptyState, LoadingState, LookupFailedState } from "@/components/status/status";
import { api } from "@/lib/api";
import { recipientCatchPath, recipientLinkPath } from "@/lib/routes";
import { createRecipientApi, type PublicCatch, type PublicProfile } from "./recipient-api";
import {
  generatedNotice, hasGeneratedDraft, isGithubSourceUrl, LINK_UNAVAILABLE_TEXT, missingDraftText,
  RESOURCE_UNAVAILABLE_TEXT, unlockMessage,
} from "./recipient-format";
import { browserSessionStorage, createGrantStore } from "./recipient-grants";
import {
  createRecipientCatchStore, createRecipientCollectionStore, type CatchSnapshot, type CollectionSnapshot, type UnlockResult, type UnlockSnapshot,
} from "./recipient-store";
import styles from "./recipient.module.css";

/** 회원 토큰을 붙이지 않는 수신자 호출(#106 `api.recipient`). */
const recipientApi = createRecipientApi((path, request) => api.recipient(path, request));
/** 탭 하나에서 목록·상세가 함께 쓰는 grant 보관. 링크별로 나뉜다. */
const grants = createGrantStore(browserSessionStorage);

/** `/s/[token]` — 공개 프로필과 현재 공개 Catch 목록(V02). 링크가 바뀌면 상태를 새로 만든다. */
export function RecipientCollectionPage({ token }: { token: string }) {
  return <CollectionView key={token} token={token} />;
}

/** `/s/[token]/catches/[catchId]` — Catch 상세(V03). 직접 진입해도 접근 판정·비밀번호 확인을 먼저 한다. */
export function RecipientCatchPage({ token, catchId }: { token: string; catchId: string }) {
  return <CatchView key={`${token}\u0000${catchId}`} token={token} catchId={catchId} />;
}

/** 화면의 큰 단계가 바뀌면 그 단계의 제목으로 초점을 옮긴다(불러오는 중 제외). */
function useFocusOnView(view: string): RefObject<HTMLHeadingElement | null> {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (view === "loading") return;
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
  }, [view]);
  return ref;
}

function CollectionView({ token }: { token: string }) {
  const [store] = useState(() => createRecipientCollectionStore({ api: recipientApi, grants, token }));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);
  const headingRef = useFocusOnView(snapshot.view);

  return (
    <main className={styles.page}>
      <CollectionBody snapshot={snapshot} token={token} headingRef={headingRef}
        onRetry={() => { void store.load(); }}
        onMore={() => { void store.loadMore(); }}
        onUnlock={(password) => store.unlock(password)}
        waitSeconds={() => store.retryWaitSeconds()} />
    </main>
  );
}

function CollectionBody({ snapshot, token, headingRef, onRetry, onMore, onUnlock, waitSeconds }: {
  snapshot: CollectionSnapshot;
  token: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onRetry: () => void;
  onMore: () => void;
  onUnlock: (password: string) => Promise<UnlockResult>;
  waitSeconds: () => number;
}) {
  switch (snapshot.view) {
    case "loading":
      return <LoadingState>공유된 자료를 확인하고 있습니다.</LoadingState>;
    case "unavailable":
      return <Unavailable headingRef={headingRef} />;
    case "password":
      return <PasswordStep unlock={snapshot.unlock} onUnlock={onUnlock} waitSeconds={waitSeconds} headingRef={headingRef} />;
    case "failed":
      return (
        <section aria-labelledby="recipient-failed">
          <h1 id="recipient-failed" ref={headingRef} tabIndex={-1} className="visually-hidden">공유 자료</h1>
          <LookupFailedState title="자료를 불러오지 못했습니다" onRetry={onRetry}>
            링크 상태를 확인하지 못했습니다. 잠시 후 다시 불러와 주세요.
          </LookupFailedState>
        </section>
      );
    case "ready":
      return (
        <>
          {snapshot.refreshFailed && (
            <div role="alert" className={styles.panel}>
              <p className={styles.alert}>최신 자료를 불러오지 못해 이전에 불러온 내용을 보여 주고 있습니다.</p>
              <button type="button" className={styles.secondary} onClick={onRetry}>다시 불러오기</button>
            </div>
          )}
          <ProfileSection profile={snapshot.profile} headingRef={headingRef} />
          <section className={styles.panel} aria-labelledby="recipient-catches" aria-busy={snapshot.refreshing || undefined}>
            <h2 id="recipient-catches" className={styles.subtitle}>공개 GitHub 자산</h2>
            {snapshot.catches.length === 0 ? (
              <EmptyState title="현재 열람할 수 있는 공개 GitHub 자산이 없습니다" />
            ) : (
              <>
                <p className={styles.notice}>{generatedNotice()}</p>
                <ul className={styles.grid}>
                  {snapshot.catches.map((item) => <CatchCard key={item.catchId} item={item} token={token} />)}
                </ul>
              </>
            )}
            {snapshot.nextCursor !== null && (
              <div className={styles.more}>
                {snapshot.more === "failed" && <p role="alert" className={styles.alert}>다음 목록을 불러오지 못했습니다.</p>}
                <button type="button" className={styles.secondary} onClick={onMore}
                  disabled={snapshot.more === "loading" || snapshot.refreshing}>
                  {snapshot.more === "loading" ? "불러오는 중…" : snapshot.more === "failed" ? "다음 목록 다시 불러오기" : "더 보기"}
                </button>
              </div>
            )}
          </section>
        </>
      );
  }
}

function ProfileSection({ profile, headingRef }: { profile: PublicProfile; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const empty = (value: string) => (value.trim().length > 0 ? value : "입력하지 않음");
  return (
    <section className={styles.panel} aria-labelledby="recipient-profile">
      <h1 id="recipient-profile" ref={headingRef} tabIndex={-1} className={styles.title}>공유된 프로필</h1>
      <dl className={styles.profile}>
        <dt>이름</dt><dd>{empty(profile.displayName)}</dd>
        <dt>한 줄 소개</dt><dd>{empty(profile.introduction)}</dd>
        <dt>희망 직무</dt><dd>{empty(profile.desiredRole)}</dd>
        <dt>기술</dt><dd>{profile.skills.length > 0 ? profile.skills.join(", ") : "입력하지 않음"}</dd>
        {profile.githubAccountLogin !== null && <><dt>GitHub 계정</dt><dd>{profile.githubAccountLogin}</dd></>}
      </dl>
      <p className={styles.muted}>이름·한 줄 소개·희망 직무·기술은 링크를 보낸 사람이 직접 입력한 정보입니다.</p>
      {profile.githubAccountLogin !== null && <p className={styles.muted}>GitHub 계정은 GitHub 연결 때 확인해 저장한 이름입니다.</p>}
    </section>
  );
}

function CatchCard({ item, token }: { item: PublicCatch; token: string }) {
  const labelId = useId();
  return (
    <li className={styles.card} aria-labelledby={item.title !== null ? labelId : undefined}>
      {item.title !== null && <h3 id={labelId} className={`${styles.cardTitle} ${styles.titleClamp}`}>{item.title}</h3>}
      <p className={styles.summary}>{item.workFacts[0] || "상세에서 근거를 확인해 주세요."}</p>
      <Link className={styles.link} href={recipientCatchPath(token, item.catchId)}
        aria-label={item.title !== null ? `${item.title} 상세 보기` : "제목 없는 Catch 상세 보기"}>
        상세 보기
      </Link>
    </li>
  );
}

function CatchView({ token, catchId }: { token: string; catchId: string }) {
  const [store] = useState(() => createRecipientCatchStore({ api: recipientApi, grants, token, catchId }));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);
  const headingRef = useFocusOnView(snapshot.view);
  // 링크 불가·비밀번호 단계에는 목록 복귀를 두지 않고, 상세 불가는 본문에 목록 복귀가 있다.
  const showBack = snapshot.view !== "unavailable" && snapshot.view !== "password" && snapshot.view !== "resource-unavailable";

  return (
    <main className={styles.page}>
      {showBack && <p><Link className={styles.link} href={recipientLinkPath(token)}>공개 자료 목록으로</Link></p>}
      <CatchBody snapshot={snapshot} token={token} headingRef={headingRef}
        onRetry={() => { void store.load(); }}
        onUnlock={(password) => store.unlock(password)}
        waitSeconds={() => store.retryWaitSeconds()} />
    </main>
  );
}

function CatchBody({ snapshot, token, headingRef, onRetry, onUnlock, waitSeconds }: {
  snapshot: CatchSnapshot;
  token: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onRetry: () => void;
  onUnlock: (password: string) => Promise<UnlockResult>;
  waitSeconds: () => number;
}) {
  switch (snapshot.view) {
    case "loading":
      return <LoadingState>자료를 확인하고 있습니다.</LoadingState>;
    case "unavailable":
      return <Unavailable headingRef={headingRef} />;
    case "password":
      return <PasswordStep unlock={snapshot.unlock} onUnlock={onUnlock} waitSeconds={waitSeconds} headingRef={headingRef} />;
    case "resource-unavailable":
      return (
        <section className={styles.panel} aria-labelledby="recipient-resource">
          <h1 id="recipient-resource" ref={headingRef} tabIndex={-1} className={styles.title}>{RESOURCE_UNAVAILABLE_TEXT}</h1>
          <p><Link className={styles.link} href={recipientLinkPath(token)}>공개 자료 목록으로</Link></p>
        </section>
      );
    case "failed":
      return (
        <section aria-labelledby="recipient-detail-failed">
          <h1 id="recipient-detail-failed" ref={headingRef} tabIndex={-1} className="visually-hidden">Catch 상세</h1>
          <LookupFailedState title="자료를 불러오지 못했습니다" onRetry={onRetry}>
            숨겨졌거나 없는 자료라고 판단한 것은 아닙니다. 잠시 후 다시 불러와 주세요.
          </LookupFailedState>
        </section>
      );
    case "ready":
      return (
        <>
          {snapshot.refreshFailed && (
            <div role="alert" className={styles.panel}>
              <p className={styles.alert}>최신 자료를 불러오지 못해 이전에 불러온 내용을 보여 주고 있습니다.</p>
              <button type="button" className={styles.secondary} onClick={onRetry}>다시 불러오기</button>
            </div>
          )}
          <CatchDetail item={snapshot.item} headingRef={headingRef} />
        </>
      );
  }
}

function CatchDetail({ item, headingRef }: { item: PublicCatch; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const notice = generatedNotice(item);
  return (
    <article className={styles.panel} aria-labelledby="recipient-detail">
      <h1 id="recipient-detail" ref={headingRef} tabIndex={-1} className={styles.title}>Catch 상세</h1>
      {item.title !== null && <h2 className={styles.subtitle}>{item.title}</h2>}
      {notice && <p className={styles.notice}>{notice}</p>}
      <section className={styles.section}>
        <h3>작업에서 확인된 사실</h3>
        {item.workFacts.length > 0
          ? <ul>{item.workFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul>
          : <p className={styles.text}>제공된 작업 사실이 없습니다.</p>}
      </section>
      <section className={styles.section}>
        <h3>본인 기여</h3>
        <p className={styles.text}>{item.subjectContribution || "제공된 기여 설명이 없습니다."}</p>
      </section>
      <section className={styles.section}>
        <h3>근거</h3>
        {item.evidence.length === 0 ? <p className={styles.text}>제공된 근거가 없습니다.</p> : item.evidence.map((evidence, index) => (
          <div key={index} className={styles.evidence}>
            <h4>근거 {index + 1}</h4>
            <p className={styles.sourceUrl}>
              {isGithubSourceUrl(evidence.sourceUrl)
                ? <a className={styles.link} href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">GitHub 근거 열기<span className="visually-hidden"> (새 탭)</span></a>
                : evidence.sourceUrl}
            </p>
            <p className={styles.muted}>판본 {evidence.sourceRevision}</p>
            {evidence.representedFacts.length > 0 && <ul>{evidence.representedFacts.map((fact, factIndex) => <li key={factIndex}>{fact}</li>)}</ul>}
            <p className={styles.text}><strong>기여 범위:</strong> {evidence.contributionScope}</p>
            {evidence.coverageLimits.length > 0 && (
              <div><strong>이 근거로 알 수 없는 것</strong><ul>{evidence.coverageLimits.map((limit, limitIndex) => <li key={limitIndex}>{limit}</li>)}</ul></div>
            )}
          </div>
        ))}
      </section>
      <section className={styles.section}>
        <h3>Catch 설명 초안</h3>
        <p className={styles.text}>{hasGeneratedDraft(item) ? item.draft.content : missingDraftText(item)}</p>
      </section>
    </article>
  );
}

function Unavailable({ headingRef }: { headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="recipient-unavailable">
      <h1 id="recipient-unavailable" ref={headingRef} tabIndex={-1} className={styles.title}>{LINK_UNAVAILABLE_TEXT}</h1>
    </section>
  );
}

/**
 * V01 비밀번호 입력. 비밀번호는 이 화면의 입력값에만 두고, 본문으로만 보낸다(주소·로그·상태 객체에 남기지 않음).
 * 확인 중·시도 제한 대기 중에는 다시 보내지 않으며, 대기가 끝나도 자동으로 보내지 않는다.
 */
function PasswordStep({ unlock, onUnlock, waitSeconds, headingRef }: {
  unlock: UnlockSnapshot;
  onUnlock: (password: string) => Promise<UnlockResult>;
  waitSeconds: () => number;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const inputId = useId();
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [, setTick] = useState(0);
  const seconds = waitSeconds();
  const waiting = seconds > 0;
  const submitting = unlock.phase === "submitting";

  // 남은 시간은 화면에만 반영한다. 0이 돼도 자동으로 보내지 않는다.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [waiting, unlock.retryAt]);

  const message = unlockMessage(unlock, seconds);
  const invalid = unlock.phase === "invalid" || unlock.phase === "empty";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || waiting) return;
    const result = await onUnlock(password);
    // 서버가 불일치를 확인하면 입력을 비우고 다시 입력하게 한다. 그 밖의 실패는 입력을 그대로 둔다.
    if (result === "invalid") setPassword("");
    if (result === "invalid" || result === "empty") inputRef.current?.focus();
  }

  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="recipient-password">
      <h1 id="recipient-password" ref={headingRef} tabIndex={-1} className={styles.title}>비밀번호가 필요한 링크입니다</h1>
      <p className={styles.muted}>전달받은 비밀번호를 입력하세요.</p>
      <form method="post" onSubmit={(event) => { void submit(event); }} noValidate>
        <div className={styles.field}>
          <label htmlFor={inputId} className={styles.label}>비밀번호</label>
          <input id={inputId} ref={inputRef} className={styles.input} type="password" autoComplete="off" autoFocus
            value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting}
            aria-invalid={invalid || undefined} aria-describedby={message ? messageId : undefined} />
        </div>
        <p id={messageId} className={message?.tone === "alert" ? styles.alert : styles.status}
          role={message?.tone === "alert" ? "alert" : "status"} aria-live="polite">
          {message?.text ?? ""}
        </p>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={submitting || waiting} aria-busy={submitting || undefined}>
            {submitting ? "확인 중…" : "열람하기"}
          </button>
        </div>
      </form>
    </section>
  );
}
