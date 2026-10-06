"use client";

import { useState } from "react";
import { GuestHeader } from "@/components/header/guest-header";
import { MemberHeader } from "@/components/header/member-header";
import { RecipientHeader } from "@/components/header/recipient-header";
import { EmptyState, LoadingState, LookupFailedState } from "@/components/status/status";
import styles from "./preview.module.css";

/** 공통 헤더·상태 표시를 모의 상태로 확인하는 개발 도구. 실제 세션·API를 쓰지 않는다. */
export function CommonPreview() {
  const [log, setLog] = useState("아직 없음");

  return (
    <div className={styles.page}>
      <p className={styles.notice}>개발용 미리보기 — 모의 상태이며 실제 로그인·API와 연결되지 않았습니다.</p>

      <section className={styles.section} aria-labelledby="preview-member">
        <h2 id="preview-member">로그인 일반 헤더 — 실제 화면 상태 (로그아웃 연결 전)</h2>
        <MemberHeader />
        <p className={styles.caption}>PR①의 (member) 화면과 같습니다. 로그아웃은 PR②에서 연결되기 전까지 &apos;연결 전&apos;으로 보입니다.</p>
      </section>

      <section className={styles.section} aria-labelledby="preview-member-mock">
        <h2 id="preview-member-mock">로그인 일반 헤더 — 모의 로그아웃 연결</h2>
        <MemberHeader onLogout={() => setLog("로그아웃 요청(모의)")} />
        <p className={styles.caption}>미리보기에서만 로그아웃을 모의로 연결했습니다. 마지막 동작: {log}</p>
      </section>

      <section className={styles.section} aria-labelledby="preview-guest">
        <h2 id="preview-guest">비로그인 일반 헤더</h2>
        <GuestHeader />
      </section>

      <section className={styles.section} aria-labelledby="preview-recipient">
        <h2 id="preview-recipient">수신자 헤더 (로그인 여부 무관)</h2>
        <RecipientHeader />
      </section>

      <section className={styles.section} aria-labelledby="preview-status">
        <h2 id="preview-status">조회 상태 공통 표시</h2>
        <div className={styles.grid}>
          <LoadingState>Catch 목록을 불러오고 있습니다.</LoadingState>
          <LookupFailedState onRetry={() => setLog("다시 불러오기(모의)")}>
            목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </LookupFailedState>
          <EmptyState title="아직 발행한 링크가 없습니다">새 링크를 발행하면 여기에 표시됩니다.</EmptyState>
        </div>
      </section>
    </div>
  );
}
