/** 한 번 열린 문서에서 한 번만 한다. 다른 화면에 다녀와도 다시 하지 않는다. */
let handled = false;

/**
 * 새로고침했을 때만 맨 위에서 시작한다. 시연의 진행 시간은 저장하지 않으므로, 맨 위에서 0부터 다시 보는 것이 맞다.
 * 보통 스크롤, 탭 전환, 뒤로 가기로 돌아온 화면(bfcache)은 건드리지 않는다.
 */
export function resetScrollOnReload() {
  if (handled) return;
  handled = true;
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation?.type !== "reload") return;
  // 다른 화면을 새로고침한 뒤 앱 안에서 넘어온 경우는 새로고침이 아니다.
  if (new URL(navigation.name, window.location.href).pathname !== window.location.pathname) return;
  const previous = history.scrollRestoration;
  history.scrollRestoration = "manual";
  const top = () => window.scrollTo({ left: 0, top: 0, behavior: "instant" });
  top();
  // 첫 배치 동안 브라우저가 옛 위치로 되돌리는 것만 막고, 설정은 돌려놓는다.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      top();
      history.scrollRestoration = previous;
    }),
  );
}
