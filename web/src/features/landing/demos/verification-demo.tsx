import { DemoPointer, WindowChrome } from "./demo-parts";

/**
 * 기능 3 스크롤 시연(두 항목 확인 → 확인 완료 → 공개 선택).
 * 화면 속 버튼·입력·탭은 그림이다(span). 누를 수 없고 어떤 요청도 보내지 않는다.
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
              <div className="confirm-block">
                <div className="panel-title">내용 확인</div>
                <div data-from="0" data-until="7000">
                  <div className="checkrow">
                    <span className="check16" data-target="facts">
                      <span data-from="2100">✓</span>
                    </span>
                    <span>근거를 보고 작업 사실을 확인했습니다.</span>
                  </div>
                  <div className="checkrow">
                    <span className="check16" data-target="contribution">
                      <span data-from="4100">✓</span>
                    </span>
                    <span>나의 기여 범위를 확인했습니다.</span>
                  </div>
                  <span className="action16" data-disable-before="4100" data-target="confirm">확인 완료</span>
                </div>
                <div data-from="7000">
                  <span className="badge green">확인 완료</span>
                  <p>작업 사실과 나의 기여를 확인했습니다.</p>
                </div>
              </div>
              <div className="public-block">
                <div className="panel-title">공개 선택</div>
                <div data-from="0" data-until="12800">
                  <span className="badge">미공개</span>
                  <p>확인만으로 공개되지 않습니다.</p>
                  <span className="action16" data-disable-before="7000" data-target="publish-catch">지금 공개</span>
                </div>
                <div data-from="12800">
                  <span className="badge green">공개</span>
                  <p>공개를 별도로 선택했습니다.</p>
                  <span className="secondary16">숨기기</span>
                </div>
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
              <div className="confirm-block">
                <div className="panel-title">내용 확인</div>
                <div data-from="7000">
                  <span className="badge green">확인 완료</span>
                  <p>작업 사실과 나의 기여를 확인했습니다.</p>
                </div>
              </div>
              <div className="public-block">
                <div className="panel-title">공개 선택</div>
                <div data-from="12800">
                  <span className="badge green">공개</span>
                  <p>공개를 별도로 선택했습니다.</p>
                  <span className="secondary16">숨기기</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DemoPointer />
      </div>
      <p className="caption14" data-caption="">두 항목 확인 → 확인 완료·미공개 → 지금 공개</p>
      <span className="sr-only14">무음 스크롤 시연. 모션 감소 설정에서는 정적 요약을 제공합니다.</span>
    </section>
  );
}
