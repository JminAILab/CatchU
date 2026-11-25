import type { CSSProperties } from "react";
import { DemoPointer, WindowChrome } from "./demo-parts";

/**
 * 기능 2 스크롤 시연(Catch 설명 → 원본 근거 새 탭 → 코드 패널 확대).
 * 화면 속 버튼·입력·탭은 그림이다(span). 누를 수 없고 어떤 요청도 보내지 않는다.
 * data-target·data-from·data-until 같은 속성은 playback/scene-renderer.ts가 읽는 시간표다.
 */
export function EvidenceDemo() {
  return (
    <section aria-label="기능 02 스크롤 시연" className="demo14 demo16 scroll-demo36" data-player="evidence">
      <div className="demo-label14">
        <span>스크롤 시연 · 가상 예시</span>
        <span>스크롤로 단계 이동 · 결과 유지</span>
      </div>
      <div className="stage14">
        <div aria-hidden="true" className="frame14" data-scene="0">
          <div className="app-window evidence-start22">
            <WindowChrome>
              <span className="tab49 on49">CatchU</span>
              <span className="tab49">GitHub 새 탭</span>
              가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>request-handler.ts 코드 수정</h3>
              <span className="inline-label">기록에서 확인한 내용</span>
              <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
              <div className="evidence-row source-row21">
                <div>
                  <b>근거 1 · 요청 처리 변경</b>
                  <div className="file-line">request-handler.ts · a1b2c3</div>
                </div>
                <span className="small-action21" data-target="source">원본 근거 열기 ↗</span>
              </div>
              <div className="note-strip">원본 근거 열기는 GitHub를 새 탭으로 엽니다.</div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="1">
          <div className="app-window source-window22">
            <WindowChrome github>
              <span className="tab49">CatchU</span>
              <span className="tab49 on49">GitHub 새 탭</span>
              원본 확인 · 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>요청 처리 로직 수정</h3>
              <div className="row-meta">
                <b>sample-project</b>
                <span className="badge">a1b2c3</span>
              </div>
              <div className="code-slot22">
                <div className="code-focus22">
                  <div className="source-file21">
                    <b>request-handler.ts</b>
                    <span>변경 부분 · 합성 예시</span>
                  </div>
                  <div className="code-window21">
                    <div className="code-line21 context21">{"async function handle(request) {"}</div>
                    <div className="code-line21 removed21">− const result = processRequest(request);</div>
                    <div className="code-line21 added21">+ const result = await processRequest(request);</div>
                    <div className="code-line21 context21">
                      {"  return result;"}
                      <br />
                      {"}"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="source-relationship21">
                <b>GitHub에서 원본 확인</b>
                <p>요청 처리 파일의 코드 변경을 확인합니다.</p>
              </div>
              <div className="note-strip">GitHub 화면을 간추린 가상 예시입니다 · CatchU 안에서는 코드를 펼치지 않습니다.</div>
            </div>
          </div>
        </div>
        <div className="summary14" data-summary="">
          <div className="app-window source-window22">
            <WindowChrome github>
              <span className="tab49">CatchU</span>
              <span className="tab49 on49">GitHub 새 탭</span>
              원본 확인 · 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>요청 처리 로직 수정</h3>
              <div className="row-meta">
                <b>sample-project</b>
                <span className="badge">a1b2c3</span>
              </div>
              <div className="code-slot22">
                <div className="code-focus22" style={{ "--panel-zoom": "1" } as CSSProperties}>
                  <div className="source-file21">
                    <b>request-handler.ts</b>
                    <span>변경 부분 · 합성 예시</span>
                  </div>
                  <div className="code-window21">
                    <div className="code-line21 context21">{"async function handle(request) {"}</div>
                    <div className="code-line21 removed21">− const result = processRequest(request);</div>
                    <div className="code-line21 added21">+ const result = await processRequest(request);</div>
                    <div className="code-line21 context21">
                      {"  return result;"}
                      <br />
                      {"}"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="source-relationship21">
                <b>GitHub에서 원본 확인</b>
                <p>요청 처리 파일의 코드 변경을 확인합니다.</p>
              </div>
              <div className="note-strip">GitHub 화면을 간추린 가상 예시입니다 · CatchU 안에서는 코드를 펼치지 않습니다.</div>
            </div>
          </div>
        </div>
        <DemoPointer />
      </div>
      <p className="caption14" data-caption="">새 탭의 연결된 기록 확인</p>
      <span className="sr-only14">무음 스크롤 시연. 모션 감소 설정에서는 정적 요약을 제공합니다.</span>
    </section>
  );
}
