import { DemoPointer, WindowChrome } from "./demo-parts";

/**
 * 기능 1 스크롤 시연(저장소 선택 → 분석 요청 → 분석 완료 → Catch 목록).
 * 화면 속 버튼·입력·탭은 그림이다(span). 누를 수 없고 어떤 요청도 보내지 않는다.
 * data-target·data-from·data-until 같은 속성은 playback/scene-renderer.ts가 읽는 시간표다.
 */
export function RecordsDemo() {
  return (
    <section aria-label="기능 01 스크롤 시연" className="demo14 demo16 scroll-demo36" data-player="records">
      <div className="demo-label14">
        <span>스크롤 시연 · 가상 예시</span>
        <span>스크롤로 단계 이동 · 결과 유지</span>
      </div>
      <div className="stage14">
        <div aria-hidden="true" className="frame14" data-scene="0">
          <div className="app-window">
            <WindowChrome>
              CatchU · 연결 관리 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>등록한 저장소에서 분석 대상 선택</h3>
              <p className="subtle">GitHub 공개 저장소 · 등록을 마친 예시</p>
              <div className="repository-choice21">
                <span className="check16 radio19" data-target="repository">
                  <span data-from="2050">●</span>
                </span>
                <b>sample-project</b>
                <span className="selection-note21" data-from="2050">선택됨</span>
              </div>
              <div className="request-reserve21">
                <div data-until="13500">
                  <div className="notice-reserve21">
                    <div data-until="5000">
                      <p className="note-strip">저장소를 선택한 뒤 분석 안내를 확인합니다. 선택만으로 분석이 시작되지 않습니다.</p>
                    </div>
                    <div data-from="5000">
                      <div className="app-panel">
                        <div className="panel-title">분석 안내 · 일부 발췌</div>
                        <p>이 동의는 지금 요청하는 분석 한 번에만 쓰입니다.</p>
                        <p>읽은 기록에서 본인 작업을 묶고 근거 링크를 붙여 Catch로 만듭니다.</p>
                      </div>
                      <p className="subtle">[동의하고 분석 요청]을 누르면 위 안내에 동의하고 선택한 저장소의 분석을 요청합니다.</p>
                    </div>
                  </div>
                  <div className="request-button21">
                    <span className="action16" data-disable-after="12500" data-from="5000" data-target="consent-request">
                      <span data-until="12500">동의하고 분석 요청</span>
                      <span data-from="12500">요청 중…</span>
                    </span>
                  </div>
                </div>
                <div className="accepted21" data-from="13500">
                  <span className="badge green">접수 안내</span>
                  <p>분석 요청을 접수했습니다. 분석이 끝난 것은 아닙니다.</p>
                </div>
              </div>
              <div className="note-strip">합성 시연 · 실제 동의나 분석 요청을 보내지 않습니다.</div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="1">
          <div className="app-window">
            <WindowChrome>
              CatchU · 분석 상태 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <div className="analysis-heading21">
                <h3>연결된 저장소</h3>
                <span className="secondary16" data-disable-after="4200" data-target="refresh-status">상태 새로고침</span>
              </div>
              <div className="app-panel analysis-card21">
                <b>sample-project</b>
                <div className="analysis-state21">
                  <div data-until="4200">
                    <span className="badge">… 분석 중</span>
                    <p>저장소를 분석하고 있습니다.</p>
                  </div>
                  <div data-from="4200" data-until="4900">
                    <p>저장소 상태를 불러오고 있습니다.</p>
                  </div>
                  <div data-from="4900">
                    <span className="badge green">✓ 성공</span>
                    <p>분석을 마쳤습니다. Catch 1개가 준비되었습니다.</p>
                  </div>
                </div>
                <div className="analysis-action21">
                  <span className="action16" data-from="4900" data-target="show-catches">이 저장소 Catch 보기</span>
                </div>
              </div>
              <div className="note-strip">가상 예시 · 실제 분석 소요 시간을 나타내지 않습니다.</div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="2">
          <div className="app-window">
            <WindowChrome>
              CatchU · 내 자산 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>내 Catch</h3>
              <div className="row-meta">
                <span>저장소 · sample-project</span>
                <span>1개의 Catch</span>
              </div>
              <p>카드를 눌러 설명과 근거를 자세히 살펴보세요.</p>
              <div className="app-panel">
                <div className="row-meta">
                  <b>sample-project</b>
                  <span>
                    <span className="badge">확인 전</span>
                    {" "}
                    <span className="badge">미공개</span>
                  </span>
                </div>
                <h3>
                  <span className="title-action18">request-handler.ts 코드 수정</span>
                </h3>
                <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
                <div className="row-meta">
                  <span>근거 2개</span>
                  <span>상세 보기 ↗</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="summary14" data-summary="">
          <div className="app-window">
            <WindowChrome>
              CatchU · 내 자산 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>내 Catch</h3>
              <div className="row-meta">
                <span>저장소 · sample-project</span>
                <span>1개의 Catch</span>
              </div>
              <p>카드를 눌러 설명과 근거를 자세히 살펴보세요.</p>
              <div className="app-panel">
                <div className="row-meta">
                  <b>sample-project</b>
                  <span>
                    <span className="badge">확인 전</span>
                    {" "}
                    <span className="badge">미공개</span>
                  </span>
                </div>
                <h3>
                  <span className="title-action18">request-handler.ts 코드 수정</span>
                </h3>
                <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
                <div className="row-meta">
                  <span>근거 2개</span>
                  <span>상세 보기 ↗</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DemoPointer />
      </div>
      <p className="caption14" data-caption="">관련 기록을 가리켜 확인합니다 · 클릭 동작 없음</p>
      <span className="sr-only14">무음 스크롤 시연. 모션 감소 설정에서는 정적 요약을 제공합니다.</span>
    </section>
  );
}
