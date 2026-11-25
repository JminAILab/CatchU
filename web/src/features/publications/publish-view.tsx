"use client";

import Link from "next/link";
import { AUTHOR_AI_NOTICE } from "@/features/recipient-claude/recipient-claude-text";
import { itemsLine, type PresetSummary } from "@/features/presets/presets-api";
import { publicationDetailPath, routes } from "@/lib/routes";
import { PickCheckbox, ReorderList } from "./pick-parts";
import { CopyUrlButton, OpenLinkAnchor } from "./publication-link-actions";
import { EXPIRY_NOTICE, PUBLICATION_STATE_LABELS, formatKst, passwordText } from "./publication-format";
import { presetBlockReason, PRESETS_FULL_TEXT, PUBLISH_LIMITS, type PublishedLink } from "./publications-api";
import styles from "./publications.module.css";

export type StatusLines = { tone: "status" | "alert"; lines: string[] } | null;

function StatusBlock({ lines, testId }: { lines: StatusLines; testId: string }) {
  if (!lines) return null;
  return (
    <div role={lines.tone} className={lines.tone === "alert" ? styles.error : styles.status} data-testid={testId}>
      {lines.lines.map((line, index) => <p key={`${index}:${line}`}>{line}</p>)}
    </div>
  );
}

/** 고른 프리셋 한 줄(발행 화면 상태의 `SelectedPreset`과 같은 모양). */
export type ChosenPreset = { presetId: string; name: string };

export type PresetPickerViewProps = {
  presets: { state: "loading" | "ready" | "error"; items: readonly PresetSummary[] };
  selected: readonly ChosenPreset[];
  disabled: boolean;
  onRetry: () => void;
  onToggle: (presetId: string) => void;
};

/**
 * 「프리셋 고르기」(M4, 발행 프리셋 U2 BR4.1~BR4.4, interaction-spec PresetPicker). 프리셋마다 체크박스 하나(#632, `PickCheckbox`):
 * 이름, 「항목 N개 · M자」, 막혔으면 이유 하나(이름표 안 글자라 이름과 함께 읽힌다). Space로만 고른다. 다섯 개를 고르면 안 고른 체크박스를 모두 막고
 * 5개 안내를 목록 위 `aria-live="polite"` 칸에 한 번만 보인다. 이름은 React 글자로만 그린다(BR3.11).
 * 고른 비공개 Catch를 공개로 바꾼다는 안내(`PRIVATE_CATCH_NOTICE`)는 그리지 않는다(BR4.7).
 */
