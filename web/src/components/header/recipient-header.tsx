import styles from "./header.module.css";

/**
 * 공유 링크 수신자 전용 헤더(#55 10월 합의).
 * 로그인 여부와 관계없이 이동 없는 CatchU 브랜드만 표시한다. 로그인·프로필 버튼을 두지 않는다.
 */
export function RecipientHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <span className={styles.brandStatic}>CatchU</span>
      </div>
    </header>
  );
}
