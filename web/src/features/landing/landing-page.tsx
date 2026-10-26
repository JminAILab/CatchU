import Link from "next/link";
import { routes } from "@/lib/routes";
import styles from "./landing.module.css";

/**
 * 비로그인 서비스 소개(H-01 비로그인, #384). 홈 흐름 초안 §5.2의 소개·가상 Catch·Google 시작 구성을 따른다.
 * 가상 예시는 고정 설명 콘텐츠이며 실제 사용자·저장소·커밋 주소를 쓰지 않고, 누를 수 있는 동작을 두지 않는다.
 * 시작 버튼은 헤더와 같은 로그인 진입(`/login`)으로만 이동한다. 로그인·분석·공개는 여기서 실행하지 않는다.
 */
export function LandingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>GitHub 기록에서 찾는 나의 경험</p>
          <h1 id="landing-title" className={styles.title}>
            <span className={styles.titleLine}>GitHub의 작업 기록을,</span>
            <em className={styles.titleLine}>내 경험을 설명하는 근거로.</em>
          </h1>
          <p className={styles.definition}>
            Catch는 GitHub의 작업 기록을 작업 단위로 묶고, 기록으로 확인한 내용과 근거를 함께 보여 주는 카드입니다.
          </p>
          <p className={styles.lead}>
            선정된 공개 저장소를 분석해 경험 후보와 근거, 생각해볼 질문과 설명 초안을 Catch로 정리합니다.
          </p>
          <StartAction />
        </div>
        <ExampleCatch />
      </section>

      <section className={styles.steps} aria-labelledby="landing-steps-title">
        <h2 id="landing-steps-title" className={styles.sectionTitle}>Catch로 경험을 정리하는 순서</h2>
        <ol className={styles.stepList}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepText}>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.ending} aria-labelledby="landing-ending-title">
        <h2 id="landing-ending-title" className={styles.endingTitle}>이제, 내 경험을 설명할 차례.</h2>
        <p className={styles.endingText}>작업 기록에서 찾은 Catch를 확인하고, 공개할 것을 골라 링크로 공유하세요.</p>
        <StartAction />
      </section>
    </main>
  );
}

/** 10월 기능 흐름: 기록 → Catch 확인 → 공개 선택 → 링크 공유. 독립 강점 주장·서류 첨부는 10월 범위가 아니라 넣지 않는다. */
const STEPS = [
  {
    title: "GitHub 연결과 저장소 선택",
    text: "GitHub 계정을 연결하고 분석할 공개 저장소를 고릅니다. 분석 안내에 동의하면 분석을 요청합니다.",
  },
  {
    title: "Catch와 근거 확인",
    text: "작업 기록을 묶은 Catch에서 기록으로 확인한 내용과 근거를 봅니다. 내 작업과 다르면 불일치로 표시할 수 있습니다.",
  },
  {
    title: "공개 선택",
    text: "작업 사실과 내 기여를 확인한 Catch만 공개할 수 있습니다. 공개는 따로 고르고, 언제든 다시 숨길 수 있습니다.",
  },
  {
    title: "링크로 공유",
    text: "공유 링크를 발급해 공개한 Catch를 보여 줍니다. 다시 숨긴 Catch는 이미 보낸 링크에서도 보이지 않습니다.",
  },
] as const;

function StartAction() {
  return (
    <div className={styles.action}>
      <Link href={routes.login} className={styles.primaryLink}>Google로 시작하기</Link>
      <p className={styles.note}>
        분석은 GitHub 연결과 저장소 선택·동의 뒤에 시작합니다. 결과 확인과 공개 선택은 별도입니다.
      </p>
    </div>
  );
}

/** 설명용 가상 Catch. 실제 Catch 상세의 최종 배치를 정하는 안이 아니다(초안 §5.2). */
function ExampleCatch() {
  return (
    <section className={styles.example} aria-labelledby="landing-example-title">
      <div className={styles.exampleHeader}>
        <span className={styles.exampleBrand}>Catch</span>
        <span className={styles.fictionBadge}>가상 예시</span>
      </div>
      <p className={styles.exampleKicker}>기록에서 찾은 작업</p>
      <h2 id="landing-example-title" className={styles.exampleTitle}>중복 요청을 줄인 경험</h2>
      <dl className={styles.exampleFields}>
        <div className={styles.exampleField}>
          <dt>기록으로 확인한 내용</dt>
          <dd>요청 처리 파일과 관련 테스트의 변경이 기록돼 있습니다.</dd>
        </div>
        <div className={styles.exampleField}>
          <dt>설명 초안</dt>
          <dd>요청 중 버튼을 잠가 반복 클릭을 줄였습니다.</dd>
        </div>
        <div className={styles.exampleField}>
          <dt>근거 예시</dt>
          <dd>버튼 처리 변경 커밋 · 관련 테스트 변경</dd>
        </div>
        <div className={styles.exampleField}>
          <dt>생각해볼 질문</dt>
          <dd>서버에서도 중복 요청을 막았나요?</dd>
        </div>
      </dl>
      <p className={styles.exampleNotice}>설명용으로 만든 가상 내용이며 실제 분석 결과가 아닙니다.</p>
    </section>
  );
}
