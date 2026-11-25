import { mountEndingPin } from "./ending-pin";
import { mountGalleryMarquee } from "./gallery-marquee";
import { mountHeroPlayer } from "./hero-player";
import { watchMotionPreference } from "./motion";
import { mountRecipient } from "./recipient-controller";
import { resetScrollOnReload } from "./reload-reset";
import { createScope } from "./scope";
import { mountStory } from "./story-controller";
import { mountTitleHighlight } from "./title-highlight";
import { watchViewportFit } from "./viewport-fit";

/**
 * 소개 화면의 움직임을 한 번에 켠다. 돌려주는 함수가 이벤트·관찰자·타이머·예약한 프레임을 모두 정리한다.
 * 구간마다 따로 실패한다. 한 구간이 켜지지 못해도 그 구간만 정적 화면으로 남고 나머지는 움직인다.
 * 순서가 있다. 대표 재생기가 등장 효과를 켜고(면접관 구간이 그것을 기다린다), 창 높이 읽기가 고정 구간보다 먼저다.
 */
export function mountLanding(page: HTMLElement): () => void {
  const scope = createScope();
  const motion = watchMotionPreference(scope);
  const steps: Array<() => void> = [
    () => resetScrollOnReload(),
    () => mountHeroPlayer(page, scope, motion),
    () => mountTitleHighlight(page, scope, motion),
    () => mountGalleryMarquee(page, scope, motion),
    () => watchViewportFit(page, scope),
    () => mountStory(page, scope, motion),
    () => mountRecipient(page, scope, motion),
    () => mountEndingPin(page, scope),
  ];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      // 구간 하나의 실패가 다른 구간을 막지 않게 한다. 원인은 개발 도구에서 볼 수 있게 남긴다(사용자 자료는 없다).
      console.error("[landing] 구간을 켜지 못했습니다", error);
    }
  }
  return () => scope.dispose();
}
