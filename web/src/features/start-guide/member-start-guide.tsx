import Link from "next/link";
import { MEMBER_START_STEPS, START_GUIDE_TITLE } from "./member-start-steps";
import styles from "./start-guide.module.css";

/** 회원 홈 위에 늘 보이는 여섯 단계 안내(12월 intent U2 BR8.1). 상태를 저장하지 않는 정적 안내다. */
export function MemberStartGuide() {
  return (
    <section className={styles.guide} aria-labelledby="member-start-guide-title" data-testid="member-start-guide">
      <h2 id="member-start-guide-title" className={styles.title}>{START_GUIDE_TITLE}</h2>
      <ol className={styles.steps}>
        {MEMBER_START_STEPS.map((step) => (
          <li key={step.id} className={styles.step}>
            <span className={styles.stepTitle}>{step.title}</span>
            <Link className={styles.stepLink} href={step.link.href} data-testid={`start-guide-link-${step.id}`}>{step.link.label}</Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
