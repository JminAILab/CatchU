import { DemoPointer, WindowChrome } from "./demo-parts";

/**
 * 기능 4 스크롤 시연(자료 선택 → 제목 입력 → 발행 → URL 복사 → 받은 사람 첫 화면).
 * 화면 속 버튼·입력·탭은 그림이다(span). 누를 수 없고 어떤 요청도 보내지 않는다.
 * data-target·data-from·data-until 같은 속성은 playback/scene-renderer.ts가 읽는 시간표다.
 */
export function PublicationDemo() {
  return (
    <section aria-label="기능 04 스크롤 시연" className="demo14 demo16 scroll-demo36" data-player="publication">
      <div className="demo-label14">
        <span>스크롤 시연 · 가상 예시</span>
        <span>스크롤로 단계 이동 · 결과 유지</span>
      </div>
      <div className="stage14">
        <div aria-hidden="true" className="frame14" data-scene="0">
          <div className="app-window publication-edit22">
            <WindowChrome>
              CatchU · 가상 예시
            </WindowChrome>
            <div className="publication-viewport22">
              <div className="publication-track22">
                <div className="app-content publication-pane22">
                  <h3>발행할 자료 선택</h3>
                  <p>선택한 순서대로 발행본에 들어갑니다.</p>
                  <div className="checkrow">
                    <span className="check16" data-target="material">
                      <span data-from="1750">✓</span>
                    </span>
                    <span>자기소개 · 텍스트 자료</span>
                  </div>
                  <div className="checkrow">
                    <span className="check16" data-target="catch">
                      <span data-from="3750">✓</span>
                    </span>
                    <span>request-handler.ts 코드 수정 · 공개 Catch</span>
                  </div>
                  <div className="app-panel order16 order21">
                    <b>선택한 항목과 순서</b>
                    <div className="order-rows21">
                      <span className="order-empty21" data-until="1750">아직 선택한 항목이 없습니다.</span>
                      <div>
                        <p data-from="1750">1. 자기소개</p>
                      </div>
                      <div>
                        <p data-from="3750">2. request-handler.ts 코드 수정</p>
                      </div>
                    </div>
                  </div>
                  <p className="editorial22">같은 편집 화면 아래에 제목 입력이 이어집니다.</p>
                </div>
                <div className="app-content publication-pane22">
                  <h3>제목과 비밀번호</h3>
                  <div className="input-label16">발행본 제목</div>
                  <div className="input16" data-cursor-anchor="center" data-target="title">
                    <span data-type="요청 처리 개선 · 작업과 근거" data-type-end="12500" data-type-start="9000" />
                    <span aria-hidden="true" className="text-caret28" data-from="9000" data-until="12500" />
                  </div>
                  <div className="checkrow">
                    <span className="check16" />
                    <span>비밀번호 사용</span>
                  </div>
                  <div className="note-strip">비밀번호 옵션은 사용하지 않음</div>
                  <span className="action16" data-target="next">다음: 발행 내용 확인</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="1">
          <div className="app-window">
            <WindowChrome>
              CatchU · 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>발행 내용 확인</h3>
              <div className="app-panel">
                <b>요청 처리 개선 · 작업과 근거</b>
                <p>1. 자기소개</p>
                <p>2. request-handler.ts 코드 수정</p>
                <p>비밀번호 없음 · 90일 후 만료</p>
              </div>
              <span className="action16" data-disable-after="4800" data-target="issue">발행</span>
              <div data-from="4800">
                <div className="note-strip">발행 중 · 실제 처리 시간을 나타내지 않는 시연</div>
              </div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="2">
          <div className="app-window">
            <WindowChrome>
              CatchU · 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>발행됨</h3>
              <span className="badge green">활성 · 가상 예시</span>
              <h3>요청 처리 개선 · 작업과 근거</h3>
              <div className="url16">https://catchu.dev/s/[예시 토큰]</div>
              <div className="done-actions22">
                <span className="action16" data-target="copy">URL 복사</span>
                <span aria-label="링크 열기 (새 탭) · 합성 표시" className="secondary16 open-link22">링크 열기 ↗</span>
              </div>
              <div data-from="3000">
                <div className="copied16">URL을 복사했습니다.</div>
              </div>
              <div className="note-strip">주소를 전달하면 받은 사람이 링크로 발행본을 엽니다.</div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="3">
          <div className="recipient-cut14">
            <p className="perspective14">받은 사람이 링크를 열면</p>
            <div className="app-window">
              <WindowChrome>
                받은 사람 화면 · 가상 예시
              </WindowChrome>
              <div className="app-content">
                <h3>요청 처리 개선 · 작업과 근거</h3>
                <div className="recipient-guide-preview">
                  <div className="panel-title">이 링크에서 할 수 있는 것</div>
                  <p>보이는 자료는 발행할 때 고정한 내용입니다.</p>
                </div>
              </div>
            </div>
            <p className="cut-note14">받은 사람이 링크를 직접 열었을 때의 화면입니다.</p>
          </div>
        </div>
        <div className="summary14" data-summary="">
          <div className="recipient-cut14">
            <p className="perspective14">받은 사람이 링크를 열면</p>
            <div className="app-window">
              <WindowChrome>
                받은 사람 화면 · 가상 예시
              </WindowChrome>
              <div className="app-content">
                <h3>요청 처리 개선 · 작업과 근거</h3>
                <div className="recipient-guide-preview">
                  <div className="panel-title">이 링크에서 할 수 있는 것</div>
                  <p>보이는 자료는 발행할 때 고정한 내용입니다.</p>
                </div>
              </div>
            </div>
            <p className="cut-note14">받은 사람이 링크를 직접 열었을 때의 화면입니다.</p>
          </div>
        </div>
        <DemoPointer />
      </div>
      <p className="caption14" data-caption="">받은 사람이 링크를 열면 · 임시 3초</p>
      <span className="sr-only14">무음 스크롤 시연. 모션 감소 설정에서는 정적 요약을 제공합니다.</span>
    </section>
  );
}
