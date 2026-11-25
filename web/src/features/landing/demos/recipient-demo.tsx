import { DemoPointer, WindowChrome } from "./demo-parts";

/**
 * 면접관(받은 사람) 스크롤 시연(소개 읽기 → 근거 펼치기 → 질문 → 답변 → 근거 위치).
 * 화면 속 버튼·입력·탭은 그림이다(span). 누를 수 없고 어떤 요청도 보내지 않는다.
 * data-target·data-from·data-until 같은 속성은 playback/scene-renderer.ts가 읽는 시간표다.
 */
export function RecipientDemo() {
  return (
    <section aria-label="수신자 스크롤 시연" className="demo14 recipient14 demo16 scroll-demo36 scroll-demo44" data-player="recipient">
      <div className="demo-label14">
        <span>스크롤 시연 · 가상 예시</span>
        <span>스크롤로 단계 이동 · 결과 유지</span>
      </div>
      <div className="stage14">
        <div aria-hidden="true" className="frame14" data-scene="0">
          <div className="app-window">
            <WindowChrome>
              받은 사람 · 자료 읽기 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>요청 처리 개선 · 작업과 근거</h3>
              <div className="row-meta intro-meta33">
                <span className="badge">텍스트 자료</span>
                <span>작성자가 선택한 자료</span>
              </div>
              <div className="app-panel read-target22" data-cursor-anchor="center" data-target="intro-read">
                <div className="panel-title">자기소개</div>
                <p>작업 기록을 바탕으로 요청 처리와 테스트 수정 경험을 정리했습니다.</p>
              </div>
              <div className="note-strip">자료 1 / 2 · 직접 작성한 소개</div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="1">
          <div className="app-window">
            <WindowChrome>
              받은 사람 · 공유된 Catch / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>request-handler.ts 코드 수정</h3>
              <span className="badge">Catch</span>
              <div className="fact">
                <span className="inline-label">기록에서 확인한 내용</span>
                <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
              </div>
              <div className="recipient-disclosure22">
                <span className="small-action21" data-target="evidence-disclosure">
                  <span data-until="3650">▸</span>
                  <span data-from="3650">▾</span>
                  {" 근거 자세히 보기"}
                </span>
                <div className="recipient-evidence22" data-from="3650">
                  <div className="evidence-row">
                    <div>
                      <b>요청 처리 변경 커밋</b>
                      <span className="file-line">request-handler.ts · a1b2c3</span>
                    </div>
                    <span className="source-label22">GitHub 근거 열기 (새 탭) ↗</span>
                  </div>
                  <div className="evidence-row">
                    <div>
                      <b>관련 테스트</b>
                      <span className="file-line">request-handler.test.ts · d4e5f6</span>
                    </div>
                    <span className="source-label22">GitHub 근거 열기 (새 탭) ↗</span>
                  </div>
                </div>
              </div>
              <p className="editorial22 keep54">같은 발행본 아래쪽에서 질문할 수 있습니다.</p>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="2">
          <div className="app-window">
            <WindowChrome>
              받은 사람 · 질문 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>발행본에 질문하기</h3>
              <div className="input-label16">질문</div>
              <div className="input16" data-cursor-anchor="center" data-target="question">
                <span data-type="이 작업에서 어떤 파일을 변경했나요?" data-type-end="4750" data-type-start="1250" />
                <span aria-hidden="true" className="text-caret28" data-from="1250" data-until="4750" />
              </div>
              <span className="action16" data-disable-after="8300" data-disable-before="1251" data-target="ask">질문하기</span>
              <div data-from="4750" data-until="8300">
                <p className="status16">입력 완료 · 질문을 보낼 수 있습니다.</p>
              </div>
              <div data-from="8300">
                <p className="status16">답변을 준비하고 있습니다.</p>
                <p className="subtle">가상 예시 · 실제 처리 속도를 뜻하지 않습니다.</p>
              </div>
              <div className="note-strip">질문과 답변은 이 발행본 자료 안에서 다룹니다.</div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="3">
          <div className="app-window">
            <WindowChrome>
              받은 사람 · 답변 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>답변과 근거</h3>
              <div className="qa-question">이 작업에서 어떤 파일을 변경했나요?</div>
              <div className="answer">
                <div className="answer-kicker">답변 · 가상 예시</div>
                <p>요청 처리 파일과 관련 테스트 파일을 변경했습니다.</p>
              </div>
              <blockquote className="quote16">요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</blockquote>
              <span className="action16" data-target="citation">근거 1 · request-handler.ts 코드 수정</span>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="4">
          <div className="app-window">
            <WindowChrome>
              받은 사람 · 발행본 근거 위치 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>답변과 해당 근거 확인</h3>
              <div className="qa-question">이 작업에서 어떤 파일을 변경했나요?</div>
              <p className="answer-summary16">
                <b>답변</b>
                {" · 요청 처리 파일과 관련 테스트 파일을 변경했습니다."}
              </p>
              <div className="app-panel">
                <div className="panel-title">request-handler.ts 코드 수정 · 선택한 근거 위치</div>
                <mark className="evidence-mark16">요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</mark>
              </div>
              <div className="note-strip keep54">근거가 있는 내용으로 이동합니다 · 화면을 간추린 예시</div>
            </div>
          </div>
        </div>
        <div className="summary14" data-summary="">
          <div className="app-window">
            <WindowChrome>
              받은 사람 · 발행본 근거 위치 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>답변과 해당 근거 확인</h3>
              <div className="qa-question">이 작업에서 어떤 파일을 변경했나요?</div>
              <p className="answer-summary16">
                <b>답변</b>
                {" · 요청 처리 파일과 관련 테스트 파일을 변경했습니다."}
              </p>
              <div className="app-panel">
                <div className="panel-title">request-handler.ts 코드 수정 · 선택한 근거 위치</div>
                <mark className="evidence-mark16">요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</mark>
              </div>
              <div className="note-strip keep54">근거가 있는 내용으로 이동합니다 · 화면을 간추린 예시</div>
            </div>
          </div>
        </div>
        <DemoPointer />
      </div>
      <p className="caption14" data-caption="">같은 발행본의 해당 내용 확인</p>
      <span className="sr-only14">무음 스크롤 시연. 모션 감소 설정에서는 각 단계의 결과 화면을 바로 보여 줍니다.</span>
    </section>
  );
}
