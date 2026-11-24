"use client";

import Link from "next/link";
import { routes } from "@/lib/routes";
import type { RepositoryOption } from "@/features/assets/types";
import { MoreButton, PickCheckbox } from "@/features/publications/pick-parts";
import { selectionKey, type CatchSource, type MaterialSource, type PdfSource, type SourceList } from "@/features/publications/publish-sources";
import styles from "@/features/publications/publications.module.css";
import type { PresetItemKind } from "./presets-api";

export type SourcePickerViewProps = {
  catches: SourceList<CatchSource>;
  materials: SourceList<MaterialSource>;
  pdfs: SourceList<PdfSource>;
  /** 담긴 자료의 `selectionKey` 모음. 담긴 자료의 체크박스는 체크돼 있고 막지 않는다(빼야 하므로). */
  picked: ReadonlySet<string>;
  /** 안 담긴 자료를 막는 이유(20개·60,000자, BR3.4). 없으면 null. */
  blockReason: (kind: PresetItemKind, sourceId: string) => string | null;
  disabled: boolean;
  /** 「작성자 설명을 쓴 Catch만 보기」(지금 발행 화면 그대로). */
  writtenOnly: boolean;
  /** 저장소 이름을 찾을 목록. 못 불러왔거나 이름이 없으면 작은 줄에서 이름만 빠진다. */
  repositories: readonly RepositoryOption[];
  onWrittenOnly: (writtenOnly: boolean) => void;
  onRetry: () => void;
  onMoreCatches: () => void;
  onMoreMaterials: () => void;
  onMorePdfs: () => void;
  onToggle: (kind: PresetItemKind, sourceId: string) => void;
};

/**
 * Catch 단추 작은 줄(M3): 저장소 이름 · 설명 안 씀 · 불일치 표시됨. 빈 것은 빼고 잇는다.
 * 이 목록에는 공개한 Catch만 나와(`publishable=true`) 공개 상태 글은 뺐다(M3 「바뀜」).
 */
export function catchSubline(item: CatchSource, repositories: readonly RepositoryOption[]): string {
  const repositoryName = repositories.find((repository) => repository.repositoryId === item.repositoryId)?.name;
  return [repositoryName, item.hasAuthorDescription ? null : "설명 안 씀", item.mismatch ? "불일치 표시됨" : null]
    .filter((part): part is string => Boolean(part)).join(" · ");
}

/**
 * 「자료 구성하기」(M3, 발행 화면의 자료 고르기를 옮김). #632부터 고르기는 체크박스(`PickCheckbox`)이고 다시 누르면 빠진다(BR3.3).
 * 막힌 이유는 이름표 안 글자라 이름과 함께 읽힌다. Space로만 고른다. 고르는 동안 서버에 쓰지 않는다.
 */
