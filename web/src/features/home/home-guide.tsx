import type { ReactNode } from "react";
import { HOME_STEPS, type HomeStep } from "./home-readiness";
import styles from "./home.module.css";

/**
 * 홈 연결 안내의 표시 컴포넌트(#155). 받은 내용만 그린다.
 * 데이터 조회·상태 판정·재시도·이동 대상은 `use-home-readiness.ts`·`home-readiness.ts`가 정하며 여기서 바꾸지 않는다.
 * 외형(배치·글자·색·여백)은 이 파일의 마크업과 `home.module.css`에서 다룬다.
 */
export function HomeGuide({ status, step, title, description, action }: {
  /** 연동 상태 이름(GitHub 미연결·재연결 필요·연결됨). */
  status: ReactNode;
  /** 현재 단계. null이면 단계 표시를 하지 않는다. */
  step: HomeStep | null;
  title: ReactNode;
  description: ReactNode;
  /** 다음 행동 버튼·링크와 그 안내. 이동 대상·비활성 여부는 호출하는 쪽이 정한다. */
  action: ReactNode;
}) {
  return (
    <section className={styles.guide} aria-labelledby="home-guide-title">
      <p className={styles.status}>{status}</p>
      {step !== null && (
        <ol className={styles.steps} aria-label="연결 단계">
          {HOME_STEPS.map((item) => (
            <li key={item.step} className={item.step === step ? styles.currentStep : styles.step}
              aria-current={item.step === step ? "step" : undefined}>
              {item.label}
            </li>
          ))}
        </ol>
      )}
      <h2 id="home-guide-title" className={styles.guideTitle}>{title}</h2>
      <p className={styles.guideText}>{description}</p>
      <div className={styles.guideAction}>{action}</div>
    </section>
  );
}
