import Link from "next/link";
import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import styles from "./landing.module.css";
import { Reveal } from "./reveal";

/**
 * 비로그인 서비스 소개(H-01 비로그인, #384·#395). 홈 흐름 초안 §5.2의 소개·가상 Catch·Google 시작 구성을 따른다.
 * 가운데 제목, 겹친 카드 3장, 스크롤로 들어오는 장면 4개로 이뤄진다. 스크롤은 브라우저 기본 그대로이고 장면을 붙잡지 않는다.
 * 가상 예시는 고정 설명 콘텐츠이며 실제 사용자·저장소·커밋 주소를 쓰지 않고, 누를 수 있는 동작을 두지 않는다.
 * 시작 버튼은 헤더와 같은 로그인 진입(`/login`)으로만 이동한다. 로그인·분석·공개는 여기서 실행하지 않는다.
 */
export function LandingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <p className={styles.eyebrow}>GitHub 기록에서 찾는 나의 경험</p>
        <h1 id="landing-title" className={styles.title}>
          <span className={styles.titleLine}>GitHub의 작업 기록을,</span>
          <em className={styles.titleLine}>내 경험을 설명하는 근거로.</em>
        </h1>
        <p className={styles.definition}>
          Catch는 GitHub의 작업 기록을 작업 단위로 묶고, 기록으로 확인한 내용과 근거를 함께 보여 주는 카드입니다.
        </p>
        <p className={styles.lead}>
          선정된 공개 저장소를 분석해 경험 후보와 근거, 생각해 볼 질문과 설명 초안을 Catch로 정리합니다.
        </p>
        <StartAction />
        <HeroCards />
      </section>

      {SCENES.map((scene, index) => (
        <section key={scene.id} className={styles.scene} aria-labelledby={`${scene.id}-title`}>
          <p className={styles.sceneNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</p>
          <h2 id={`${scene.id}-title`} className={styles.sceneTitle}>{scene.title}</h2>
          <p className={styles.sceneText}>{scene.text}</p>
          <Reveal className={styles.sceneVisual}>{scene.visual}</Reveal>
        </section>
      ))}

      <section className={styles.ending} aria-labelledby="landing-ending-title">
        <h2 id="landing-ending-title" className={styles.endingTitle}>이제, 내 경험을 설명할 차례.</h2>
        <p className={styles.endingText}>작업 기록에서 찾은 Catch를 확인하고, 공개할 것을 골라 링크로 공유하세요.</p>
        <StartAction />
      </section>
    </main>
  );
}

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

/** 가상 예시임을 카드마다 밝힌다. 실제 분석 결과로 읽히지 않게 한다. */
function Fiction() {
  return <span className={styles.fictionBadge}>가상 예시</span>;
}

/**
 * 히어로의 겹친 카드 3장: GitHub 기록 → Catch → 생각해 볼 질문. 읽는 순서(DOM 순서)와 겹침 순서가 같다.
 * 누를 수 있는 요소를 두지 않는다. 760px 이하에서는 겹치지 않고 세로로 쌓는다.
 */
function HeroCards() {
  return (
    <div className={styles.cards} role="group" aria-label="가상 예시 카드 3장">
      <div className={`${styles.cardSlot} ${styles.slotRecord}`}>
        <article className={`${styles.card} ${styles.cardRecord}`} aria-labelledby="hero-record-title">
          <div className={styles.cardHead}><b id="hero-record-title">GitHub 기록</b><Fiction /></div>
          <p className={styles.cardLabel}>선택한 저장소</p>
          <p className={styles.cardStrong}>sample-project</p>
          <ul className={styles.recordList}>
            <li>요청 처리 로직 수정</li>
            <li>중복 요청 테스트 수정</li>
          </ul>
        </article>
        <p className={styles.annotation}>GitHub의 작업 기록에서</p>
      </div>

      <div className={`${styles.cardSlot} ${styles.slotCatch}`}>
        <article className={`${styles.card} ${styles.cardCatch}`} aria-labelledby="hero-catch-title">
          <div className={styles.cardHead}><b>Catch</b><Fiction /></div>
          <p className={styles.cardLabel}>기록에서 찾은 작업</p>
          <h2 id="hero-catch-title" className={styles.cardTitle}>request-handler.ts 코드 수정</h2>
          <div className={styles.field}>
            <span>작업에서 확인된 사실</span>
            요청 처리 파일과 관련 테스트의 변경이 기록돼 있습니다.
          </div>
          <p className={styles.chips}><span>요청 처리 변경 커밋</span><span>관련 테스트</span></p>
          <p className={styles.fictionNote}>설명용으로 만든 가상 내용이며 실제 분석 결과가 아닙니다.</p>
        </article>
      </div>

      <div className={`${styles.cardSlot} ${styles.slotQuestion}`}>
        <p className={styles.annotation}>기록으로 알기 어려운 부분은 질문으로 짚어요.</p>
        <article className={`${styles.card} ${styles.cardQuestion}`} aria-labelledby="hero-question-title">
          <div className={styles.cardHead}><b id="hero-question-title">생각해 볼 질문</b><Fiction /></div>
          <p className={styles.ownerOnly}>본인만 확인</p>
          <p className={styles.cardStrong}>서버에서도 중복 요청을 막았나요?</p>
        </article>
      </div>
    </div>
  );
}

