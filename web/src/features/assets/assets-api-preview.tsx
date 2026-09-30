"use client";

import { useEffect, useRef, useState } from "react";
import { readApiResponse } from "../../lib/api-response";
import { AssetsConnected, type RepositoryManagementBindings } from "./assets-connected";
import { createCatchApi } from "./catch-api";
import { previewCatches, previewRepositories } from "./fixtures";
import styles from "./assets.module.css";

// 합성 응답을 API 경계로 전달하는 개발 도구. 인증·실제 서버 연결을 가장하지 않는다.
const api = createCatchApi(async (path) => {
  await new Promise((resolve) => setTimeout(resolve, 180));
  const mode = new URLSearchParams(window.location.search).get("failure");
  if (mode === "all" || (mode === "detail" && !path.startsWith("/catches?"))) {
    return readApiResponse(Response.json({ code: "INTERNAL_ERROR", message: "모의 오류" }, { status: 500 }));
  }
  const url = new URL(path, "https://fixture.invalid");
  if (url.pathname === "/catches") {
    const filtered = previewCatches.filter((item) => !url.searchParams.get("repositoryId") || item.repositoryId === url.searchParams.get("repositoryId"));
    const offset = url.searchParams.get("cursor") === "mock-next-page" ? 2 : 0;
    return readApiResponse(Response.json({
      items: filtered.slice(offset, offset + 2),
      page: { nextCursor: offset === 0 && filtered.length > 2 ? "mock-next-page" : null },
    }));
  }
  const item = previewCatches.find((v) => v.catchId === decodeURIComponent(url.pathname.split("/").at(-1) ?? ""));
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
  return <>
    <aside className={styles.previewToolbar}><div><strong>내 자산 API 연결 동작 · 모의 응답</strong>
      <p>자료와 응답은 모두 예시입니다. 실제 로그인·API·DB 연결 검증 화면이 아닙니다.</p>
      <p>조회 실패는 주소에 failure=all, 상세만 실패는 failure=detail을 추가해 확인합니다.</p></div></aside>
    <AssetsConnected api={api} repositories={previewRepositories}
      repositoryManagement={(bindings) => <ManagementPreview bindings={bindings} />} />
  </>;
}