export function PresetPickerView(props: PresetPickerViewProps) {
  const full = props.selected.length >= PUBLISH_LIMITS.presets;
  const chosen = props.selected.map((entry) => props.presets.items.find((item) => item.presetId === entry.presetId))
    .filter((item): item is PresetSummary => item !== undefined);
  return (
    <section className={styles.panel} aria-labelledby="publish-presets-title" data-testid="publish-presets">
      <h2 id="publish-presets-title">프리셋 고르기</h2>
      {/* 늘 그려 두어 5개가 찼을 때 한 번 읽힌다. */}
      <p className={styles.small} aria-live="polite" data-testid="publish-presets-full">{full ? PRESETS_FULL_TEXT : ""}</p>
      {props.presets.state === "loading" ? <p role="status">프리셋 목록을 불러오고 있습니다.</p>
        : props.presets.state === "error" ? (
          <div role="alert" className={styles.error}>
            <p>프리셋 목록을 불러오지 못했습니다.</p>
            <button type="button" className={styles.secondaryButton} data-testid="publish-presets-retry" disabled={props.disabled} onClick={props.onRetry}>다시 불러오기</button>
          </div>
        )
        : props.presets.items.length === 0 ? (
          <p data-testid="publish-presets-empty">아직 만든 프리셋이 없습니다. <Link href={routes.presets} data-testid="publish-presets-create-link">프리셋 만들러 가기</Link></p>
        ) : (
          <ul className={styles.picks}>
            {props.presets.items.map((preset) => {
              const picked = props.selected.some((entry) => entry.presetId === preset.presetId);
              const reason = presetBlockReason(preset, chosen, full);
              return (
                <li key={preset.presetId}>
                  <PickCheckbox checked={picked} disabled={props.disabled || (!picked && (full || reason !== null))} onToggle={() => props.onToggle(preset.presetId)}
                    title={preset.name} subline={itemsLine(preset.itemCount, preset.textLength)} reason={reason} reasonTestId="publish-preset-reason"
                    inputProps={{ "data-testid": "publish-preset-option", "data-preset-id": preset.presetId }} />
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

export type SelectedPresetsViewProps = {
  presets: readonly ChosenPreset[];
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
};

/** 마지막 프리셋을 빼 목록이 비었을 때 초점을 둘 그 프리셋의 체크박스. 막혔으면 null이다. */
function presetCheckbox(presetId: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLInputElement>('input[data-testid="publish-preset-option"]')]
    .find((element) => element.dataset.presetId === presetId && !element.disabled) ?? null;
}

/** 「고른 프리셋과 순서 (n/5)」(M4). 손잡이 드래그·「순서 직접 지정」·[빼기]는 프리셋 편집과 같은 순서 부품이다(#632 `ReorderList`). */
export function SelectedPresetsView(props: SelectedPresetsViewProps) {
  return (
    <section className={styles.panel} aria-labelledby="publish-selected-title" data-testid="publish-selected">
      <h2 id="publish-selected-title">고른 프리셋과 순서 ({props.presets.length}/{PUBLISH_LIMITS.presets})</h2>
      {props.presets.length === 0 ? <p data-testid="publish-selected-empty">아직 고른 프리셋이 없습니다.</p> : (
        <ReorderList testIdPrefix="publish" label="고른 프리셋과 순서" disabled={props.disabled} onMove={props.onMove} onRemove={props.onRemove} emptyFocus={presetCheckbox}
          entries={props.presets.map((preset) => ({
            key: preset.presetId, sourceId: preset.presetId, title: preset.name, body: <span className={styles.itemTitle}>{preset.name}</span>,
          }))} />
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
        <p id="publish-title-count" className={styles.small}>{titleLength} / {PUBLISH_LIMITS.title}자 · 받은 사람에게도 보이며 발행 뒤 바꿀 수 없습니다.</p>
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
  presets: readonly ChosenPreset[];
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
 * 확인 단계(U4 W3-2, 발행 프리셋 U2 BR4.5). 제목, 고른 프리셋을 고른 순서대로, 비밀번호 여부, 90일 만료를 보인 뒤 [발행]을 둔다.
 * 발행 중에는 버튼을 막고(BR4.9), 빈도 초과면 남은 시간 동안 막되 자동으로 다시 보내지 않는다. 발행 전 미리보기 사본은 만들지 않는다.
 * 고른 자료 목록과 작성자 설명이 없는 Catch 수 안내는 그리지 않는다(프리셋 안 Catch의 설명 여부를 화면이 모름, 기능 설계 열린 질문).
 */
export function PublishConfirmView(props: PublishConfirmViewProps) {
  const locked = props.submitting || props.lockSeconds > 0;
  return (
    <section className={styles.panel} aria-labelledby="publish-confirm-title" data-testid="publish-confirm">
      <h2 id="publish-confirm-title">발행 내용 확인</h2>
      <dl className={styles.details}>
        <dt>제목</dt><dd>{props.title.trim()}</dd>
        <dt>고른 프리셋과 순서</dt>
        <dd>
          <ol className={styles.confirmItems} data-testid="publish-confirm-presets">
            {props.presets.map((preset) => <li key={preset.presetId}>{preset.name}</li>)}
          </ol>
        </dd>
        <dt>비밀번호</dt><dd data-testid="publish-confirm-password">{passwordText(props.usePassword)}</dd>
        {/* U9 BR7.1: 비밀번호 없음일 때 같은 행에 안내를 둔다. 위 칸의 글(설정됨·없음)은 그대로다. */}
        {!props.usePassword && <dd className={styles.small} data-testid="publish-confirm-ai-notice">{AUTHOR_AI_NOTICE}</dd>}
        <dt>만료</dt><dd data-testid="publish-confirm-expiry">{EXPIRY_NOTICE}</dd>
      </dl>
      {props.submitting && <p role="status" data-testid="publish-submitting">발행하고 있습니다. 응답을 받을 때까지 기다려 주세요.</p>}
      {!props.submitting && props.lockSeconds > 0 && <p role="status" data-testid="publish-lock">{props.lockSeconds}초 뒤에 [발행]을 누를 수 있습니다.</p>}
      <StatusBlock lines={props.statusLines} testId="publish-status" />
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} data-testid="publish-back" disabled={props.submitting} onClick={props.onBack}>돌아가서 수정하기</button>
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
