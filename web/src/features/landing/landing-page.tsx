import { LandingRoot } from "./landing-root";
import styles from "./landing.module.css";
import { CatchGallery } from "./sections/catch-gallery";
import { Ending } from "./sections/ending";
import { Hero } from "./sections/hero";
import { Recipient } from "./sections/recipient";
import { SiteFooter } from "./sections/site-footer";
import { SiteHeader } from "./sections/site-header";
import { Story } from "./sections/story";

/**
 * `/` 비로그인 서비스 소개. 구성·지키는 것은 README.md.
 * 구간은 서버에서 그리고, 움직임은 LandingRoot가 화면에 올라온 뒤에 켠다.
 */
export function LandingPage() {
  return (
    <LandingRoot className={styles.page}>
      <SiteHeader />
      <main id="top">
        <Hero />
        <CatchGallery />
        <Story />
        <Recipient />
        <Ending />
      </main>
      <SiteFooter />
    </LandingRoot>
  );
}
