import { DemoPointer, WindowChrome } from "./demo-parts";

/**
 * 기능 3 스크롤 시연(Catch 내용이 맞는지 보기 → 공개 전환 단추 켜기).
 * 앱에서 내용 확인을 공개에 합쳐(#635) 확인을 따로 하는 단계와 확인 표지를 그리지 않는다. 「공개 선택」 한 구역뿐이다.
 * 화면 속 버튼·입력·탭·전환 단추는 그림이다(span). 누를 수 없고 어떤 요청도 보내지 않는다.
 * data-target·data-from·data-until 같은 속성은 playback/scene-renderer.ts가 읽는 시간표다.
 */
export function VerificationDemo() {
  return (
    <section aria-label="기능 03 스크롤 시연" className="demo14 demo16 scroll-demo36" data-player="verification">
      <div className="demo-label14">
        <span>스크롤 시연 · 가상 예시</span>
        <span>스크롤로 단계 이동 · 결과 유지</span>
      </div>
      <div className="stage14">
        <div aria-hidden="true" className="frame14" data-scene="0">
          <div className="app-window">
            <WindowChrome>
              <span className="tab49 on49">CatchU</span>
              <span className="tab49">GitHub 새 탭</span>
              가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>request-handler.ts 코드 수정</h3>
              <div className="catch-block" data-cursor-anchor="center" data-target="catch-read">
                <div className="fact">
                  <span className="inline-label">기록에서 확인한 내용</span>
                  <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
                </div>
                <div className="row-meta catch-meta">
                  <span>근거 2개</span>
                  <span>한 저장소 · 내가 기여한 기록</span>
                </div>
              </div>
              <div className="public-block">
                <div className="panel-title">공개 선택</div>
                <p data-until="6700">작업 사실과 나의 기여가 맞는지 본 뒤 공개하세요. 공개하기 전에는 나만 봅니다.</p>
                <p data-from="6700">공개한 Catch만 발행 · 언제든 다시 숨기기</p>
                <span className="switch-row">
                  <span className="switch-target" data-cursor-anchor="center" data-target="publish-switch">
                    <span className="switch-track" data-until="6700" />
                    <span className="switch-track on" data-from="6700" />
                  </span>
                  <span data-until="6700">미공개</span>
                  <span data-from="6700">공개 설정</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="summary14" data-summary="">
          <div className="app-window">
            <WindowChrome>
              <span className="tab49 on49">CatchU</span>
              <span className="tab49">GitHub 새 탭</span>
              가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>request-handler.ts 코드 수정</h3>
              <div className="catch-block">
                <div className="fact">
                  <span className="inline-label">기록에서 확인한 내용</span>
                  <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
                </div>
                <div className="row-meta catch-meta">
                  <span>근거 2개</span>
                  <span>한 저장소 · 내가 기여한 기록</span>
                </div>
              </div>
              <div className="public-block">
                <div className="panel-title">공개 선택</div>
                <p>공개한 Catch만 발행 · 언제든 다시 숨기기</p>
                <span className="switch-row">
                  <span className="switch-target">
                    <span className="switch-track on" />
                  </span>
                  <span>공개 설정</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <DemoPointer />
      </div>
      <p className="caption14" data-caption="">Catch 내용이 맞는지 보기 → 공개 켜기</p>
      <span className="sr-only14">무음 스크롤 시연. 모션 감소 설정에서는 정적 요약을 제공합니다.</span>
    </section>
  );
}
