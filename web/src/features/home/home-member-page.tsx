"use client";
import Link from "next/link";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { MemberStartGuide } from "@/features/start-guide/member-start-guide";
import type { HomeAction } from "./home-readiness";
import { HomeGuide } from "./home-guide";
import { useHomeReadiness } from "./use-home-readiness";
import styles from "./home.module.css";

/**
 * 로그인 후 홈(H-01, #155). (member) layout의 회원 가드 안에서만 쓴다.
 * 조회 중·조회 실패는 연결 안내를 보이지 않고 각각의 상태로 표시한다(홈 흐름 초안 §6.2).
 * 홈에는 분석 상태·결과·집계를 두지 않는다(초안 §5.1).
 */
export function HomeMemberPage() {
  const { view, retry } = useHomeReadiness();
  return (
    <>
      <h1 className={styles.lead}>GitHub 기록을 나의 경험으로 정리해 보세요.</h1>
      {/* 12월 intent U2: 회원 홈 위쪽의 고정 여섯 단계 시작 안내(BR8.1). 조회 상태와 관계없이 늘 보인다. */}
      <MemberStartGuide />
      {view.kind === "loading" && <LoadingState>계정 연결 상태를 확인하고 있습니다.</LoadingState>}
      {view.kind === "failed" && (
        <LookupFailedState title="계정 연결 상태를 확인하지 못했습니다" onRetry={retry}>
          GitHub가 연결되지 않았다는 뜻은 아닙니다. 다시 불러와 주세요.
        </LookupFailedState>
      )}
      {view.kind === "guide" && (
        <HomeGuide status={view.status} step={view.step} title={view.title} description={view.description}
          action={<HomeActionButton action={view.action} />} />
      )}
      <p className={styles.note}>결과 확인과 공개 선택은 별도입니다.</p>
    </>
  );
}

function HomeActionButton({ action }: { action: HomeAction }) {
  if (action.kind === "link") return <Link className={styles.primaryLink} href={action.href}>{action.label}</Link>;
  // 이동할 화면이 없다. 누를 수 없게 두고, 이유를 버튼 옆에 보이며 보조기기에도 연결한다.
  return (
    <>
      <button type="button" className={styles.unavailableButton} disabled aria-describedby="home-action-reason">
        {action.label}
      </button>
      <p id="home-action-reason" className={styles.unavailableReason}>{action.reason}</p>
    </>
  );
}
