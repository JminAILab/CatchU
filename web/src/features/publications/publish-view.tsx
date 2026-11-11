"use client";

import Link from "next/link";
import { AUTHOR_AI_NOTICE } from "@/features/recipient-claude/recipient-claude-text";
import { publicationDetailPath, routes } from "@/lib/routes";
import { CopyUrlButton, OpenLinkAnchor } from "./publication-link-actions";
import { EXPIRY_NOTICE, PRIVATE_CATCH_NOTICE, PUBLICATION_STATE_LABELS, formatKst, passwordText } from "./publication-format";
import { CATCH_REJECTION_TEXT, PUBLISH_LIMITS, type PublishedLink } from "./publications-api";
import { selectedKeys, selectionKey, type CatchSource, type MaterialSource, type SelectedItem, type SourceList } from "./publish-sources";
import type { RepositoryOption } from "../assets/types";
import styles from "./publications.module.css";

export type StatusLines = { tone: "status" | "alert"; lines: string[] } | null;

function StatusBlock({ lines, testId }: { lines: StatusLines; testId: string }) {
  if (!lines) return null;
  return (
    <div role={lines.tone} className={lines.tone === "alert" ? styles.error : styles.status} data-testid={testId}>
      {lines.lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  );
}

/** 409가 가리킨 Catch의 표시(신뢰성 설계 「작성자 실패 안내」). 다른 Catch는 그대로 둔다. */
export type FlaggedCatches = { catchIds: readonly string[]; reason: "confirmation-required" | "source-restricted" } | null;

function flaggedText(flagged: FlaggedCatches, catchId: string): string | null {
  return flagged && flagged.catchIds.includes(catchId) ? CATCH_REJECTION_TEXT[flagged.reason] : null;
}

export type SourcePickerViewProps = {
  catches: SourceList<CatchSource>;
  materials: SourceList<MaterialSource>;
  selected: readonly SelectedItem[];
  flagged: FlaggedCatches;
  disabled: boolean;
  /** 「작성자 설명을 쓴 Catch만 보기」. 없으면 꺼짐이다(새 Catch BR6.4). */
  writtenOnly?: boolean;
  /** 저장소 이름을 찾을 목록. 못 불러왔거나 이름이 없으면 작은 줄에서 이름만 빠진다(BR6.2). */
  repositories?: readonly RepositoryOption[];
  onWrittenOnly?: (writtenOnly: boolean) => void;
  onRetry: () => void;
  onMoreCatches: () => void;
  onMoreMaterials: () => void;
  onToggleCatch: (catchId: string) => void;
  onToggleMaterial: (textMaterialId: string) => void;
};

/**
 * 항목 단추 안 작은 줄(BR6.3): 저장소 이름 · 공개 상태 · 설명 안 씀 · 불일치 표시됨. 빈 것은 빼고 잇는다.
 * 「설명 안 씀」은 작성자 설명이 없을 때만 붙는다. 저장소별 개수 경고·추천·순위는 없다(BR6.1).
 */
export function catchSubline(item: CatchSource, repositories: readonly RepositoryOption[]): string {
  const repositoryName = repositories.find((repository) => repository.repositoryId === item.repositoryId)?.name;
  return [repositoryName, item.visibility === "PUBLIC" ? "공개" : "비공개", item.hasAuthorDescription ? null : "설명 안 씀", item.mismatch ? "불일치 표시됨" : null]
    .filter((part): part is string => Boolean(part)).join(" · ");
}

function MoreButton({ list, testId, onMore, disabled }: { list: SourceList<unknown>; testId: string; onMore: () => void; disabled: boolean }) {
  if (list.state !== "ready" || list.nextCursor === null) return null;
  return (
    <div className={styles.more}>
      {list.moreState === "error" && <p role="alert">다음 목록을 불러오지 못했습니다.</p>}
      <button type="button" className={styles.secondaryButton} data-testid={testId} disabled={disabled || list.moreState === "loading"} onClick={onMore}>
        {list.moreState === "loading" ? "불러오는 중…" : list.moreState === "error" ? "다음 목록 다시 불러오기" : "더 보기"}
      </button>
    </div>
  );
}

/**
 * 발행 항목 고르기(U4 W3-1). 본인 Catch·텍스트 자료 목록에서 고른다. 고를 수 없는 Catch는 이유와 함께 비활성이고(BR4.2),
 * 비공개 Catch에는 공개 전환 안내를 둔다(BR4.4). 고르고 빼는 동안 서버에 아무것도 쓰지 않는다.
 */
export function SourcePickerView(props: SourcePickerViewProps) {
  const keys = selectedKeys(props.selected);
  const limitReached = props.selected.length >= PUBLISH_LIMITS.items;
  const sourcesFailed = props.catches.state === "error" || props.materials.state === "error";
  const writtenOnly = props.writtenOnly ?? false;
  const repositories = props.repositories ?? [];
  return (
    <section className={styles.panel} aria-labelledby="publish-sources-title" data-testid="publish-sources">
      <h2 id="publish-sources-title">발행할 자료 고르기</h2>
      <p className={styles.small}>최대 {PUBLISH_LIMITS.items}개. 고른 순서대로 발행본에 들어갑니다.{limitReached && " 더 고를 수 없습니다."}</p>
      <p className={styles.small} data-testid="publish-sources-recommendation">저장소마다 3~5개를 권합니다.</p>
      {sourcesFailed && (
        <div role="alert" className={styles.error}>
          <p>{props.catches.errorText ?? props.materials.errorText ?? "목록을 불러오지 못했습니다."}</p>
          <button type="button" className={styles.secondaryButton} data-testid="publish-sources-retry" onClick={props.onRetry}>목록 다시 불러오기</button>
        </div>
      )}
      <h3>내 Catch</h3>
      {/* BR6.4: 항목들 앞에 둔다. 발행 중에만 막고, 목록 불러오기가 실패해도 쓸 수 있다. 바꾸면 Catch 목록만 첫 쪽부터 다시 부른다. */}
      <label className={styles.check}>
        <input type="checkbox" data-testid="publish-written-only" checked={writtenOnly} disabled={props.disabled}
          onChange={(event) => props.onWrittenOnly?.(event.target.checked)} />
        작성자 설명을 쓴 Catch만 보기
      </label>
      {props.catches.state === "loading" ? <p role="status">Catch 목록을 불러오고 있습니다.</p>
        : props.catches.state === "ready" && props.catches.items.length === 0
          ? writtenOnly ? <p data-testid="publish-catches-written-empty">작성자 설명을 쓴 Catch가 없습니다</p>
            : <p data-testid="publish-catches-empty">고를 수 있는 Catch가 없습니다.</p>
        : props.catches.state === "ready" && <>
          <p className={styles.small} aria-live="polite" data-testid="publish-catches-count">불러온 {props.catches.items.length}개의 Catch</p>
          <ul className={styles.options}>
            {props.catches.items.map((item) => {
              const picked = keys.has(selectionKey("CATCH", item.catchId));
              const flaggedLine = flaggedText(props.flagged, item.catchId);
              return (
                <li key={item.catchId}>
                  <button type="button" className={picked ? styles.optionActive : styles.option} data-testid="publish-catch-option" data-source-id={item.catchId}
                    aria-pressed={picked} disabled={props.disabled || !item.eligible || (!picked && limitReached)}
                    onClick={() => props.onToggleCatch(item.catchId)}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={styles.subline} data-testid="publish-catch-subline">{catchSubline(item, repositories)}</span>
                    {!item.eligible && item.reason && <span className={styles.small} data-testid="publish-catch-reason">{item.reason}</span>}
                    {item.eligible && item.visibility === "PRIVATE" && <span className={styles.small} data-testid="publish-catch-private-notice">{PRIVATE_CATCH_NOTICE}</span>}
                    {flaggedLine && <span className={styles.flagged} data-testid="publish-catch-flagged">{flaggedLine}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>}
      <MoreButton list={props.catches} testId="publish-catches-more" onMore={props.onMoreCatches} disabled={props.disabled} />
      <h3>내 텍스트 자료</h3>
      {props.materials.state === "loading" ? <p role="status">텍스트 자료 목록을 불러오고 있습니다.</p>
        : props.materials.state === "ready" && props.materials.items.length === 0 ? <p data-testid="publish-materials-empty">고를 수 있는 텍스트 자료가 없습니다. <Link href={routes.materials}>텍스트 자료</Link>에서 만들 수 있습니다.</p>
        : props.materials.state === "ready" && (
          <ul className={styles.options}>
            {props.materials.items.map((item) => {
              const picked = keys.has(selectionKey("TEXT_MATERIAL", item.textMaterialId));
              return (
                <li key={item.textMaterialId}>
                  <button type="button" className={picked ? styles.optionActive : styles.option} data-testid="publish-material-option" data-source-id={item.textMaterialId}
                    aria-pressed={picked} disabled={props.disabled || (!picked && limitReached)} onClick={() => props.onToggleMaterial(item.textMaterialId)}>
                    <span className={styles.itemTitle}>{item.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      <MoreButton list={props.materials} testId="publish-materials-more" onMore={props.onMoreMaterials} disabled={props.disabled} />
    </section>
  );
}

export type SelectedListViewProps = {
  items: readonly SelectedItem[];
  flagged: FlaggedCatches;
  disabled: boolean;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
};

/** 고른 항목과 순서(U4 W3-1). 위/아래로 순서를 바꾸고 뺀다. */
export function SelectedListView(props: SelectedListViewProps) {
  return (
    <section className={styles.panel} aria-labelledby="publish-selected-title" data-testid="publish-selected">
      <h2 id="publish-selected-title">고른 항목과 순서 ({props.items.length}/{PUBLISH_LIMITS.items})</h2>
      {props.items.length === 0 ? <p data-testid="publish-selected-empty">아직 고른 항목이 없습니다.</p> : (
        <ol className={styles.selectedItems}>
          {props.items.map((item, index) => {
            const flaggedLine = item.kind === "CATCH" ? flaggedText(props.flagged, item.sourceId) : null;
            return (
              <li key={selectionKey(item.kind, item.sourceId)} className={styles.selectedItem} data-testid="publish-selected-item" data-source-id={item.sourceId}>
                <div>
                  <span className={styles.kindBadge}>{item.kind === "CATCH" ? "Catch" : "텍스트 자료"}</span> <span className={styles.itemTitle}>{item.title}</span>
                  {item.visibility === "PRIVATE" && <p className={styles.small} data-testid="publish-selected-private-notice">{PRIVATE_CATCH_NOTICE}</p>}
                  {flaggedLine && <p className={styles.flagged} data-testid="publish-selected-flagged">{flaggedLine}</p>}
                </div>
                <div className={styles.rowActions}>
                  <button type="button" className={styles.secondaryButton} data-testid="publish-move-up" disabled={props.disabled || index === 0}
                    onClick={() => props.onMoveUp(index)} aria-label={`${item.title} 위로`}>위로</button>
                  <button type="button" className={styles.secondaryButton} data-testid="publish-move-down" disabled={props.disabled || index === props.items.length - 1}
                    onClick={() => props.onMoveDown(index)} aria-label={`${item.title} 아래로`}>아래로</button>
                  <button type="button" className={styles.secondaryButton} data-testid="publish-remove" disabled={props.disabled}
                    onClick={() => props.onRemove(index)} aria-label={`${item.title} 빼기`}>빼기</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export type PublishFormViewProps = {
  title: string;
  usePassword: boolean;
  password: string;
  disabled: boolean;
  statusLines: StatusLines;
  onTitle: (title: string) => void;
  onUsePassword: (use: boolean) => void;
  onPassword: (password: string) => void;
  onNext: () => void;
};

/** 제목·선택적 비밀번호 입력(U4 W3-2). [다음]은 확인 단계로 간다. 비밀번호 원문은 안내에 넣지 않는다. */
export function PublishFormView(props: PublishFormViewProps) {
  const titleLength = Array.from(props.title.trim()).length;
  return (
    <section className={styles.panel} aria-labelledby="publish-form-title" data-testid="publish-form">
      <h2 id="publish-form-title">제목과 비밀번호</h2>
      <form onSubmit={(event) => { event.preventDefault(); props.onNext(); }} noValidate>
        <label className={styles.field} htmlFor="publish-title-input">발행본 제목
          <input id="publish-title-input" data-testid="publish-title-input" value={props.title} disabled={props.disabled}
            aria-describedby="publish-title-count" onChange={(event) => props.onTitle(event.target.value)} />
        </label>
        <p id="publish-title-count" className={styles.small}>{titleLength} / {PUBLISH_LIMITS.title}자 · 나에게만 보이며 발행 뒤 바꿀 수 없습니다.</p>
        <label className={styles.check}>
          <input type="checkbox" data-testid="publish-use-password" checked={props.usePassword} disabled={props.disabled}
            onChange={(event) => props.onUsePassword(event.target.checked)} />
          비밀번호 사용
        </label>
        {/* U9 BR7.1: 비밀번호를 끄면 받은 사람이 외부 AI 도구로 읽을 수 있다고 알린다. 링크별 허용 설정은 두지 않는다. */}
        {!props.usePassword && <p className={styles.small} data-testid="publish-ai-notice">{AUTHOR_AI_NOTICE}</p>}
        {props.usePassword && (
          <label className={styles.field} htmlFor="publish-password-input">링크 비밀번호 ({PUBLISH_LIMITS.password.min}~{PUBLISH_LIMITS.password.max}자)
            <input id="publish-password-input" data-testid="publish-password-input" type="password" autoComplete="new-password"
              value={props.password} disabled={props.disabled} onChange={(event) => props.onPassword(event.target.value)} />
          </label>
        )}
        <p className={styles.small}>비밀번호는 발행 뒤 바꾸거나 없앨 수 없습니다. {EXPIRY_NOTICE}</p>
        <StatusBlock lines={props.statusLines} testId="publish-status" />
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} data-testid="publish-to-confirm" disabled={props.disabled}>다음: 발행 내용 확인</button>
        </div>
      </form>
    </section>
  );
}

export type PublishConfirmViewProps = {
  items: readonly SelectedItem[];
  title: string;
  usePassword: boolean;
  submitting: boolean;
  /** 빈도 초과 뒤 남은 초. 0이면 잠그지 않는다. */
  lockSeconds: number;
  statusLines: StatusLines;
  onBack: () => void;
  onSubmit: () => void;
};

/**
 * 확인 단계(U4 W3-2, BR4.6). 고른 항목을 순서대로, 비밀번호 여부, 90일 만료를 보인 뒤 [발행]을 둔다. 발행 중에는 버튼을 막고(BR4.9),
 * 빈도 초과면 남은 시간 동안 막되 자동으로 다시 보내지 않는다. 발행 전 미리보기 사본은 만들지 않는다.
 */
export function PublishConfirmView(props: PublishConfirmViewProps) {
  const locked = props.submitting || props.lockSeconds > 0;
  const privateCount = props.items.filter((item) => item.visibility === "PRIVATE").length;
  // 고르기 목록이 아니라 고른 자료에서 센다. 걸러 보기로 목록에서 사라진 Catch도 센다(BR6.5·BR6.6).
  const undescribedCount = props.items.filter((item) => item.kind === "CATCH" && item.hasAuthorDescription === false).length;
  return (
    <section className={styles.panel} aria-labelledby="publish-confirm-title" data-testid="publish-confirm">
      <h2 id="publish-confirm-title">발행 내용 확인</h2>
      <dl className={styles.details}>
        <dt>제목</dt><dd>{props.title.trim()}</dd>
        <dt>항목 ({props.items.length}개)</dt>
        <dd>
          <ol className={styles.confirmItems} data-testid="publish-confirm-items">
            {props.items.map((item) => (
              <li key={selectionKey(item.kind, item.sourceId)}>
                <span className={styles.kindBadge}>{item.kind === "CATCH" ? "Catch" : "텍스트 자료"}</span> {item.title}
                {item.visibility === "PRIVATE" && <span className={styles.small}> · {PRIVATE_CATCH_NOTICE}</span>}
              </li>
            ))}
          </ol>
        </dd>
        <dt>비밀번호</dt><dd data-testid="publish-confirm-password">{passwordText(props.usePassword)}</dd>
        {/* U9 BR7.1: 비밀번호 없음일 때 같은 행에 안내를 둔다. 위 칸의 글(설정됨·없음)은 그대로다. */}
        {!props.usePassword && <dd className={styles.small} data-testid="publish-confirm-ai-notice">{AUTHOR_AI_NOTICE}</dd>}
        <dt>만료</dt><dd data-testid="publish-confirm-expiry">{EXPIRY_NOTICE}</dd>
      </dl>
      {privateCount > 0 && <p className={styles.notice} data-testid="publish-confirm-private-notice">비공개 Catch {privateCount}개가 발행과 함께 공개로 바뀝니다. 발행이 실패하면 바뀌지 않습니다.</p>}
      {/* BR6.6: 비공개 안내와 같은 꼴이고 0개면 그리지 않는다. [발행]은 막지 않는다. */}
      {undescribedCount > 0 && <p className={styles.notice} data-testid="publish-confirm-description-notice">작성자 설명이 없는 Catch가 {undescribedCount}개 있습니다. 면접관에게는 「작성자 설명이 없습니다.」로 보입니다.</p>}
      {props.submitting && <p role="status" data-testid="publish-submitting">발행하고 있습니다. 응답을 받을 때까지 기다려 주세요.</p>}
      {!props.submitting && props.lockSeconds > 0 && <p role="status" data-testid="publish-lock">{props.lockSeconds}초 뒤에 [발행]을 누를 수 있습니다.</p>}
      <StatusBlock lines={props.statusLines} testId="publish-status" />
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} data-testid="publish-back" disabled={props.submitting} onClick={props.onBack}>돌아가서 고치기</button>
        <button type="button" className={styles.primaryButton} data-testid="publish-submit" disabled={locked} onClick={props.onSubmit}>
          {props.submitting ? "발행 중…" : "발행"}
        </button>
      </div>
    </section>
  );
}

export type PublishDoneViewProps = { result: PublishedLink & { title: string }; onNew: () => void };

/** 발행 완료(U4 W3-7, BR5.6). 실제 응답의 주소·상태·만료·비밀번호 여부를 보이고 [URL 복사]·[링크 열기]·상세로 간다. */
export function PublishDoneView({ result, onNew }: PublishDoneViewProps) {
  return (
    <section className={styles.panel} aria-labelledby="publish-done-title" data-testid="publish-done">
      <h2 id="publish-done-title">발행됨</h2>
      <dl className={styles.details}>
        <dt>제목</dt><dd>{result.title}</dd>
        <dt>링크 주소</dt><dd><span className={styles.url} data-testid="publish-result-url">{result.url}</span></dd>
        <dt>상태</dt><dd data-testid="publish-result-state">{PUBLICATION_STATE_LABELS[result.state]}</dd>
        <dt>발행 시각</dt><dd>{formatKst(result.publishedAt)}</dd>
        <dt>만료 시각</dt><dd>{formatKst(result.expiresAt)}</dd>
        <dt>비밀번호</dt><dd>{passwordText(result.passwordProtected)}</dd>
      </dl>
      <p className={styles.small}>링크 주소를 받을 사람에게 전달하세요.{result.passwordProtected && " 비밀번호를 설정했으므로 비밀번호도 따로 전달해야 합니다."}</p>
      <div className={styles.rowActions}>
        <CopyUrlButton url={result.url} />
        <OpenLinkAnchor url={result.url} state={result.state} />
        <Link className={styles.primaryButton} href={publicationDetailPath(result.publicationId)} data-testid="publish-result-detail-link">발행본 상세 보기</Link>
        <Link className={styles.secondaryButton} href={routes.publications} data-testid="publish-result-list-link">발행본 목록</Link>
        <button type="button" className={styles.secondaryButton} data-testid="publish-new-button" onClick={onNew}>새로 발행</button>
      </div>
    </section>
  );
}
