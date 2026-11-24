"use client";

import { useId, useState } from "react";
import { catchErrorText, type CatchChange } from "./catch-api";
import type { CatchMutation } from "./assets-store";
import type { CatchAsset } from "./types";
import styles from "./assets.module.css";

/** 서버가 처리하지 않은 저장의 안내(#286 후속, B 동의). 앞선 요청의 결과 불명은 재조회 전 저장을 막으므로 이 안내와 겹치지 않는다. */
function notProcessedText(mutation: CatchMutation): string {
  return mutation.reason === "renewed-rejected" ? "로그인이 연장되었습니다. 다시 눌러 주세요." : "지금은 요청을 보내지 않았습니다.";
}

type SwitchKind = "mismatch" | "visibility";

/**
 * 결정 줄의 전환 단추(#635). 이름은 구역 제목이고(`aria-labelledby`) 켜짐·꺼짐은 `aria-checked`로 읽힌다. 옆의 상태 글은 눈으로 보는 표시다.
 * 막을 때는 `disabled` 대신 `aria-disabled`를 쓴다. 초점이 있던 단추가 `disabled`가 되면 브라우저가 초점을 body로 빼기 때문이다(#636 리뷰).
 * 원본 보호로 막힌 단추도 초점이 가야 낭독기로 이유(`aria-describedby`)를 들을 수 있다.
 */
function DecisionSwitch({ kind, titleId, noteId, on, onText, offText, blocked, saving, onToggle }: {
  kind: SwitchKind;
  titleId: string;
  noteId: string;
  on: boolean;
  onText: string;
  offText: string;
  blocked: boolean;
  /** 이 단추를 눌러 저장하는 중이다. 누른 쪽으로 옮겨 보이고 상태 글 자리에 「저장 중…」을 보인다. */
  saving: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button type="button" role="switch" className={styles.switch} data-testid={`catch-${kind}-switch`} data-saving={saving || undefined}
      aria-checked={on} aria-labelledby={titleId} aria-describedby={noteId} aria-disabled={blocked || undefined}
      onClick={() => { if (!blocked) onToggle(!on); }}>
      <span className={styles.switchTrack} aria-hidden="true"><span className={styles.switchThumb} /></span>
      <span className={styles.switchState} aria-hidden="true">{saving ? "저장 중…" : on ? onText : offText}</span>
    </button>
  );
}

/**
 * Catch 상세 결정 줄의 불일치 표시와 공개 선택(#635). 「내용 확인」 구역은 없다. 공개를 켜면 저장소(`assets-store`)가 확인 요청을 함께 보낸다.
 * 저장 중과 결과 불명(재조회 전)에는 두 단추를 모두 막는다.
 */
export function CatchActions({ item, mutation, onChange, onReload }: {
  item: CatchAsset;
  mutation: CatchMutation | null;
  onChange: (change: CatchChange) => void;
  onReload: () => void;
}) {
  const baseId = useId();
  // 마지막으로 누른 전환 단추와 누른 쪽. 저장 중에만 화면에 쓰고, 저장이 끝나면 서버 값(item)을 보인다(실패하면 원래 자리).
  const [pressed, setPressed] = useState<{ kind: SwitchKind; on: boolean } | null>(null);
  const current = mutation?.catchId === item.catchId ? mutation : null;
  const saving = mutation?.status === "saving";
  const needsReload = current?.status === "error";
  const locked = saving || needsReload;
  const restricted = item.restriction === "SOURCE_PRIVATE";
  const isPublic = item.visibility === "PUBLIC";
  const savingKind = current?.status === "saving" && pressed?.kind === current.kind ? pressed : null;
  const shown = (kind: SwitchKind, value: boolean) => savingKind?.kind === kind ? savingKind.on : value;
  const toggle = (kind: SwitchKind, on: boolean, change: CatchChange) => { setPressed({ kind, on }); onChange(change); };

  return <section className={styles.actions} aria-label="불일치 표시와 공개 선택">
    {saving && <p role="status" className={styles.actionStatus}>변경 내용을 저장하고 있습니다.</p>}
    {current?.status === "success" && <p role="status" className={styles.actionStatus}>변경 내용을 저장했습니다.</p>}
    {current?.status === "not-processed" && <p role="alert" className={styles.actionError}>{notProcessedText(current)}</p>}
    {needsReload && <div role="alert" className={styles.actionError}>
      <div>
        <p>{catchErrorText(current.error)}</p>
        <p>보이는 상태는 마지막으로 확인한 값입니다. 현재 상태를 다시 불러온 뒤 진행해 주세요.</p>
      </div>
      <button className={styles.secondaryButton} onClick={onReload}>현재 상태 다시 불러오기</button>
    </div>}
    <div className={styles.actionSection}>
      <h3 id={`${baseId}-mismatch`}>불일치 표시</h3>
      <div id={`${baseId}-mismatch-note`} className={styles.actionNote}>
        <p>표시와 해제는 다음에 발행하는 발행본부터 반영됩니다.</p>
      </div>
      <DecisionSwitch kind="mismatch" titleId={`${baseId}-mismatch`} noteId={`${baseId}-mismatch-note`}
        on={shown("mismatch", item.mismatch)} onText="표시됨" offText="표시 안 함" blocked={locked} saving={savingKind?.kind === "mismatch"}
        onToggle={(next) => toggle("mismatch", next, { kind: "mismatch", mismatch: next })} />
    </div>
    <div className={styles.actionSection}>
      <h3 id={`${baseId}-visibility`}>공개 선택</h3>
      <div id={`${baseId}-visibility-note`} className={styles.actionNote}>
        {isPublic ? <>
          {restricted && <p>원본 저장소가 보호되어 외부에서 열람할 수 없습니다.</p>}
          <p>숨겨도 이미 발행한 발행본에는 그대로 남습니다. 제공을 끝내려면 발행본에서 링크를 중지하세요.</p>
        </> : <p>{restricted ? "원본 저장소가 보호되어 지금은 공개할 수 없습니다."
          : "작업 사실과 나의 기여가 맞는지 본 뒤 공개하세요. 공개한 Catch만 발행할 수 있습니다."}</p>}
      </div>
      <DecisionSwitch kind="visibility" titleId={`${baseId}-visibility`} noteId={`${baseId}-visibility-note`}
        on={shown("visibility", isPublic)} onText="공개 설정" offText="미공개" blocked={locked || (!isPublic && restricted)}
        saving={savingKind?.kind === "visibility"}
        onToggle={(next) => toggle("visibility", next, { kind: "visibility", visibility: next ? "PUBLIC" : "PRIVATE" })} />
    </div>
  </section>;
}
