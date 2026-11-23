"use client";

import Link from "next/link";
import { presetEditPath } from "@/lib/routes";
import styles from "@/features/publications/publications.module.css";
import { formatCount, itemsLine, PRESET_LIMIT_TEXT, PRESET_LIMITS, type PresetSummary } from "./presets-api";

export type PresetsListViewProps = {
  state: "loading" | "ready" | "error";
  presets: readonly PresetSummary[];
  onRetry: () => void;
  onNew: () => void;
};

/** 목록 한 줄의 보조 줄(M2): 「항목 N개 · M자」, 발행할 수 없는 자료 수와 상한 넘음을 글자로 붙인다(BR2.1, NFR1). */
export function presetSummaryLine(preset: PresetSummary): string {
  return [
    itemsLine(preset.itemCount, preset.textLength),
    preset.unpublishableCount > 0 ? `발행할 수 없는 자료 ${formatCount(preset.unpublishableCount)}개` : null,
    preset.overLimit ? "상한을 넘었습니다" : null,
  ].filter((part): part is string => part !== null).join(" · ");
}

/**
 * 프리셋 목록(M2, BR2.1~BR2.3). 만든 순서로 모두 한 번에 보인다. 불러오는 중·없음·실패를 다른 글로 보이고 실패를 0개로 보이지 않는다.
 * [새 프리셋]은 단추라 50개일 때 `disabled`로 막고 막힌 이유를 단추 설명으로 잇는다. 이름은 React 글자로만 그린다(BR3.11).
 */
export function PresetsListView(props: PresetsListViewProps) {
  const full = props.state === "ready" && props.presets.length >= PRESET_LIMITS.presets;
  return (
    <main className={styles.page}>
      <div className={styles.listHeading}>
        <h1>프리셋</h1>
        <button type="button" className={styles.primaryButton} data-testid="presets-new-button" disabled={full}
          aria-describedby={full ? "presets-full-notice" : undefined} onClick={props.onNew}>새 프리셋</button>
      </div>
      {full && <p id="presets-full-notice" className={styles.notice} data-testid="presets-full-notice">{PRESET_LIMIT_TEXT}</p>}
      <section className={styles.panel} aria-labelledby="presets-list-title" data-testid="presets-list">
        <h2 id="presets-list-title">내 프리셋</h2>
        {props.state === "loading" ? <p role="status">프리셋 목록을 불러오고 있습니다.</p>
          : props.state === "error" ? (
            <div role="alert" className={styles.error}>
              <p>프리셋 목록을 불러오지 못했습니다.</p>
              <button type="button" className={styles.secondaryButton} data-testid="presets-list-retry" onClick={props.onRetry}>다시 불러오기</button>
            </div>
          )
          : props.presets.length === 0 ? <p data-testid="presets-empty">아직 만든 프리셋이 없습니다. [새 프리셋]으로 만들어 보세요.</p>
          : (
            <ul className={styles.items}>
              {props.presets.map((preset) => (
                <li key={preset.presetId} className={styles.row} data-testid="preset-row" data-preset-id={preset.presetId}>
                  <p className={styles.itemTitle} data-testid="preset-row-name">{preset.name}</p>
                  <p className={styles.small} data-testid="preset-row-summary">{presetSummaryLine(preset)}</p>
                  <Link href={presetEditPath(preset.presetId)} aria-label={`${preset.name} 고치기`} data-testid="preset-row-edit">고치기</Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </main>
  );
}
