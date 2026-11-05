"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { api } from "../../lib/api";
import { loginPath } from "../../lib/member-navigation";
import { routes } from "../../lib/routes";
import { createJdApi, managementTransport, type JdApi } from "./jd-api";
import { createJdManagementModel } from "./jd-management-model";
import { JdEditor, JdList } from "./jd-management-view";
import { jdSessionDeps, useJdSession } from "./jd-session";
import styles from "./jd.module.css";

const managementApi = createJdApi(managementTransport(api.member));

/** PATCH 제공 전에도 본인 JD 목록·상세·생성·삭제는 기존 회원 호출을 사용한다. */
export function JdManagementPage({ client = managementApi, canUpdate = false }: { client?: JdApi; canUpdate?: boolean }) {
  const session = useJdSession();
  const model = useMemo(() => {
    // 공용 인증 세대가 바뀌면 이전 계정의 편집·목록 저장소를 사용하지 않는다.
    void session.identity;
    void session.loggedIn;
    return createJdManagementModel(client, jdSessionDeps);
  }, [client, session.identity, session.loggedIn]);
  const state = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  useEffect(() => {
    model.activate();
    if (session.loggedIn) void model.load();
    else model.clear();
    return () => model.dispose();
  }, [model, session.loggedIn]);
  if (!session.loggedIn || state.loginRequired) return <main className={styles.page}><h1>JD 관리</h1><p>로그인 후 JD를 관리할 수 있습니다.</p><a data-testid="jd-login" href={loginPath(routes.jds)}>로그인</a></main>;
  return <main className={styles.page}>
    <h1>JD 관리</h1><p>지원할 채용공고의 요구사항을 저장하고, 공유받은 자료에서 요약에 사용할 수 있습니다.</p>
    <div className={styles.management}><JdList state={state} model={model} /><JdEditor state={state} model={model} canUpdate={canUpdate} /></div>
  </main>;
}
