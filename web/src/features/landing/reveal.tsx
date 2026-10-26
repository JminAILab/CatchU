"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./landing.module.css";

/** 화면 높이의 이 비율(과 요소 높이의 이 비율 중 작은 쪽)만큼 보이면 조립한다. */
const VISIBLE_RATIO = 0.66;
/** 낮은 창에서 위 조건을 못 채우고 걸쳐만 있을 때 이 시간 뒤에는 조립한다(ms). */
const FALLBACK_DELAY = 1200;
const THRESHOLDS = Array.from({ length: 21 }, (_, index) => index / 20);

/**
 * 스크롤로 들어오는 설명용 카드의 등장 효과(#395). 스크롤은 브라우저 기본 그대로 두고 카드만 한 번 조립한다.
 * - 효과 전의 숨김은 이 컴포넌트가 브라우저에서 켠 뒤에만 적용된다. JS가 꺼져 있으면 처음부터 모두 보인다.
 * - 움직임 줄이기 설정, 폭 760px 이하, IntersectionObserver가 없는 브라우저에서는 숨기지 않는다.
 * - 이미 화면에 걸린 카드는 숨기지 않는다. 지나쳐 버린 카드와 낮은 창에서 걸쳐 있는 카드는 곧 보여 준다.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 761px)");
    if (reduced.matches || !wide.matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    element.dataset.reveal = "armed";
    const show = () => {
      element.dataset.reveal = "shown";
      stop();
    };
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry.isIntersecting) {
        clearTimeout(timer);
        timer = undefined;
        // 위로 지나쳐 버린 카드는 숨겨 두지 않는다.
        if (entry.boundingClientRect.bottom <= 0) show();
        return;
      }
      const viewport = entry.rootBounds?.height ?? window.innerHeight;
      const needed = Math.min(entry.boundingClientRect.height, viewport) * VISIBLE_RATIO;
      if (entry.intersectionRect.height >= needed - 1) show();
      else if (timer === undefined) timer = setTimeout(show, FALLBACK_DELAY);
    }, { threshold: THRESHOLDS });
    observer.observe(element);
    reduced.addEventListener("change", show);
    wide.addEventListener("change", show);
    window.addEventListener("beforeprint", show);

    function stop() {
      observer.disconnect();
      clearTimeout(timer);
      reduced.removeEventListener("change", show);
      wide.removeEventListener("change", show);
      window.removeEventListener("beforeprint", show);
    }
    return () => {
      stop();
      delete element.dataset.reveal;
    };
  }, []);
  return <div ref={ref} className={`${styles.reveal} ${className ?? ""}`}>{children}</div>;
}
