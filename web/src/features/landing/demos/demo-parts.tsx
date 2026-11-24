import type { ReactNode } from "react";

/** 시연 창의 머리줄. 신호등 점 세 개, 창 이름, 줄임표를 그린다. `github`은 GitHub 새 탭을 흉내 낸 어두운 머리줄이다. */
export function WindowChrome({ github = false, children }: { github?: boolean; children: ReactNode }) {
  return (
    <div className={github ? "app-chrome github49" : "app-chrome"}>
      <span className="chrome-dots">
        <i />
        <i />
        <i />
      </span>
      <span className="chrome-name">{children}</span>
      <span>⋯</span>
    </div>
  );
}

/** 시연 포인터(화살표)와 클릭 순간의 고리. 위치·투명도는 재생 제어 코드가 정한다. 실제 마우스가 아니다. */
export function DemoPointer() {
  return (
    <>
      <div aria-hidden="true" className="cursor16">
        <svg viewBox="0 0 24 30">
          <path d="M2 2 L2 23 L8 18 L13 28 L17 26 L12 16 L21 15 Z" />
        </svg>
        <i className="touch16" />
      </div>
      <div aria-hidden="true" className="pulse16" />
    </>
  );
}

/** 작업 기록 한 줄 앞의 커밋 모양 아이콘. */
export function RecordIcon({ label }: { label?: string }) {
  return (
    <span aria-label={label} className="record-icon22">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 12h5m8 0h5" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    </span>
  );
}
