"use client";

import { useEffect, useRef, useState } from "react";
import { readApiResponse } from "../../lib/api-response";
import { AssetsConnected, type RepositoryManagementBindings } from "./assets-connected";
import { createAuthorDescriptionApi } from "./author-description-api";
import { createCatchApi } from "./catch-api";
import { previewCatches, previewRepositories } from "./fixtures";
import styles from "./assets.module.css";

// 합성 응답을 API 경계로 전달하는 개발 도구. 인증·실제 서버 연결을 가장하지 않는다.
const records = new Map(previewCatches.map((item) => [item.catchId, structuredClone(item)]));
// 「다시 볼 곳」 칸 확인용 합성 사실(#635). 고정 자료는 다른 미리보기도 쓰므로 이 화면의 사본 첫 Catch에만 넣는다. 합성 자료라 커밋은 링크가 아니라 글자로 보인다.
records.set(previewCatches[0].catchId, { ...structuredClone(previewCatches[0]), revisitFacts: [
  { kind: "REWORKED_LINES", paths: ["src/errors/error-response.ts"], commits: ["4f1c9a2e7b3d5c8a1f6e0b9d2c4a7e5f3b8d1c06", "a7d3e5f1c9b2d4e6f8a0c1b3d5e7f9a2c4b6d8e0"] },
  { kind: "TEST_FILES_PRESENT", paths: ["test/errors/error-response.test.ts"], commits: ["c2e4f6a8b0d1e3f5a7c9b2d4e6f8a0c1e3b5d7f9"] },
] });
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
    // 저장소·작성자 설명 조건은 api처럼 서버 쪽에서 거른다(새 Catch C1). 커서는 이 모의 응답에서만 쓰는 값이다.
    const authorDescription = url.searchParams.get("authorDescription");
    const filtered = [...records.values()].filter((item) => (!url.searchParams.get("repositoryId") || item.repositoryId === url.searchParams.get("repositoryId"))
      && (authorDescription === null || item.hasAuthorDescription === (authorDescription === "written")));
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

// 작성자 설명 편집 확인용 합성 설명(#634). 첫 Catch는 옛 칸 제목으로 쓴 글, 둘째는 칸 제목 없는 옛 자유 글, 나머지는 설명이 없다.
const descriptions = new Map<string, string>([
  [previewCatches[0].catchId, "【이 작업에서 정한 것】\n[합성] 오류 종류별로 응답을 나누기로 했다.\n\n【맡은 부분】\n[합성] 오류 응답 분기와 그 검사\n\n"
    + "【어떻게 확인했나·결과】\n[합성] 분기별 검사 두 개로 확인했다."],
  [previewCatches[1].catchId, "[합성] 칸 제목 없이 쓴 옛 설명입니다."],
]);
const descriptionApi = createAuthorDescriptionApi(async (path, options = {}) => {
  await new Promise((resolve) => setTimeout(resolve, 180));
  const mode = new URLSearchParams(window.location.search).get("failure");
  const catchId = decodeURIComponent(path.split("/")[2] ?? "");
  if (options.method === "PUT") {
    if (mode === "save") return readApiResponse(Response.json({ code: "INTERNAL_ERROR", message: "모의 저장 실패" }, { status: 500 }));
    if (mode === "login") return readApiResponse(Response.json({ code: "AUTH_INVALID", message: "모의 로그인 만료" }, { status: 401 }));
    const body = options.body as { description?: unknown } | undefined;
    const value = typeof body?.description === "string" ? body.description : "";
    if (value.trim()) descriptions.set(catchId, value); else descriptions.delete(catchId);
  }
  const stored = descriptions.get(catchId) ?? null;
  return readApiResponse(Response.json({ authorDescription: stored, authorDescriptionUpdatedAt: stored === null ? null : new Date().toISOString() }));
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
      <p>조회 실패는 failure=all, 상세 실패는 failure=detail, 저장 실패는 failure=save로 확인합니다. 작성자 설명 저장의 로그인 만료는 failure=login입니다.
        저장은 메모리의 합성 자료에만 적용되고 새로고침하면 초기화됩니다.</p></div></aside>
    <AssetsConnected api={api} descriptionApi={descriptionApi} repositories={previewRepositories}
      repositoryManagement={(bindings) => <ManagementPreview bindings={bindings} />} />
  </div>;
}