/** 설명용 시각 자료의 공통 틀. 화면 낭독기에는 가상 예시임을 먼저 알린다. */
function Visual({ label, children }: { label: string; children: ReactNode }) {
  return <figure className={styles.figure} aria-label={`가상 예시: ${label}`}>{children}</figure>;
}

/** 10월 기능 흐름: 기록 → Catch 확인 → 공개 선택 → 링크 공유. 독립 강점 주장·서류 첨부는 10월 범위가 아니라 넣지 않는다. */
const SCENES: { id: string; title: string; text: string; visual: ReactNode }[] = [
  {
    id: "scene-record",
    title: "경험의 시작은, 내 작업 기록.",
    text: "GitHub 계정을 연결하고 분석할 공개 저장소를 고릅니다. 분석 안내에 동의하면 분석을 요청합니다.",
    visual: (
      <Visual label="저장소와 작업 기록">
        <div className={styles.cardHead}><b>GitHub 기록</b><Fiction /></div>
        <p className={styles.cardLabel}>선택한 저장소</p>
        <p className={styles.cardStrong}>sample-project</p>
        <ul className={styles.recordList}>
          <li><b>요청 처리 로직 수정</b><span>request-handler.ts</span></li>
          <li><b>중복 요청 테스트 수정</b><span>request-handler.test.ts</span></li>
        </ul>
        <p className={styles.fictionNote}>내가 고른 기록에서 시작합니다.</p>
      </Visual>
    ),
  },
  {
    id: "scene-catch",
    title: "작업과 근거를, 한 장의 Catch로.",
    text: "작업 기록을 묶은 Catch에서 확인된 사실과 근거를 봅니다. 설명이 기록과 맞지 않으면 불일치로 표시할 수 있습니다.",
    visual: (
      <Visual label="Catch와 근거">
        <div className={styles.cardHead}><b>Catch</b><Fiction /></div>
        <h3 className={styles.cardTitle}>request-handler.ts 코드 수정</h3>
        <div className={styles.field}><span>작업에서 확인된 사실</span>요청 처리 파일과 관련 테스트의 변경이 기록돼 있습니다.</div>
        <p className={styles.autoNotice}>제목과 설명은 CatchU가 GitHub 기록에서 자동으로 만들었습니다.</p>
        <div className={styles.twoCols}>
          <div className={styles.field}><span>근거 1</span>요청 처리 변경 커밋<small>기록상 작성자 · 가상 계정</small></div>
          <div className={styles.field}><span>근거 2</span>관련 테스트 변경<small>기록상 작성자 · 가상 계정</small></div>
        </div>
      </Visual>
    ),
  },
  {
    id: "scene-publish",
    title: "확인한 것만, 내가 골라 공개.",
    text: "작업 사실과 내 기여를 확인한 Catch만 공개할 수 있습니다. 공개는 따로 고르고, 언제든 다시 숨길 수 있습니다.",
    visual: (
      <Visual label="확인과 공개 선택">
        <div className={styles.cardHead}><b>request-handler.ts 코드 수정</b><Fiction /></div>
        <ul className={styles.checkList}>
          <li><span className={styles.tick} aria-hidden="true">✓</span>기록에서 확인한 작업이 내 작업과 맞아요.</li>
          <li><span className={styles.tick} aria-hidden="true">✓</span>근거에 나온 커밋이 내 작업 기록이 맞아요.</li>
        </ul>
        <p className={styles.fictionNote}>확인만으로는 공개되지 않습니다. 공개는 다음 단계에서 따로 고릅니다.</p>
        <div className={styles.segment}><span>미공개</span><span className={styles.segmentOn}>공개 설정</span></div>
      </Visual>
    ),
  },
  {
    id: "scene-share",
    title: "공개한 Catch를, 링크로.",
    text: "공유 링크를 발행해 공개한 Catch를 보여 줍니다. 다시 숨긴 Catch는 이미 보낸 링크에서도 보이지 않습니다.",
    visual: (
      <Visual label="링크 발행과 받는 사람 화면">
        <div className={styles.twoCols}>
          <div className={styles.miniCard}>
            <div className={styles.cardHead}><b>링크 발행</b><Fiction /></div>
            <div className={styles.field}><span>링크 제목</span>프론트엔드 경험 공유</div>
            <div className={styles.field}><span>비밀번호 · 선택</span>설정하면 받는 사람이 입력해요</div>
            <span className={styles.fakeButton} aria-hidden="true">링크 발행</span>
          </div>
          <div className={styles.miniCard}>
            <div className={styles.cardHead}><b>받는 사람이 보는 화면</b><Fiction /></div>
            <p className={styles.cardLabel}>공개한 Catch</p>
            <p className={styles.cardStrong}>request-handler.ts 코드 수정</p>
            <p className={styles.fictionNote}>숨긴 Catch는 보이지 않습니다.</p>
          </div>
        </div>
      </Visual>
    ),
  },
];
