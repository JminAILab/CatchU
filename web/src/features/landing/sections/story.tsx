import type { CSSProperties, ReactNode } from "react";
import { EvidenceDemo } from "../demos/evidence-demo";
import { PublicationDemo } from "../demos/publication-demo";
import { RecordsDemo } from "../demos/records-demo";
import { VerificationDemo } from "../demos/verification-demo";

type Feature = {
  id: string;
  number: string;
  eyebrow: string;
  title: [string, string];
  /** 넓은 화면의 설명 문단 */
  paragraphs: ReactNode[];
  /** 좁은 화면의 한 줄 설명 */
  mobile: string;
  /** 바로가기 버튼 이름 */
  jump: string;
  demo: ReactNode;
};

const FEATURES: Feature[] = [
  {
    id: "records",
    number: "01",
    eyebrow: "START WITH YOUR WORK",
    title: ["경험의 시작은,", "내 작업 기록."],
    paragraphs: ["GitHub 계정을 연결하고 지원하는 공개 저장소를 선택하세요. 분석에 동의하면 시작합니다."],
    mobile: "GitHub 연결 후 공개 저장소를 선택해 분석에 동의합니다.",
    jump: "기록 연결",
    demo: <RecordsDemo />,
  },
  {
    id: "evidence",
    number: "02",
    eyebrow: "BRING THE EVIDENCE INTO FOCUS",
    title: ["Catch의 내용을,", "근거와 함께 확인."],
    paragraphs: [
      <>
        {"Catch의 내용과 연결된 근거를 함께 살펴봅니다. "}
        <br />
        원본은 GitHub 새 탭에서 엽니다.
      </>,
      "설명이 사실과 다르면 직접 불일치로 표시할 수 있습니다.",
    ],
    mobile: "Catch의 내용과 근거를 함께 봅니다. 원본은 GitHub 새 탭에서 엽니다.",
    jump: "근거 확인",
    demo: <EvidenceDemo />,
  },
  {
    id: "explanation",
    number: "03",
    eyebrow: "CHECK. THEN CHOOSE.",
    title: ["확인한 Catch만,", "내가 선택해 공개."],
    paragraphs: ["작업 사실과 내 기여가 맞는지 보고, 공개할 Catch를 직접 선택합니다. 언제든 다시 숨길 수 있습니다."],
    mobile: "사실과 기여가 맞는지 보고 공개를 켭니다. 다시 숨길 수 있습니다.",
    jump: "공개 선택",
    demo: <VerificationDemo />,
  },
  {
    id: "sharing",
    number: "04",
    eyebrow: "SELECT. COMPOSE. SHARE.",
    title: ["공개한 Catch를,", "링크로."],
    paragraphs: ["공개한 Catch와 선택한 자료를 링크로 발행합니다. 받은 사람은 발행 시점의 사본을 읽고 질문할 수 있습니다. 공유를 끝내려면 링크를 중지하세요."],
    mobile: "사본 링크로 공유합니다. 받은 사람은 읽고 질문할 수 있습니다. 필요하면 링크를 중지하세요.",
    jump: "링크 공유",
    demo: <PublicationDemo />,
  },
];

/** 설명 한 덩어리. 바깥 칸이 자르고 안쪽 칸이 아래에서 올라온다(올라오는 양은 제어 코드가 CSS 변수로 준다). */
function CopyLine({ children }: { children: ReactNode }) {
  return (
    <div className="copy-mask43">
      <div className="copy-text43">{children}</div>
    </div>
  );
}

/**
 * 기능 1~4. 넷이 파란 영역 하나를 같이 쓰고, 스크롤 위치에 맞는 기능 하나만 보인다(playback/story-controller.ts).
 * 스크립트가 꺼져 있으면 고정하지 않고 기능 네 개의 설명과 결과 화면(.summary14)을 차례로 보인다(landing.module.css 끝의 정적 배치 규칙). 바로가기는 그때 감춘다.
 * 바로가기 버튼은 이 구간 안에서만 움직인다. 페이지를 그 기능의 첫 단계로 옮기고 처음부터 다시 보여 준다.
 */
export function Story() {
  return (
    <section className="story shell scroll-story36" id="story" aria-label="기록에서 공유까지, 스크롤로 단계 진행">
      <div className="story-sticky36">
        <nav className="feature-nav42" aria-label="기능 바로가기 및 다시 보기">
          {FEATURES.map((feature, index) => (
            <button type="button" className="feature-jump42" key={feature.id} aria-label={`${index + 1} ${feature.jump}, 처음부터 다시 보기`} title="이 기능을 처음부터 다시 보기">
              <span className="jump-number42">{index + 1}</span>
              <span>{feature.jump}</span>
            </button>
          ))}
        </nav>
        <div className="story-stack36">
          {FEATURES.map((feature) => (
            <article className="feature" id={feature.id} key={feature.id}>
              <div className="feature-copy">
                <div className="copy-motion42">
                  <CopyLine>
                    <p className="eyebrow">
                      <span className="chapter-number">{feature.number}</span>
                      {feature.eyebrow}
                    </p>
                  </CopyLine>
                  <CopyLine>
                    <div className="title-clip21">
                      <h2>
                        <span className="title-line">{feature.title[0]}</span>
                        <em className="title-line">{feature.title[1]}</em>
                      </h2>
                    </div>
                  </CopyLine>
                  {feature.paragraphs.map((paragraph, index) => (
                    <CopyLine key={index}>
                      <p className="copy-paragraph21 desktop-copy39" style={{ "--copy-delay": `${180 + index * 70}ms` } as CSSProperties}>
                        {paragraph}
                      </p>
                    </CopyLine>
                  ))}
                  <CopyLine>
                    <p className="copy-paragraph21 mobile-copy39">{feature.mobile}</p>
                  </CopyLine>
                </div>
              </div>
              <div className="feature-visual">{feature.demo}</div>
            </article>
          ))}
        </div>
        <p className="inner-hint47" hidden />
      </div>
    </section>
  );
}