export function SourcePickerView(props: SourcePickerViewProps) {
  const sourcesFailed = props.catches.state === "error" || props.materials.state === "error" || props.pdfs.state === "error";
  const toggle = (kind: PresetItemKind, sourceId: string, eligibleReason: string | null) => {
    const picked = props.picked.has(selectionKey(kind, sourceId));
    const reason = picked ? null : eligibleReason ?? props.blockReason(kind, sourceId);
    return { picked, reason, disabled: props.disabled || (!picked && reason !== null), onClick: () => props.onToggle(kind, sourceId) };
  };
  return (
    <section className={styles.panel} aria-labelledby="preset-sources-title" data-testid="preset-sources">
      <h2 id="preset-sources-title">자료 구성하기</h2>
      {/* 자료가 많아도 「담긴 자료와 순서」가 화면 밖으로 밀려나지 않게 고르기 목록만 스크롤한다(#632 v7). */}
      <div className={styles.pickScroll} data-testid="preset-sources-scroll">
      {sourcesFailed && (
        <div role="alert" className={styles.error}>
          <p>{props.catches.errorText ?? props.materials.errorText ?? props.pdfs.errorText ?? "목록을 불러오지 못했습니다."}</p>
          <button type="button" className={styles.secondaryButton} data-testid="preset-sources-retry" disabled={props.disabled} onClick={props.onRetry}>목록 다시 불러오기</button>
        </div>
      )}
      <div className={styles.groupHead}>
        <h3>내 Catch</h3>
        <label className={styles.check}>
          <input type="checkbox" data-testid="preset-written-only" checked={props.writtenOnly} disabled={props.disabled}
            onChange={(event) => props.onWrittenOnly(event.target.checked)} />
          작성자 설명을 쓴 Catch만 보기
        </label>
      </div>
      <p className={styles.small} data-testid="preset-catches-note">공개한 Catch 중에서 선택</p>
      {props.catches.state === "loading" ? <p role="status">Catch 목록을 불러오고 있습니다.</p>
        : props.catches.state === "ready" && props.catches.items.length === 0
          ? props.writtenOnly ? <p data-testid="preset-catches-written-empty">작성자 설명을 쓴 Catch가 없습니다</p>
            : <p data-testid="preset-catches-empty">고를 수 있는 Catch가 없습니다.</p>
        : props.catches.state === "ready" && <>
          <p className={styles.small} aria-live="polite" data-testid="preset-catches-count">불러온 {props.catches.items.length}개의 Catch</p>
          <ul className={styles.picks}>
            {props.catches.items.map((item) => {
              const option = toggle("CATCH", item.catchId, item.eligible ? null : item.reason);
              const subline = catchSubline(item, props.repositories);
              return (
                <li key={item.catchId}>
                  <PickCheckbox checked={option.picked} disabled={option.disabled} onToggle={option.onClick} title={item.title}
                    subline={subline ? <span data-testid="preset-catch-subline">{subline}</span> : null} reason={option.reason} reasonTestId="preset-source-reason"
                    inputProps={{ "data-testid": "preset-catch-option", "data-source-id": item.catchId }} />
                </li>
              );
            })}
          </ul>
        </>}
      <MoreButton list={props.catches} testId="preset-catches-more" onMore={props.onMoreCatches} disabled={props.disabled} />
      <div className={styles.groupHead}><h3>내 텍스트 자료</h3></div>
      {props.materials.state === "loading" ? <p role="status">텍스트 자료 목록을 불러오고 있습니다.</p>
        : props.materials.state === "ready" && props.materials.items.length === 0
          ? <p data-testid="preset-materials-empty">고를 수 있는 텍스트 자료가 없습니다. <Link href={routes.materials}>텍스트 자료</Link>에서 만들 수 있습니다.</p>
        : props.materials.state === "ready" && (
          <ul className={styles.picks}>
            {props.materials.items.map((item) => {
              const option = toggle("TEXT_MATERIAL", item.textMaterialId, null);
              return (
                <li key={item.textMaterialId}>
                  <PickCheckbox checked={option.picked} disabled={option.disabled} onToggle={option.onClick} title={item.title}
                    reason={option.reason} reasonTestId="preset-source-reason"
                    inputProps={{ "data-testid": "preset-material-option", "data-source-id": item.textMaterialId }} />
                </li>
              );
            })}
          </ul>
        )}
      <MoreButton list={props.materials} testId="preset-materials-more" onMore={props.onMoreMaterials} disabled={props.disabled} />
      <div className={styles.groupHead}><h3>내 PDF 자료</h3></div>
      <p className={styles.small}>글 추출이 완료된 PDF만 고를 수 있습니다.</p>
      {props.pdfs.state === "loading" ? <p role="status">PDF 자료 목록을 불러오고 있습니다.</p>
        : props.pdfs.state === "ready" && props.pdfs.items.length === 0
          ? <p data-testid="preset-pdfs-empty">고를 수 있는 PDF 자료가 없습니다. <Link href={routes.materials}>자료 화면</Link>의 PDF 자료 탭에서 올릴 수 있습니다.</p>
        : props.pdfs.state === "ready" && (
          <ul className={styles.picks}>
            {props.pdfs.items.map((item) => {
              const option = toggle("PDF_MATERIAL", item.pdfMaterialId, item.eligible ? null : item.reason);
              return (
                <li key={item.pdfMaterialId}>
                  {/* 이미 담은 PDF는 상태가 바뀌었어도 뺄 수 있게 둔다. */}
                  <PickCheckbox checked={option.picked} disabled={option.disabled} onToggle={option.onClick} title={item.title}
                    subline={<span data-testid="preset-pdf-state">{item.stateLabel}</span>} reason={option.reason} reasonTestId="preset-source-reason"
                    inputProps={{ "data-testid": "preset-pdf-option", "data-source-id": item.pdfMaterialId, "data-state": item.state }} />
                </li>
              );
            })}
          </ul>
        )}
      <MoreButton list={props.pdfs} testId="preset-pdfs-more" onMore={props.onMorePdfs} disabled={props.disabled} />
      </div>
    </section>
  );
}
