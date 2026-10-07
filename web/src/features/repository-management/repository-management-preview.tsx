"use client";

import { readApiResponse } from "../../lib/api-response";
import { AssetsConnected } from "../assets/assets-connected";
import { createCatchApi } from "../assets/catch-api";
import { previewCatches, previewRepositories } from "../assets/fixtures";
import { createRepositoryApi } from "./repository-api";
import { RepositoryManagement } from "./repository-management";
import styles from "./repository-management.module.css";

// 상태별 표시를 확인하는 개발 도구. 응답은 모두 합성이며 실제 로그인·API·분석 결과가 아니다.
const scenario = () => new URLSearchParams(window.location.search).get("scenario") ?? "normal";
const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (body: unknown, status = 200) => readApiResponse(Response.json(body, { status }));
const serverError = () => json({ code: "INTERNAL_ERROR", message: "모의 오류" }, 500);

const repositories = [
  ...previewRepositories.map((repo) => {
    const [ownerLogin, name] = repo.name.split("/");
    return { repositoryId: repo.repositoryId, ownerLogin, name, url: `https://example.invalid/${repo.name}`, allowedScopeRevision: "v1" };
  }),
  ...["queue-repo", "uncertain-repo", "apply-failed-repo", "recovering-repo", "failed-repo"].map((name) => ({
    repositoryId: name, ownerLogin: "example-org", name, url: `https://example.invalid/example-org/${name}`, allowedScopeRevision: "v1",
  })),
];

let minute = 0;
function status(repositoryId: string, processing: string, application: string, extra: Record<string, unknown> = {}) {
  minute += 1;
  const time = new Date(Date.UTC(2026, 8, 30, 3, minute)).toISOString();
  return {
    requestId: `req-${repositoryId}`, repositoryId, consentId: `consent-${repositoryId}`, attemptId: `attempt-${repositoryId}`,
    submittedAt: time, updatedAt: time, requestState: "ACCEPTED", lifecycle: "ACTIVE", processing, application, sourceMode: "MOCK",
    eligibleCandidateCount: 0, registeredCatchIds: [], ownerResultsReady: false, retry: { allowed: false, reason: "IN_PROGRESS" }, failures: [],
    ...extra,
  };
}
const catchIds = (repositoryId: string) => previewCatches.filter((item) => item.repositoryId === repositoryId).map((item) => item.catchId);
const analyses = [
  status("demo-api", "SUCCEEDED", "APPLIED", { registeredCatchIds: catchIds("demo-api"), ownerResultsReady: true, retry: { allowed: false, reason: "RESULTS_EXIST" } }),
  status("demo-web", "PARTIAL_FAILED", "APPLIED", { registeredCatchIds: catchIds("demo-web"), ownerResultsReady: true, retry: { allowed: false, reason: "RESULTS_EXIST" },
    failures: [{ stage: "DRAFT", code: "DRAFT_FAILED", message: "일부 후보의 설명 초안을 만들지 못했습니다." }] }),
  status("empty-repo", "EMPTY", "APPLIED", { ownerResultsReady: true, retry: { allowed: false, reason: "NOT_FAILED" } }),
  status("queue-repo", "QUEUED", "NOT_READY"),
  status("uncertain-repo", "UNCERTAIN", "NOT_READY", { retry: { allowed: false, reason: "EXECUTION_UNCERTAIN" } }),
  status("apply-failed-repo", "SUCCEEDED", "APPLY_FAILED", { retry: { allowed: false, reason: "APPLICATION_UNRESOLVED" } }),
  status("recovering-repo", "SUCCEEDED", "RECOVERING", { retry: { allowed: false, reason: "APPLICATION_UNRESOLVED" } }),
  status("failed-repo", "FAILED", "APPLIED", { retry: { allowed: true, reason: "FAILURE_WITHOUT_RESULTS" },
    failures: [{ stage: "COLLECTION", code: "COLLECTION_FAILED", message: "저장소 기록을 읽지 못했습니다." }] }),
  status("missing-from-list", "SUCCEEDED", "APPLIED", { ownerResultsReady: true, retry: { allowed: false, reason: "NOT_FAILED" } }),
];

const repositoryApi = createRepositoryApi(async (path) => {
  await delay();
  const mode = scenario();
  const url = new URL(path, "https://fixture.invalid");
  if (url.pathname === "/me") {
    if (mode === "me-failed") return serverError();
    const state = mode === "disconnected" ? "DISCONNECTED" : mode === "reauth" ? "REAUTH_REQUIRED" : "CONNECTED";
    return json({ memberId: "preview-member", profile: {}, github: { state, accountLogin: state === "DISCONNECTED" ? null : "example-org" } });
  }
  if (mode === "failed") return serverError();
  if (url.pathname === "/me/repositories") return json({ items: repositories, page: { nextCursor: null } });
  if (url.pathname === "/analysis-requests") return json({ items: mode === "empty" ? [] : analyses, page: { nextCursor: null } });
  return json({ code: "RESOURCE_UNAVAILABLE", message: "없음" }, 404);
});

const catchApi = createCatchApi(async (path) => {
  await delay(120);
  const url = new URL(path, "https://fixture.invalid");
  if (url.pathname === "/catches") {
    const repositoryId = url.searchParams.get("repositoryId");
    return json({ items: previewCatches.filter((item) => !repositoryId || item.repositoryId === repositoryId), page: { nextCursor: null } });
  }
  const item = previewCatches.find((entry) => entry.catchId === decodeURIComponent(url.pathname.split("/").at(-1) ?? ""));
  return item ? json(item) : json({ code: "RESOURCE_UNAVAILABLE", message: "없음" }, 404);
});

export function RepositoryManagementPreview() {
  return (
    <>
      <aside className={styles.previewToolbar}>
        <strong>저장소 연결 관리 · 모의 응답</strong>
        <p>자료와 응답은 모두 예시입니다. 실제 로그인·API·분석 결과가 아닙니다.</p>
        <p>주소에 scenario=empty · failed · me-failed · disconnected · reauth를 붙여 상태를 바꿉니다.</p>
      </aside>
      <AssetsConnected api={catchApi} repositories={previewRepositories}
        repositoryManagement={(bindings) => <RepositoryManagement api={repositoryApi} bindings={bindings} />} />
    </>
  );
}
