import { DemoPointer, RecordIcon, WindowChrome } from "./demo-parts";

/**
 * 대표 자동 시연. 일곱 장면을 세 번 재생한 뒤 세 화면 요약(data-summary)을 남긴다. 장면 전환과 포인터는 playback/hero-player.ts가 움직인다.
 * 화면 속 버튼·입력·탭은 그림이다(span). 누를 수 없고 어떤 요청도 보내지 않는다.
 * data-target·data-from·data-until 같은 속성은 playback/scene-renderer.ts가 읽는 시간표다.
 */
export function HeroDemo() {
  return (
    <section aria-label="대표 자동 시연" className="demo14 hero14 demo16" data-player="hero">
      <div className="demo-label14">
        <span>자동 시연 · 가상 예시</span>
        <span>3회 후 마지막 화면 유지</span>
      </div>
      <p className="brief-note27">이용 흐름을 간략히 표현한 시연입니다.</p>
      <div className="stage14">
        <div aria-hidden="true" className="frame14" data-scene="0">
          <div className="app-window">
            <WindowChrome>
              GitHub 기록 · 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>GitHub 작업 기록</h3>
              <div className="row-meta">
                <span>한 저장소 · 내가 기여한 기록</span>
                <span className="badge">공개 저장소</span>
              </div>
              <h3 className="repo-heading">sample-project</h3>
              <div className="work-row" data-read-from="700" data-read-until="2600">
                <RecordIcon label="변경 기록" />
                <div>
                  <b>요청 처리 로직 수정</b>
                  <div className="file-line">request-handler.ts</div>
                </div>
                <span className="commit">a1b2c3</span>
              </div>
              <div className="work-row" data-read-from="2800" data-read-until="5200">
                <RecordIcon label="변경 기록" />
                <div>
                  <b>중복 요청 테스트 수정</b>
                  <div className="file-line">request-handler.test.ts</div>
                </div>
                <span className="commit">d4e5f6</span>
              </div>
              <p className="note-strip">GitHub에 남긴 작업 기록에서 시작합니다.</p>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="1">
          <div className="app-window selection-window27">
            <WindowChrome>
              CatchU · 저장소 선택 / 가상 예시
            </WindowChrome>
            <div className="app-content selection-pane27">
              <h3>분석할 저장소 선택</h3>
              <p>등록한 저장소에서 분석 대상을 선택하세요.</p>
              <div className="repository-choice26">
                <span aria-label="저장소 단일 선택 · 합성 표시" className="check16 radio19" data-target="repository">
                  <span data-from="2400">●</span>
                </span>
                <b>sample-project</b>
                <span className="badge">공개 저장소</span>
              </div>
              <p className="note-strip">GitHub 연결과 저장소 등록이 완료된 예시입니다.</p>
              <div className="selection-result27">
                <p data-from="2400">
                  {"선택한 저장소: "}
                  <strong>sample-project</strong>
                </p>
              </div>
              <div className="selection-action27">
                <span className="action16" data-disable-before="2400" data-target="analyze-repository">분석하기</span>
              </div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="2">
          <div className="app-window">
            <WindowChrome>
              CatchU · 분석 상태 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <div className="analysis-heading21">
                <h3>연결된 저장소</h3>
              </div>
              <div className="app-panel analysis-card21">
                <b>sample-project</b>
                <div className="analysis-state21">
                  <div data-until="3800">
                    <span className="badge">… 분석 중</span>
                    <p>저장소를 분석하고 있습니다.</p>
                  </div>
                  <div data-from="3800">
                    <span className="badge green">✓ 분석 완료</span>
                    <p>분석을 마쳤습니다. Catch 1개가 준비되었습니다.</p>
                  </div>
                </div>
                <div className="analysis-action21">
                  <span className="action16" data-from="3800" data-target="show-catches">Catch 보기</span>
                </div>
              </div>
              <div className="note-strip">가상 예시 · 실제 분석 시간을 나타내지 않습니다.</div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="3">
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
              <p>상세 보기를 눌러 설명과 근거를 살펴보세요.</p>
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
                  <span className="detail-label22 detail-action28" data-target="detail-open">상세 보기 ›</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="4">
          <div className="app-window fact-detail33">
            <WindowChrome>
              CatchU · Catch 상세 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>request-handler.ts 코드 수정</h3>
              <div className="row-meta">
                <span className="badge">Catch</span>
                <span>
                  <span className="badge">확인 전</span>
                  {" "}
                  <span className="badge">미공개</span>
                </span>
              </div>
              <div className="fact" data-read-from="500" data-read-until="2800">
                <span className="inline-label">기록에서 확인한 내용</span>
                <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
              </div>
              <div className="note-strip">한 저장소에서 내가 기여한 코드 변경을 작업 단위로 묶었습니다.</div>
              <div className="panel-title evidence-title">근거 기록</div>
              <div className="evidence-row" data-read-from="2900" data-read-until="4700">
                <div>
                  <b>요청 처리 변경 커밋</b>
                  <div className="file-line">request-handler.ts · a1b2c3</div>
                </div>
                <span className="source-open49">원본 근거 열기 ↗</span>
              </div>
              <div className="evidence-row" data-read-from="4800" data-read-until="6600">
                <div>
                  <b>관련 테스트</b>
                  <div className="file-line">request-handler.test.ts · d4e5f6</div>
                </div>
                <span className="source-open49">원본 근거 열기 ↗</span>
              </div>
              <p className="source-note49">원본 근거 열기는 GitHub를 새 탭으로 엽니다.</p>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="5">
          <div className="app-window">
            <WindowChrome>
              CatchU · 확인과 공개 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>request-handler.ts 코드 수정</h3>
              <div className="confirm-block">
                <div className="panel-title">내용 확인</div>
                <div data-from="0" data-until="4200">
                  <div className="checkrow">
                    <span className="check16" data-target="facts">
                      <span data-from="1260">✓</span>
                    </span>
                    <span>근거를 보고 작업 사실을 확인했습니다.</span>
                  </div>
                  <div className="checkrow">
                    <span className="check16" data-target="contribution">
                      <span data-from="2460">✓</span>
                    </span>
                    <span>나의 기여 범위를 확인했습니다.</span>
                  </div>
                  <span className="action16" data-disable-before="2460" data-target="confirm">확인 완료</span>
                </div>
                <div data-from="4200">
                  <span className="badge green">확인 완료</span>
                  <p>작업 사실과 나의 기여를 확인했습니다.</p>
                </div>
              </div>
              <div className="public-block">
                <div className="panel-title">공개 선택</div>
                <div data-from="0" data-until="7680">
                  <span className="badge">미공개</span>
                  <p>확인만으로 공개되지 않습니다.</p>
                  <span className="action16" data-disable-before="4200" data-target="publish-catch">지금 공개</span>
                </div>
                <div data-from="7680">
                  <span className="badge green">공개</span>
                  <p>공개를 별도로 선택했습니다.</p>
                  <span className="secondary16">숨기기</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="frame14" data-scene="6">
          <div className="app-window">
            <WindowChrome>
              CatchU · 링크 공유 / 가상 예시
            </WindowChrome>
            <div className="app-content">
              <h3>공개한 Catch를 링크로 공유</h3>
              <div className="app-panel">
                <div className="panel-title">발행할 자료</div>
                <p>request-handler.ts 코드 수정 · 공개 Catch</p>
              </div>
              <div className="share-step49" data-from="0" data-until="1500">
                <span className="action16" data-target="issue">발행</span>
              </div>
              <div className="share-step49" data-from="1500">
                <span className="badge green">발행됨 · 가상 예시</span>
                <div className="url16">https://catchu.dev/s/[예시 토큰]</div>
                <span className="action16" data-target="copy">URL 복사</span>
                <div data-from="4050">
                  <div className="copied16">URL을 복사했습니다.</div>
                </div>
              </div>
              <div className="note-strip">선택한 자료는 발행 시점의 사본으로 공유됩니다.</div>
            </div>
          </div>
        </div>
        <div className="summary14" data-summary="">
          <div className="summary-trio">
            <div className="app-window summary-records33">
              <WindowChrome>
                01 · 작업 기록 연결·분석
              </WindowChrome>
              <div className="app-content mini-product22">
                <div className="mini-head22">
                  <b>sample-project</b>
                  <span className="badge">공개 저장소</span>
                </div>
                <p className="mini-caption22">한 저장소에서 내가 기여한 기록</p>
                <div className="records-scroll33" tabIndex={0} role="region" aria-label="sample-project 작업 기록 6개 · 가상 예시">
                  <div className="mini-record22 related-record33">
                    <RecordIcon />
                    <div>
                      <b>요청 처리 로직 수정</b>
                      <span>request-handler.ts · a1b2c3</span>
                    </div>
                  </div>
                  <div className="mini-record22 related-record33">
                    <RecordIcon />
                    <div>
                      <b>중복 요청 테스트 수정</b>
                      <span>request-handler.test.ts · d4e5f6</span>
                    </div>
                  </div>
                  <div className="mini-record22">
                    <RecordIcon />
                    <div>
                      <b>오류 응답 처리 보완</b>
                      <span>error-handler.ts · e7f8a9</span>
                    </div>
                  </div>
                  <div className="mini-record22">
                    <RecordIcon />
                    <div>
                      <b>입력값 검증 추가</b>
                      <span>request-validator.ts · b2c3d4</span>
                    </div>
                  </div>
                  <div className="mini-record22">
                    <RecordIcon />
                    <div>
                      <b>빈 입력 테스트 추가</b>
                      <span>request-validator.test.ts · c5d6e7</span>
                    </div>
                  </div>
                  <div className="mini-record22">
                    <RecordIcon />
                    <div>
                      <b>API 실행 안내 수정</b>
                      <span>README.md · f8a9b0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="app-window">
              <WindowChrome>
                02 · Catch와 근거 확인
              </WindowChrome>
              <div className="app-content mini-product22">
                <b className="mini-catch-title22">request-handler.ts 코드 수정</b>
                <p className="mini-fact22">요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
                <div className="mini-evidence22">
                  <b>요청 처리 변경 커밋</b>
                  <span>request-handler.ts · a1b2c3</span>
                </div>
                <div className="mini-evidence22">
                  <b>관련 테스트</b>
                  <span>request-handler.test.ts · d4e5f6</span>
                </div>
                <p className="mini-caption22 mini-definition22">한 저장소의 내 코드 변경을 작업 단위로 묶었습니다. 원본은 GitHub 새 탭에서 엽니다.</p>
              </div>
            </div>
            <div className="app-window summary-share49">
              <WindowChrome>
                03 · 공개 선택·링크 공유
              </WindowChrome>
              <div className="app-content mini-product22">
                <b className="mini-catch-title22">request-handler.ts 코드 수정</b>
                <p className="mini-state49">
                  <span className="badge green">확인 완료</span>
                  {" "}
                  <span className="badge green">공개</span>
                </p>
                <p className="mini-fact22">확인한 Catch 중 공개할 것을 직접 선택했습니다.</p>
                <div className="mini-evidence22">
                  <b>공유 링크 · 가상 예시</b>
                  <span>https://catchu.dev/s/[예시 토큰]</span>
                </div>
                <p className="mini-caption22 mini-definition22">선택한 자료는 발행 시점의 사본으로 공유됩니다.</p>
              </div>
            </div>
          </div>
        </div>
        <DemoPointer />
      </div>
      <p className="caption14" data-caption="">GitHub에 남긴 작업 기록에서 시작합니다.</p>
      <span className="sr-only14">무음 자동 시연. 모션 감소 설정에서는 정적 요약을 제공합니다.</span>
    </section>
  );
}
