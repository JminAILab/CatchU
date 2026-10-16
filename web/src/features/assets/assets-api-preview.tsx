"use client";

import { useEffect, useRef, useState } from "react";
import { readApiResponse } from "../../lib/api-response";
import { AssetsConnected, type RepositoryManagementBindings } from "./assets-connected";
import { createCatchApi } from "./catch-api";
import { previewCatches, previewRepositories } from "./fixtures";
import styles from "./assets.module.css";

// 합성 응답을 API 경계로 전달하는 개발 도구. 인증·실제 서버 연결을 가장하지 않는다.
const records = new Map(previewCatches.map((item) => [item.catchId, structuredClone(item)]));
const api = createCatchApi(async (path, options) => {
  await new Promise((resolve) => setTimeout(resolve, 180));
  const mode = new URLSearchParams(window.location.search).get("failure");
  if (mode === "all" || (mode === "detail" && !path.startsWith("/catches?"))) {
    return readApiResponse(Response.json({ code: "INTERNAL_ERROR", message: "모의 오류" }, { status: 500 }));
  }
  const url = new URL(path, "https://fixture.invalid");
  if (options.method === "PUT") {
    if (mode === "save") return readApiResponse(Response.json({ code: "INTERNAL_ERROR", message: "모의 저장 실패" }, { status: 500 }));
    const parts = url.pathname.split("/");
    const catchId = decodeURIComponent(parts[2]);
    const current = records.get(catchId);
    if (!current) return readApiResponse(Response.json({ code: "RESOURCE_UNAVAILABLE", message: "열 수 없음" }, { status: 404 }));
    if (parts[3] === "visibility" && options.body?.visibility === "PUBLIC") {
      if (!current.confirmation.workFactsConfirmed || !current.confirmation.contributionConfirmed)
        return readApiResponse(Response.json({ code: "CONFIRMATION_REQUIRED", message: "확인 필요" }, { status: 409 }));
      if (current.restriction === "SOURCE_PRIVATE")
        return readApiResponse(Response.json({ code: "SOURCE_RESTRICTED", message: "보호됨" }, { status: 409 }));
    }
    const updated = parts[3] === "confirmation" ? { ...current, confirmation: { workFactsConfirmed: true, contributionConfirmed: true } }
      : parts[3] === "mismatch" ? { ...current, mismatch: options.body?.mismatch === true }
      : { ...current, visibility: options.body?.visibility === "PUBLIC" ? "PUBLIC" as const : "PRIVATE" as const };
    records.set(catchId, updated);
    return readApiResponse(Response.json(updated));
  }
  if (url.pathname === "/catches") {
    const filtered = [...records.values()].filter((item) => !url.searchParams.get("repositoryId") || item.repositoryId === url.searchParams.get("repositoryId"));
    const offset = url.searchParams.get("cursor") === "mock-next-page" ? 2 : 0;
    return readApiResponse(Response.json({
      items: filtered.slice(offset, offset + 2),
      page: { nextCursor: offset === 0 && filtered.length > 2 ? "mock-next-page" : null },
    }));
  }
  const item = records.get(decodeURIComponent(url.pathname.split("/").at(-1) ?? ""));
  return readApiResponse(item ? Response.json(item)
    : Response.json({ code: "RESOURCE_UNAVAILABLE", message: "열 수 없음" }, { status: 404 }));
});

function ManagementPreview({ bindings }: { bindings: RepositoryManagementBindings }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  function close() { setOpen(false); bindings.onClosed(); }
  return <section className={styles.managementPlaceholder}>
    <div><h2>연결 관리 콜백 확인용</h2><p>D의 실제 저장소 관리 화면은 연결 전입니다.</p></div>
    <button className={styles.secondaryButton} onClick={() => { bindings.onOpen(); setOpen(true); }}>연결 관리 열기 (모의)</button>
    {open && <dialog ref={dialog} className={styles.dialog} aria-label="모의 저장소 관리" onCancel={(e) => { e.preventDefault(); close(); }}>
      <h2>모의 저장소 관리</h2>
      <p>저장소를 선택하면 모달을 닫고 해당 목록을 다시 불러옵니다.</p>
      {previewRepositories.map((repo) => <p key={repo.repositoryId}><button className={styles.secondaryButton}
        onClick={() => { setOpen(false); bindings.onShowRepository(repo.repositoryId); }}>{repo.name} Catch 보기</button></p>)}
      <button className={styles.primaryButton} onClick={close}>닫고 목록 갱신</button>
    </dialog>}
  </section>;
}

export function AssetsApiPreview() {
  return <div className={`${styles.preview} ${styles.standalonePreview}`}>
    <aside className={styles.previewToolbar}><div><strong>내 자산 API 연결 동작 · 모의 응답</strong>
      <p>자료와 응답은 모두 예시입니다. 실제 로그인·API·DB 연결 검증 화면이 아닙니다.</p>
      <p>조회 실패는 failure=all, 상세 실패는 failure=detail, 저장 실패는 failure=save로 확인합니다. 저장은 메모리의 합성 자료에만 적용되고 새로고침하면 초기화됩니다.</p></div></aside>
    <AssetsConnected api={api} repositories={previewRepositories}
      repositoryManagement={(bindings) => <ManagementPreview bindings={bindings} />} />
  </div>;
}

