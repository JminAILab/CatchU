import Image from "next/image";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { Reveal } from "./reveal";
import styles from "./landing.module.css";

/** #457: 자유 스크롤 시안의 시각 요소를 제품 소개에 적용한다. */
export function LandingPage() {
  return <div className={styles.page}>
    <svg className={styles["svg-defs"]} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <symbol id="icon-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" /></symbol>
        <symbol id="icon-down" viewBox="0 0 24 24"><path d="M12 4v16m-6-6 6 6 6-6" /></symbol>
        <symbol id="icon-repo" viewBox="0 0 24 24">
          <path d="M5 4h14v17H6a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Zm0 0v11h14M7 18h8" />
        </symbol>
        <symbol id="icon-code" viewBox="0 0 24 24">
          <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" />
        </symbol>
        <symbol id="icon-file" viewBox="0 0 24 24">
          <path d="M6 3h8l4 4v14H6Zm8 0v5h4M9 12h6m-6 4h6" />
        </symbol>
        <symbol id="icon-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></symbol>
        <symbol id="icon-branch" viewBox="0 0 24 24">
          <circle cx="6" cy="5" r="2" />
          <circle cx="6" cy="19" r="2" />
          <circle cx="18" cy="5" r="2" />
          <path d="M6 7v10m0-3c8 0 12-2 12-7" />
        </symbol>
        <symbol id="icon-link" viewBox="0 0 24 24">
          <path
            d="m9 15 6-6m-6 9-1 1a4.25 4.25 0 0 1-6-6l4-4a4.25 4.25 0 0 1 6 0m0 6a4.25 4.25 0 0 0 6 0l4-4a4.25 4.25 0 0 0-6-6l-1 1"
          />
        </symbol>
        <symbol id="icon-pen" viewBox="0 0 24 24">
          <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Zm0 0 4-1-3-3M13 21h8" />
        </symbol>
        <symbol id="icon-layers" viewBox="0 0 24 24">
          <path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 17l9 5 9-5" />
        </symbol>
      </defs>
    </svg>

    <header className={styles["site-header"]}>
      <div className={styles["header-inner"]}>
        <Link className={styles["brand"]} href={routes.landing} aria-label="CatchU 처음으로"
          ><span className={[styles["brand-art"], styles["brand-art-full"]].join(" ")} aria-hidden="true"
            ><span className={[styles["brand-art"], styles["brand-art-symbol"]].join(" ")}
              ><Image unoptimized
                src="/landing/catchu-logo-transparent-v3.png"
                alt=""
                width={2172}
                height={724}
                decoding="async" /></span
            ><span className={[styles["brand-art"], styles["brand-art-wordmark"]].join(" ")}
              ><Image unoptimized
                src="/landing/catchu-logo-transparent-v3.png"
                alt=""
                width={2172}
                height={724}
                decoding="async" /></span></span></Link
        ><Link className={[styles["primary-button"], styles["header-cta"]].join(" ")} href={routes.login}>
          <span className={styles["google-letter"]} aria-hidden="true">G</span>Google로 시작하기
        </Link>
      </div>
    </header>
    <main id="top" className={styles["top"]}>
      <section className={styles["hero"]} aria-labelledby="landing-title">
        <div className={styles["hero-copy"]}>
          <p className={styles["eyebrow"]}><span className={styles["eyebrow-dot"]}></span>YOUR WORK. YOUR EVIDENCE.</p>
          <h1 id="landing-title">GitHub의 작업 기록을,<br /><em>내 경험을 설명하는 근거로.</em></h1>
          <p className={styles["hero-definition"]}>
            <strong>Catch는 GitHub의 작업 기록을 작업 단위로 묶고,</strong
            ><br className={styles["definition-break"]} />
            확인한 내용과 근거를 함께 보여주는 카드입니다.
          </p>
          <p className={styles["hero-context"]}>
            선정된 공개 저장소에서 경험 후보와 근거,<br className={styles["context-break"]} />생각해 볼 질문과 설명 초안을 확인합니다.
          </p>
        </div>
        <div
          className={styles["hero-product"]}
          role="group"
          aria-label="GitHub 기록과 Catch, 생각해 볼 질문의 가상 예시"
        >
          <div className={styles["hero-floor"]}></div>
          <div className={[styles["hero-annotation"], styles["annotation-source"]].join(" ")}>
            <svg viewBox="0 0 72 74" aria-hidden="true" focusable="false">
              <path className={styles["annotation-curve"]} d="M19 5C45 14 51 43 27 65" />
              <path d="M27 53v12l12-5" />
            </svg>
            <p>GitHub의<br />작업 기록에서</p>
          </div>
          <div className={[styles["mini-source"], styles["product-surface"]].join(" ")}>
            <div className={styles["mini-source-header"]}>
              <svg className={styles["icon"]}><use href="#icon-repo" /></svg><strong>GitHub 기록</strong
              ><span className={styles["window-dot"]}></span>
            </div>
            <div className={styles["mini-source-body"]}>
              <span className={styles["mini-caption"]}>SELECTED REPOSITORY</span
              ><strong className={styles["mini-repo-name"]}>sample-project</strong>
              <div className={[styles["mini-file"], styles["selected"]].join(" ")}>
                <svg className={styles["icon"]}><use href="#icon-code" /></svg><span>요청 처리 로직 수정</span>
              </div>
              <div className={styles["mini-file"]}>
                <svg className={styles["icon"]}><use href="#icon-file" /></svg><span>중복 요청 테스트 수정</span>
              </div>
              <div className={styles["mini-source-foot"]}>
                <svg className={styles["icon"]}><use href="#icon-branch" /></svg>선택한 작업 기록
              </div>
            </div>
          </div>
          <div className={[styles["hero-catch"], styles["product-surface"]].join(" ")}>
            <div className={styles["catch-toolbar"]}>
              <span className={styles["catch-brand"]}
                ><span className={[styles["brand-art"], styles["brand-art-symbol"]].join(" ")} aria-hidden="true"
                  ><Image unoptimized
                    src="/landing/catchu-logo-transparent-v3.png"
                    alt=""
                    width={2172}
                    height={724}
                    decoding="async" /></span
                >Catch</span
              ><span className={styles["fiction-label"]}>가상 예시</span>
            </div>
            <div className={styles["hero-catch-body"]}>
              <div className={styles["content-kicker"]}>기록에서 찾은 작업</div>
              <h2><span className={styles["file-name"]}>request-handler.ts</span><br />코드 수정</h2>
              <div className={styles["hero-fact"]}>
                <span className={styles["fact-line"]} aria-hidden="true"></span>
                <div>
                  <strong>기록에서 확인한 내용</strong>
                  <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
                </div>
              </div>
              <div className={styles["evidence-row"]}>
                <span
                  ><svg className={styles["icon"]}><use href="#icon-code" /></svg>요청 처리 변경 커밋<svg
                    className={[styles["icon"], styles["arrow-mini"]].join(" ")}
                  >
                    <use href="#icon-arrow" /></svg></span
                ><span
                  ><svg className={styles["icon"]}><use href="#icon-file" /></svg>관련 테스트<svg
                    className={[styles["icon"], styles["arrow-mini"]].join(" ")}
                  >
                    <use href="#icon-arrow" /></svg
                ></span>
              </div>
            </div>
          </div>
          <div className={[styles["hero-author"], styles["product-surface"]].join(" ")}>
            <div className={styles["author-bubble-title"]}>
              <span className={styles["avatar-disc"]}>나</span><span>생각해 볼 질문</span
              ><svg className={styles["icon"]}><use href="#icon-pen" /></svg>
            </div>
            <p>서버에서도<br /><strong>중복 요청을 막았나요?</strong></p>
            <span className={styles["bubble-tag"]}>본인만 확인 · 가상 예시</span>
          </div>
          <div className={[styles["hero-annotation"], styles["annotation-context"]].join(" ")}>
            <p>기록만으로 알기 어려운<br />부분을 질문으로 짚어요.</p>
            <svg viewBox="0 0 72 74" aria-hidden="true" focusable="false">
              <path className={styles["annotation-curve"]} d="M19 5C45 14 51 43 27 65" />
              <path d="M27 53v12l12-5" />
            </svg>
          </div>
        </div>
        <a className={styles["explore-link"]} href="#records"
          >Catch로 경험을 설명하는 과정<svg className={styles["icon"]} aria-hidden="true">
            <use href="#icon-down" /></svg
        ></a>
      </section>

      <section id="story" className={styles["story"]} data-mode="static" data-card-motion="timed" aria-label="기록에서 공유까지의 네 단계">
        <div id="stage" className={styles["stage"]}>
          <article className={[styles["story-scene"], styles["scene-records"]].join(" ")} id="records" tabIndex={-1} data-scene="0">
            <div className={[styles["scene-head"], styles["scene-copy"]].join(" ")}>
              <p className={styles["chapter-kicker"]}><span>01</span>START WITH YOUR WORK</p>
              <h2>경험의 시작은, <em>내 작업 기록.</em></h2>
              <p>
                GitHub 계정을 연결하고 지원하는 공개 저장소를 선택하세요. 분석에 동의하면
                시작합니다.
              </p>
            </div>
            <Reveal className={[styles["scene-visual"], styles["records-visual"]].join(" ")}>
              <div className={[styles["workspace"], styles["product-surface"]].join(" ")}>
                <div className={styles["workspace-toolbar"]}>
                  <span className={styles["workspace-brand"]}
                    ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-repo" /></svg>GitHub
                    기록</span
                  ><span className={styles["repo-selection"]}
                    ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-check" /></svg>선택한
                    저장소</span
                  ><span className={styles["fiction-label"]}>가상 예시</span>
                </div>
                <div className={styles["workspace-body"]}>
                  <aside className={styles["workspace-sidebar"]}>
                    <span className={styles["mini-caption"]}>REPOSITORY</span>
                    <div className={styles["sidebar-repo"]}>
                      <span className={styles["repo-square"]}
                        ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-code" /></svg></span
                      ><strong>sample-project</strong>
                    </div>
                    <span className={[styles["sidebar-item"], styles["active"]].join(" ")}
                      ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-branch" /></svg>작업
                      기록</span
                    ><span className={styles["sidebar-item"]}
                      ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-file" /></svg>변경
                      파일</span
                    >
                    <div className={styles["sidebar-footer"]}>가상 저장소</div>
                  </aside>
                  <div className={styles["workspace-content"]}>
                    <div className={styles["workspace-content-head"]}>
                      <h3>작업의 흔적</h3>
                      <span>COMMITS &amp; TESTS</span>
                    </div>
                    <div className={styles["history-row"]}>
                      <span className={styles["history-node"]}
                        ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-code" /></svg
                      ></span>
                      <div className={styles["history-main"]}>
                        <strong>요청 처리 로직 수정</strong>
                        <div className={styles["history-file"]}>
                          <svg className={styles["icon"]} aria-hidden="true"><use href="#icon-file" /></svg
                          >request-handler.ts
                        </div>
                      </div>
                      <span className={styles["commit-hash"]}>a1b2c3</span>
                    </div>
                    <div className={styles["history-row"]}>
                      <span className={[styles["history-node"], styles["pale"]].join(" ")}
                        ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-file" /></svg
                      ></span>
                      <div className={styles["history-main"]}>
                        <strong>중복 요청 테스트 수정</strong>
                        <div className={styles["history-file"]}>
                          <svg className={styles["icon"]} aria-hidden="true"><use href="#icon-file" /></svg
                          >request-handler.test.ts
                        </div>
                      </div>
                      <span className={styles["commit-hash"]}>d4e5f6</span>
                    </div>
                    <div className={styles["workspace-bottom"]}>
                      <span className={styles["live-dot"]} aria-hidden="true"></span>내가 고른 기록에서
                      시작합니다.
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles["record-ticket"]}>
                <svg className={styles["icon"]} aria-hidden="true"><use href="#icon-branch" /></svg
                ><span>코드의 변화가<br /><strong>경험의 단서로.</strong></span>
              </div>
            </Reveal>
          </article>

          <article className={[styles["story-scene"], styles["scene-evidence"]].join(" ")} id="evidence" tabIndex={-1} data-scene="1">
            <div className={[styles["scene-head"], styles["scene-copy"]].join(" ")}>
              <p className={styles["chapter-kicker"]}><span>02</span>BRING THE EVIDENCE INTO FOCUS</p>
              <h2>작업과 근거를, <em>한 장의 Catch로.</em></h2>
              <p className={styles["scene-definition"]}>
                Catch는 GitHub의 작업 기록을 작업 단위로 묶고,<br />확인한 내용과 근거를 함께
                보여주는 카드입니다.
              </p>
            </div>
            <Reveal className={[styles["scene-visual"], styles["evidence-visual"]].join(" ")}>
              <div className={[styles["evidence-connector"], styles["top"]].join(" ")} aria-hidden="true"></div>
              <div className={[styles["evidence-connector"], styles["bottom"]].join(" ")} aria-hidden="true"></div>
              <div className={[styles["focus-catch"], styles["product-surface"]].join(" ")}>
                <div className={styles["catch-toolbar"]}>
                  <span className={styles["catch-brand"]}
                    ><span className={[styles["brand-art"], styles["brand-art-symbol"]].join(" ")} aria-hidden="true"
                      ><Image unoptimized
                        src="/landing/catchu-logo-transparent-v3.png"
                        alt=""
                        width={2172}
                        height={724}
                        decoding="async" /></span
                    >Catch</span
                  ><span className={styles["fiction-label"]}>가상 예시</span>
                </div>
                <div className={styles["focus-body"]}>
                  <span className={styles["content-kicker"]}>기록에서 찾은 작업</span>
                  <h3><span className={styles["file-name"]}>request-handler.ts</span><br />코드 수정</h3>
                  <div className={styles["focus-fact"]}>
                    <strong>기록에서 확인한 내용</strong>
                    <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
                  </div>
                  <div className={styles["generated-notice"]}>
                    <p>제목과 설명은 CatchU가 GitHub 기록에서 자동으로 만들었습니다.</p>
                    <span>가상 시안 예시 · 실제 분석 결과가 아닙니다.</span>
                  </div>
                </div>
              </div>
              <div className={styles["evidence-documents"]}>
                <div className={[styles["evidence-document"], styles["commit-document"]].join(" ")}>
                  <div className={styles["document-heading"]}>
                    <span className={styles["document-number"]}>01</span><span>근거 기록</span
                    ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-code" /></svg>
                  </div>
                  <h3>요청 처리 변경 커밋</h3>
                  <p>request-handler.ts</p>
                  <span className={styles["document-meta"]}
                    >a1b2c3 · 가상 기록<br />기록상 작성자 · sample-dev</span
                  >
                  <div className={styles["document-link"]}>
                    <span>변경 기록</span
                    ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-arrow" /></svg>
                  </div>
                </div>
                <div className={[styles["evidence-document"], styles["test-document"]].join(" ")}>
                  <div className={styles["document-heading"]}>
                    <span className={[styles["document-number"], styles["mint"]].join(" ")}>02</span><span>근거 기록</span
                    ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-file" /></svg>
                  </div>
                  <h3>관련 테스트</h3>
                  <p>request-handler.test.ts</p>
                  <span className={styles["document-meta"]}
                    >d4e5f6 · 가상 기록<br />기록상 작성자 · sample-dev</span
                  >
                  <div className={styles["document-link"]}>
                    <span>테스트 변경</span
                    ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-arrow" /></svg>
                  </div>
                </div>
              </div>
            </Reveal>
          </article>

          <article
            className={[styles["story-scene"], styles["scene-explanation"]].join(" ")}
            id="explanation"
            tabIndex={-1}
            data-scene="2"
          >
            <div className={[styles["scene-head"], styles["scene-copy"]].join(" ")}>
              <p className={styles["chapter-kicker"]}><span>03</span>CHECK. THEN CHOOSE.</p>
              <h2>확인한 것만, <em>내가 골라 공개.</em></h2>
              <p>
                작업 사실과 내 기여를 확인한 Catch만 공개할 수 있습니다. 공개는 따로 고르고, 언제든 다시 숨길 수 있습니다.
              </p>
            </div>
            <Reveal className={[styles["scene-visual"], styles["explanation-visual"]].join(" ")}>
              <div className={[styles["reference-catch"], styles["product-surface"]].join(" ")}>
                <div className={styles["catch-toolbar"]}>
                  <span className={styles["catch-brand"]}
                    ><span className={[styles["brand-art"], styles["brand-art-symbol"]].join(" ")} aria-hidden="true"
                      ><Image unoptimized
                        src="/landing/catchu-logo-transparent-v3.png"
                        alt=""
                        width={2172}
                        height={724}
                        decoding="async" /></span
                    >Catch</span
                  ><span className={styles["fiction-label"]}>가상 예시</span>
                </div>
                <div className={styles["reference-body"]}>
                  <span className={styles["content-kicker"]}>확인할 근거</span>
                  <h3><span className={styles["file-name"]}>request-handler.ts</span><br />코드 수정</h3>
                  <p>요청 처리 파일과 테스트 파일의 변경이 기록돼 있습니다.</p>
                  <div className={styles["reference-evidence"]}>
                    <svg className={styles["icon"]} aria-hidden="true"><use href="#icon-link" /></svg>공개할 내용을 먼저 확인
                  </div>
                </div>
              </div>
              <span className={styles["join-mark"]} aria-hidden="true"
                ><svg className={styles["icon"]}><use href="#icon-arrow" /></svg
              ></span>
              <div className={[styles["explanation-editor"], styles["product-surface"]].join(" ")}>
                <div className={styles["editor-toolbar"]}>
                  <span
                    ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-check" /></svg>확인과 공개 선택</span
                  ><span className={styles["fiction-label"]}>가상 예시</span>
                </div>
                <div className={styles["editor-body"]}>
                  <div className={styles["editor-intro"]}>
                    <span className={[styles["avatar-disc"], styles["large"]].join(" ")}>나</span>
                    <div>
                      <h3>확인한 Catch를 공개합니다</h3>
                      <p>확인만으로는 공개되지 않습니다.</p>
                    </div>
                  </div>
                  <div className={styles["author-field"]}>
                    <span className={styles["field-label"]}>작업 사실 확인</span>
                    <p>근거를 보고 작업 사실을 확인했습니다.</p>
                  </div>
                  <div className={styles["author-field"]}>
                    <span className={styles["field-label"]}>나의 기여 확인</span>
                    <p>
                      나의 기여 범위를 확인했습니다. 확인한 내용 중 공개할 것은 다음 단계에서 따로 고릅니다.
                    </p>
                  </div>
                  <div className={styles["editor-foot"]}>
                    <span className={styles["mint-dot"]} aria-hidden="true"></span>공개는 별도 선택 · 언제든 다시 숨기기
                  </div>
                </div>
              </div>
            </Reveal>
          </article>

          <article className={[styles["story-scene"], styles["scene-sharing"]].join(" ")} id="sharing" tabIndex={-1} data-scene="3">
            <div className={[styles["scene-head"], styles["scene-copy"]].join(" ")}>
              <p className={styles["chapter-kicker"]}><span>04</span>SELECT. COMPOSE. SHARE.</p>
              <h2>공개한 Catch를, <em>링크로.</em></h2>
              <p>
                공유 링크를 발행해 공개한 Catch를 보여 줍니다. 다시 숨긴 Catch는 이미 보낸 링크에서도 보이지 않습니다.
              </p>
            </div>
            <Reveal className={[styles["scene-visual"], styles["sharing-visual"]].join(" ")}>
              <div className={[styles["sharing-connector"], styles["top"]].join(" ")} aria-hidden="true"></div>
              <div className={[styles["sharing-connector"], styles["bottom"]].join(" ")} aria-hidden="true"></div>
              <div className={[styles["chosen-material"], styles["chosen-claim"]].join(" ")}>
                <span className={styles["chosen-check"]}
                  ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-check" /></svg></span
                ><span className={styles["chosen-type"]}>공개한 Catch</span
                ><svg className={[styles["icon"], styles["material-icon"]].join(" ")} aria-hidden="true">
                  <use href="#icon-layers" />
                </svg>
                <h3><span className={styles["file-name"]}>request-handler.ts</span><br />코드 수정</h3>
                <span className={styles["material-footer"]}>확인한 작업 사실과 근거</span>
              </div>
              <div className={[styles["chosen-material"], styles["chosen-file"]].join(" ")}>
                <span className={styles["chosen-check"]}
                  ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-check" /></svg></span
                ><span className={styles["chosen-type"]}>링크 설정</span
                ><svg className={[styles["icon"], styles["material-icon"]].join(" ")} aria-hidden="true"><use href="#icon-file" /></svg>
                <h3>비밀번호 · 선택</h3>
                <span className={styles["material-footer"]}>LINK SETTINGS</span>
              </div>
              <div className={[styles["share-preview"], styles["product-surface"]].join(" ")}>
                <div className={styles["share-chrome"]}>
                  <span className={styles["share-dots"]} aria-hidden="true"><i></i><i></i><i></i></span
                  ><span
                    ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-link" /></svg>받는 사람
                    화면</span
                  ><span className={styles["fiction-label"]}>가상 예시</span>
                </div>
                <div className={styles["share-content"]}>
                  <div className={styles["share-mini-brand"]}>
                    <span className={[styles["brand-art"], styles["brand-art-full"]].join(" ")} role="img" aria-label="CatchU"
                      ><span className={[styles["brand-art"], styles["brand-art-symbol"]].join(" ")}
                        ><Image unoptimized
                          src="/landing/catchu-logo-transparent-v3.png"
                          alt=""
                          width={2172}
                          height={724}
                          decoding="async" /></span
                      ><span className={[styles["brand-art"], styles["brand-art-wordmark"]].join(" ")}
                        ><Image unoptimized
                          src="/landing/catchu-logo-transparent-v3.png"
                          alt=""
                          width={2172}
                          height={724}
                          decoding="async" /></span
                    ></span>
                  </div>
                  <span className={styles["share-kicker"]}>SELECTED WORK &amp; EXPERIENCE</span>
                  <h3>내 경험을<br />설명하는 자료.</h3>
                  <div className={styles["shared-item"]}>
                    <span className={styles["shared-item-icon"]}
                      ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-layers" /></svg
                    ></span>
                    <div>
                      <small>공개한 Catch · 근거 포함</small
                      ><strong>request-handler.ts 코드 수정</strong>
                    </div>
                    <svg className={[styles["icon"], styles["item-arrow"]].join(" ")} aria-hidden="true"><use href="#icon-arrow" /></svg>
                  </div>
                  <div className={styles["shared-item"]}>
                    <span className={[styles["shared-item-icon"], styles["muted"]].join(" ")}
                      ><svg className={styles["icon"]} aria-hidden="true"><use href="#icon-file" /></svg
                    ></span>
                    <div><small>공개 범위</small><strong>숨긴 Catch는 보이지 않습니다.</strong></div>
                    <svg className={[styles["icon"], styles["item-arrow"]].join(" ")} aria-hidden="true"><use href="#icon-arrow" /></svg>
                  </div>
                </div>
              </div>
            </Reveal>
          </article>
        </div>
      </section>

      <section id="ending" tabIndex={-1} className={styles["ending"]} aria-labelledby="ending-title">
        <span className={[styles["ending-mark"], styles["brand-art"], styles["brand-art-symbol"]].join(" ")} role="img" aria-label="CatchU 심볼"
          ><Image unoptimized
            src="/landing/catchu-logo-transparent-v3.png"
            alt=""
            width={2172}
            height={724}
            decoding="async"
        /></span>
        <p className={styles["eyebrow"]}>START WITH YOUR WORK</p>
        <h2 id="ending-title">이제,<br /><em>나를 설명할 차례.</em></h2>
        <p>작업 기록에서 찾은 Catch를 확인하고,<br />공개할 것을 골라 링크로 공유하세요.</p>
        <Link className={[styles["primary-button"], styles["ending-cta"]].join(" ")} href={routes.login}>
          <span className={styles["google-letter"]} aria-hidden="true">G</span>Google로 시작하기<svg
            className={styles["icon"]}
            aria-hidden="true"
          >
            <use href="#icon-arrow" />
          </svg>
        </Link>
      </section>
    </main>
    <footer className={styles["site-footer"]}><p>화면의 작업·계정은 설명을 위한 가상 예시이며 실제 분석 결과가 아닙니다.</p></footer>
    </div>;
}
