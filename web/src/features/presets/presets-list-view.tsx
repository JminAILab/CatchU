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

export const LIST_LEAD_TEXT = "저장한 묶음을 확인하고 발행에 사용할 구성을 관리하세요.";

/**
 * 목록 한 줄의 주의 표시(M2, BR2.1, NFR1): 발행할 수 없는 자료 수와 상한 넘음. #632부터 보조 줄 뒤에 주의 표시로 따로 그린다.
 * 글자는 그대로이고 색만으로 구분하지 않는다.
 */
export function presetWarnings(preset: PresetSummary): string[] {
  return [
    preset.unpublishableCount > 0 ? `발행할 수 없는 자료 ${formatCount(preset.unpublishableCount)}개` : null,
    preset.overLimit ? "상한을 넘었습니다" : null,
  ].filter((part): part is string => part !== null);
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
        <div>
          <h1>프리셋</h1>
          <p className={styles.leadTight}>{LIST_LEAD_TEXT}</p>
        </div>
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
            <ul className={styles.presetRows}>
              {props.presets.map((preset) => (
                <li key={preset.presetId} className={styles.presetRow} data-testid="preset-row" data-preset-id={preset.presetId}>
                  <div>
                    <p className={styles.presetRowName} data-testid="preset-row-name">{preset.name}</p>
                    <p className={styles.presetRowSummary} data-testid="preset-row-summary">
                      <span>{itemsLine(preset.itemCount, preset.textLength)}</span>
                      {presetWarnings(preset).map((text) => <span key={text} className={styles.warnChip} data-testid="preset-row-warning">{text}</span>)}
                    </p>
                  </div>
                  <Link href={presetEditPath(preset.presetId)} className={styles.smallButton} aria-label={`${preset.name} 수정`} data-testid="preset-row-edit">수정</Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </main>
  );
}
