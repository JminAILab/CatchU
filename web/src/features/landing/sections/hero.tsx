import { HeroDemo } from "../demos/hero-demo";

/**
 * 첫 화면. 제목(「근거」 강조), 한 줄 설명, Catch 정의, 대표 자동 시연.
 * `id="landing-title"`은 실행 확인(web/scripts/smoke.mjs)과 운영 이미지 검사가 첫 화면을 알아보는 표식이다. 지우지 않는다.
 * 넓고 낮은 화면(높이 647px 이하)에서는 시연이 첫 화면에 들어오지 않으므로 「대표 시연 보기」 링크를 보인다(CSS).
 */
export function Hero() {
  return (
    <section className="hero shell">
      <p className="eyebrow">
        <span className="dot" />
        YOUR WORK. YOUR EVIDENCE.
      </p>
      <h1 id="landing-title">
        <span className="headline-mask35">
          <span className="headline-line34">GitHub의 작업 기록을,</span>
        </span>
        <br />
        <span className="headline-mask35">
          <em className="headline-line34">
            {"내 경험을 설명하는 "}
            <span className="title-evidence33">
              근거
              <span className="title-white33" aria-hidden="true">
                근거
              </span>
            </span>
            로.
          </em>
        </span>
        <svg className="title-pointer33 title-pointer35" aria-hidden="true" viewBox="0 0 24 30">
          <path d="M2 2 L2 23 L8 18 L13 28 L17 26 L12 16 L21 15 Z" />
        </svg>
      </h1>
      <p className="hero-definition">
        {"GitHub 저장소를 분석해 Catch를 만들고, "}
        <br />
        직접 확인한 것만 선택해 면접관에게 링크로 공유합니다.
      </p>
      <p className="hero-catch52">
        <span className="catch-wide53">
          {"Catch는 작업 기록을 작업 단위로 묶어, "}
          <br />
          한 일과 그 근거를 함께 보여주는 카드입니다.
        </span>
        <span className="catch-narrow53">Catch는 작업별 내용과 근거를 담은 카드입니다.</span>
      </p>
      <a className="explore demo-link53" href="#hero-demo">
        {"대표 시연 보기 "}
        <span>↓</span>
      </a>
      <div className="hero-product" data-reveal16="up" id="hero-demo">
        <HeroDemo />
      </div>
      <a className="explore" href="#catch-examples">
        {"Catch 예시 살펴보기 "}
        <span>↓</span>
      </a>
    </section>
  );
}
