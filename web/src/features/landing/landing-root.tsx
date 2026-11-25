"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { mountLanding } from "./playback/mount";

/**
 * 소개 화면의 바깥 틀. 안쪽 구간은 서버에서 그린 그대로 두고, 화면에 올라온 뒤 움직임(playback/)만 켠다.
 * 화면을 떠나면 켠 것을 모두 정리한다. 서버 호출·저장·클립보드가 없다.
 */
export function LandingRoot({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return mountLanding(ref.current);
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
