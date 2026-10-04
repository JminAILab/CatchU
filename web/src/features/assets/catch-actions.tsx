"use client";

import { useState } from "react";
import { catchErrorText, type CatchChange } from "./catch-api";
import type { CatchMutation } from "./assets-store";
import type { CatchAsset } from "./types";
import styles from "./assets.module.css";

export function CatchActions({ item, mutation, onChange, onReload }: {
  item: CatchAsset;
  mutation: CatchMutation | null;
  onChange: (change: CatchChange) => void;
  onReload: () => void;
}) {
  const [facts, setFacts] = useState(false);
  const [contribution, setContribution] = useState(false);
  const current = mutation?.catchId === item.catchId ? mutation : null;
  const saving = mutation?.status === "saving";
  const needsReload = current?.status === "error";
  const disabled = saving || needsReload;
  const confirmed = item.confirmation.workFactsConfirmed && item.confirmation.contributionConfirmed;
  const restricted = item.restriction === "SOURCE_PRIVATE";

  return <section className={styles.actions} aria-label="Catch 확인과 공개">
    {saving && <p role="status">변경 내용을 저장하고 있습니다. 창을 닫아도 요청이 취소되지는 않습니다.</p>}
    {current?.status === "success" && <p role="status">변경 내용을 저장했습니다.</p>}
    {needsReload && <div role="alert" className={styles.actionError}>
      <p>{catchErrorText(current.error)}</p>
      <p>아래 상태는 마지막으로 확인한 값입니다. 현재 상태를 다시 불러온 뒤 진행해 주세요.</p>
      <button className={styles.secondaryButton} onClick={onReload}>현재 상태 다시 불러오기</button>
    </div>}
    <div className={styles.actionSection}>
      <h3>내용 확인</h3>
      {confirmed ? <p>작업 사실과 나의 기여를 확인했습니다. 공개는 아래에서 따로 선택해 주세요.</p> : <>
        <label><input type="checkbox" checked={facts} disabled={disabled} onChange={(e) => setFacts(e.target.checked)} />
          근거를 보고 작업 사실을 확인했습니다.</label>
        <label><input type="checkbox" checked={contribution} disabled={disabled} onChange={(e) => setContribution(e.target.checked)} />
          나의 기여 범위를 확인했습니다.</label>
        <button className={styles.primaryButton} disabled={disabled || !facts || !contribution}
          onClick={() => { if (facts && contribution) onChange({ kind: "confirmation" }); }}>확인 완료</button>
      </>}
      <p className={styles.small}>확인만으로 공개되지 않습니다.</p>
    </div>
    <div className={styles.actionSection}>
      <h3>불일치 표시</h3>
      <p>사실과 맞지 않는 설명에 표시할 수 있습니다. 표시만으로 설명·확인·공개 상태는 바뀌지 않습니다.</p>
      <button className={styles.secondaryButton} disabled={disabled}
        onClick={() => onChange({ kind: "mismatch", mismatch: !item.mismatch })}>
        {item.mismatch ? "불일치 표시 해제" : "불일치 표시"}
      </button>
    </div>
    <div className={styles.actionSection}>
      <h3>공개 선택</h3>
      {restricted && <p>원본 저장소가 보호되어 외부에서 열람할 수 없습니다.</p>}
      {item.visibility === "PUBLIC" ? <>
        <p>숨기면 이후 조회부터 기존 공유 링크에서도 이 Catch가 제외됩니다.</p>
        <button className={styles.secondaryButton} disabled={disabled}
          onClick={() => onChange({ kind: "visibility", visibility: "PRIVATE" })}>숨기기</button>
      </> : <>
        <p>{confirmed ? "공개할 준비가 되었다면 지금 공개를 선택해 주세요. 선택하지 않으면 미공개로 유지됩니다."
          : "작업 사실과 나의 기여를 먼저 확인해 주세요."}</p>
        <button className={styles.primaryButton} disabled={disabled || !confirmed || restricted}
          onClick={() => onChange({ kind: "visibility", visibility: "PUBLIC" })}>지금 공개</button>
      </>}
    </div>
  </section>;
}

